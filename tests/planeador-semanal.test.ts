import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createWeekPayload } from '@/app/api/v1/weeks/service'
import { contextoPlaneacion, balance, isoWeekAnterior } from '@/app/(app)/semana/nueva/service'
import { extraerJSON } from '@/app/(app)/semana/nueva/parse-json'
import { deleteTestUser } from './helpers/cleanup'

const TEST_EMAIL = 'test-planeador@vp.mx'

beforeEach(() => deleteTestUser(TEST_EMAIL))

async function usuario() {
  return prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'Test', passwordHash: 'x' } })
}

describe('isoWeekAnterior', () => {
  it('retrocede una semana dentro del mismo año', () => {
    expect(isoWeekAnterior('2026-W32')).toBe('2026-W31')
  })

  it('cruza el año sin inventar W00', () => {
    // El caso que rompe la aritmética de strings: la anterior a la W01 de 2026
    // es la última de 2025, no "2026-W00".
    expect(isoWeekAnterior('2026-W01')).toBe('2025-W52')
  })
})

describe('balance', () => {
  const cap = { dias: [], trabajableTotal: 30, trabajablePlaneable: 25 }

  it('detecta sobrecarga', () => {
    const b = balance(30 * 60, cap)
    expect(b.sobrecargado).toBe(true)
    expect(b.colchonMin).toBe(-5 * 60)
  })

  it('no marca sobrecarga cuando cabe justo', () => {
    const b = balance(25 * 60, cap)
    expect(b.sobrecargado).toBe(false)
    expect(b.colchonMin).toBe(0)
  })

  it('reporta el colchón cuando sobra', () => {
    expect(balance(20 * 60, cap).colchonMin).toBe(5 * 60)
  })
})

describe('extraerJSON', () => {
  it('lee JSON limpio', () => {
    expect(extraerJSON<{ a: number }>('{"a":1}')).toEqual({ a: 1 })
  })

  it('sobrevive a los fences de markdown que el modelo agrega aunque se le prohíba', () => {
    expect(extraerJSON<number[]>('```json\n[1,2]\n```')).toEqual([1, 2])
  })

  it('sobrevive a una frase antes del JSON', () => {
    expect(extraerJSON<{ ok: boolean }>('Claro, aquí va: {"ok":true}')).toEqual({ ok: true })
  })

  it('devuelve null en vez de tirar cuando no hay JSON', () => {
    expect(extraerJSON('no puedo ayudarte con eso')).toBeNull()
  })

  it('devuelve null con JSON malformado', () => {
    expect(extraerJSON('{"a":')).toBeNull()
  })
})

describe('contextoPlaneacion', () => {
  it('sin semana anterior devuelve anterior=null y no truena', async () => {
    const user = await usuario()
    const ctx = await contextoPlaneacion(user.id, new Date('2026-08-05T12:00:00Z'), '2026-W32')

    expect(ctx.anterior).toBeNull()
    expect(ctx.yaPlaneada).toBe(false)
    expect(ctx.factor).toBe(1.4)
  })

  it('trae el backlog ordenado con los urgentes primero', async () => {
    const user = await usuario()
    await prisma.task.create({ data: { userId: user.id, titulo: 'normal', estatus: 'backlog' } })
    await prisma.task.create({ data: { userId: user.id, titulo: 'urge', estatus: 'backlog', urgente: true } })
    // Una tarea ya planeada NO es backlog: no debe aparecer en el vaciado.
    await prisma.task.create({ data: { userId: user.id, titulo: 'ya planeada', estatus: 'planned' } })

    const ctx = await contextoPlaneacion(user.id, new Date('2026-08-05T12:00:00Z'), '2026-W32')

    expect(ctx.backlog.map((t) => t.titulo)).toEqual(['urge', 'normal'])
  })

  it('calcula el recap de la semana anterior con plan, real y factor logrado', async () => {
    const user = await usuario()
    const week = await createWeekPayload(user.id, {
      isoWeek: '2026-W31',
      factorUsado: 1.4,
      wins: [
        { posicion: 1, titulo: 'Win logrado' },
        { posicion: 2, titulo: 'Win fallido' },
      ],
      tasks: [
        { ref: 'a', titulo: 'hecha', winPosicion: 1, estimadoMin: 60, ajustadoMin: 84 },
        { ref: 'b', titulo: 'a medias', winPosicion: 2, estimadoMin: 60, ajustadoMin: 84 },
      ],
      blocks: [],
    })

    const tareas = await prisma.task.findMany({ where: { weekId: week.id }, orderBy: { titulo: 'asc' } })
    const hecha = tareas.find((t) => t.titulo === 'hecha')!
    await prisma.task.update({ where: { id: hecha.id }, data: { estatus: 'done' } })
    // 168 min reales contra 168 planeados (84 + 84) => factor logrado 1.0
    await prisma.timeEntry.create({
      data: { userId: user.id, taskId: hecha.id, startedAt: new Date('2026-08-01T09:00:00Z'), seconds: 168 * 60 },
    })
    await prisma.win.updateMany({ where: { weekId: week.id, posicion: 2 }, data: { estatus: 'fallido' } })

    const ctx = await contextoPlaneacion(user.id, new Date('2026-08-05T12:00:00Z'), '2026-W32')

    expect(ctx.anterior?.isoWeek).toBe('2026-W31')
    expect(ctx.anterior?.planMin).toBe(168)
    expect(ctx.anterior?.realMin).toBe(168)
    expect(ctx.anterior?.factorLogrado).toBe(1)
    expect(ctx.anterior?.tareasHechas).toBe(1)
    expect(ctx.anterior?.tareasSinTerminar).toEqual(['a medias'])
    expect(ctx.anterior?.wins.find((w) => w.posicion === 2)?.estatus).toBe('fallido')
  })

  it('factorLogrado es null cuando no hubo plan medible, no 0', async () => {
    const user = await usuario()
    await createWeekPayload(user.id, {
      isoWeek: '2026-W31',
      factorUsado: 1.4,
      wins: [],
      tasks: [{ ref: 'a', titulo: 'sin estimar' }],
      blocks: [],
    })

    const ctx = await contextoPlaneacion(user.id, new Date('2026-08-05T12:00:00Z'), '2026-W32')

    expect(ctx.anterior?.planMin).toBe(0)
    expect(ctx.anterior?.factorLogrado).toBeNull()
  })
})

describe('createWeekPayload con adoptar', () => {
  it('engancha una tarea del backlog a la semana sin duplicarla', async () => {
    const user = await usuario()
    const pendiente = await prisma.task.create({
      data: { userId: user.id, titulo: 'del backlog', estatus: 'backlog' },
    })

    const week = await createWeekPayload(user.id, {
      isoWeek: '2026-W32',
      factorUsado: 1.4,
      wins: [{ posicion: 1, titulo: 'Win' }],
      tasks: [],
      adoptar: [{ id: pendiente.id, winPosicion: 1, estimadoMin: 60, ajustadoMin: 84 }],
      blocks: [{ fecha: '2026-08-05', inicio: 'flex', fin: 'flex', tipo: 'tarea', taskRef: pendiente.id, titulo: 'del backlog', planMin: 84 }],
    })

    const todas = await prisma.task.findMany({ where: { userId: user.id } })
    expect(todas).toHaveLength(1)

    const adoptada = todas[0]
    expect(adoptada.id).toBe(pendiente.id)
    expect(adoptada.weekId).toBe(week.id)
    expect(adoptada.estatus).toBe('planned')
    expect(adoptada.ajustadoMin).toBe(84)
    expect(adoptada.winId).not.toBeNull()

    const bloques = await prisma.block.findMany({ where: { weekId: week.id } })
    expect(bloques).toHaveLength(1)
    expect(bloques[0].taskId).toBe(pendiente.id)
    expect(bloques[0].inicio).toBe('flex')
  })

  it('no adopta una tarea de otro usuario', async () => {
    const user = await usuario()
    const otro = await prisma.user.create({ data: { email: 'test-planeador-otro@vp.mx', nombre: 'Otro', passwordHash: 'x' } })
    const ajena = await prisma.task.create({ data: { userId: otro.id, titulo: 'ajena', estatus: 'backlog' } })

    await expect(
      createWeekPayload(user.id, {
        isoWeek: '2026-W32',
        factorUsado: 1.4,
        wins: [],
        tasks: [],
        adoptar: [{ id: ajena.id }],
        blocks: [],
      })
    ).rejects.toThrow(/no encontrada/)

    // La transacción se revierte completa: ni semana creada ni tarea robada.
    expect(await prisma.week.findUnique({ where: { userId_isoWeek: { userId: user.id, isoWeek: '2026-W32' } } })).toBeNull()
    expect((await prisma.task.findUniqueOrThrow({ where: { id: ajena.id } })).userId).toBe(otro.id)

    await prisma.task.deleteMany({ where: { userId: otro.id } })
    await prisma.user.delete({ where: { id: otro.id } })
  })

  it('escribe reflexion y desbloqueador en la semana', async () => {
    const user = await usuario()
    const week = await createWeekPayload(user.id, {
      isoWeek: '2026-W32',
      factorUsado: 1.4,
      reflexion: 'se fue el tiempo en juntas',
      desbloqueador: 'cerrar el modelo de costeo',
      wins: [],
      tasks: [],
      blocks: [],
    })

    const guardada = await prisma.week.findUniqueOrThrow({ where: { id: week.id } })
    expect(guardada.reflexion).toBe('se fue el tiempo en juntas')
    expect(guardada.desbloqueador).toBe('cerrar el modelo de costeo')
  })
})

describe('medición incompleta', () => {
  it('marca el factor como no interpretable cuando casi no se cronometró', async () => {
    const user = await usuario()
    const week = await createWeekPayload(user.id, {
      isoWeek: '2026-W31',
      factorUsado: 1.4,
      wins: [],
      tasks: [
        { ref: 'a', titulo: 'a', estimadoMin: 300, ajustadoMin: 420 },
        { ref: 'b', titulo: 'b', estimadoMin: 300, ajustadoMin: 406 },
      ],
      blocks: [],
    })
    // Las dos terminadas, ninguna cronometrada: 826 plan vs 32 real da 0.04, que
    // leído como velocidad es falso. Es el caso real de la W32 de Mau.
    await prisma.task.updateMany({ where: { weekId: week.id }, data: { estatus: 'done' } })
    const una = await prisma.task.findFirstOrThrow({ where: { weekId: week.id } })
    await prisma.timeEntry.create({
      data: { userId: user.id, taskId: una.id, startedAt: new Date('2026-08-01T09:00:00Z'), seconds: 32 * 60 },
    })

    const ctx = await contextoPlaneacion(user.id, new Date('2026-08-05T12:00:00Z'), '2026-W32')

    expect(ctx.anterior?.tareasConTiempo).toBe(1)
    expect(ctx.anterior?.medicionIncompleta).toBe(true)
    expect(ctx.anterior?.factorLogrado).toBe(0.04)
  })

  it('no marca medición incompleta cuando sí se cronometró', async () => {
    const user = await usuario()
    const week = await createWeekPayload(user.id, {
      isoWeek: '2026-W31',
      factorUsado: 1.4,
      wins: [],
      tasks: [{ ref: 'a', titulo: 'a', estimadoMin: 60, ajustadoMin: 84 }],
      blocks: [],
    })
    const t = await prisma.task.findFirstOrThrow({ where: { weekId: week.id } })
    await prisma.task.update({ where: { id: t.id }, data: { estatus: 'done' } })
    await prisma.timeEntry.create({
      data: { userId: user.id, taskId: t.id, startedAt: new Date('2026-08-01T09:00:00Z'), seconds: 84 * 60 },
    })

    const ctx = await contextoPlaneacion(user.id, new Date('2026-08-05T12:00:00Z'), '2026-W32')

    expect(ctx.anterior?.medicionIncompleta).toBe(false)
    expect(ctx.anterior?.factorLogrado).toBe(1)
  })
})

describe('cascarón de semana creado por Mi Día', () => {
  // weekForDate en dnd-actions crea una semana vacía en cuanto Mau arrastra una
  // tarea o sincroniza juntas. Ese cascarón no debe bloquear el planeador ni
  // hacer tronar el guardado por la restricción única (userId, isoWeek).
  async function cascaron(userId: string, isoWeek: string) {
    return prisma.week.create({
      data: { userId, isoWeek, rangoInicio: new Date('2026-08-10'), rangoFin: new Date('2026-08-16'), factorUsado: 1.4, estatus: 'active' },
    })
  }

  it('una semana vacía no cuenta como planeada', async () => {
    const user = await usuario()
    const shell = await cascaron(user.id, '2026-W33')
    await prisma.block.create({
      data: { weekId: shell.id, fecha: new Date('2026-08-10'), inicio: '10:00', fin: '11:00', tipo: 'junta', titulo: 'Junta de Outlook', planMin: 60, orden: 0 },
    })

    const ctx = await contextoPlaneacion(user.id, new Date('2026-08-10T12:00:00Z'), '2026-W33')

    expect(ctx.yaPlaneada).toBe(false)
  })

  it('planear sobre el cascarón lo reutiliza en vez de tronar, y respeta el orden de las juntas', async () => {
    const user = await usuario()
    const shell = await cascaron(user.id, '2026-W33')
    await prisma.block.create({
      data: { weekId: shell.id, fecha: new Date('2026-08-10'), inicio: '10:00', fin: '11:00', tipo: 'junta', titulo: 'Junta de Outlook', planMin: 60, orden: 0 },
    })

    const week = await createWeekPayload(user.id, {
      isoWeek: '2026-W33',
      factorUsado: 1.4,
      reflexion: 'reflexion',
      reutilizarVacia: true,
      wins: [{ posicion: 1, titulo: 'Win' }],
      tasks: [{ ref: 't1', titulo: 'nueva', winPosicion: 1, estimadoMin: 60, ajustadoMin: 84 }],
      blocks: [{ fecha: '2026-08-10', inicio: 'flex', fin: 'flex', tipo: 'tarea', taskRef: 't1', titulo: 'nueva', planMin: 84 }],
    })

    // Misma semana, no una nueva: la junta sincronizada sobrevive.
    expect(week.id).toBe(shell.id)
    expect(week.estatus).toBe('planning')
    expect(week.reflexion).toBe('reflexion')

    const bloques = await prisma.block.findMany({ where: { weekId: week.id }, orderBy: { orden: 'asc' } })
    expect(bloques.map((b) => b.titulo)).toEqual(['Junta de Outlook', 'nueva'])
    expect(bloques[1].orden).toBe(1)

    const semanas = await prisma.week.findMany({ where: { userId: user.id } })
    expect(semanas).toHaveLength(1)
  })

  it('una semana CON plan sí se rechaza, para no duplicar wins ni tareas', async () => {
    const user = await usuario()
    await createWeekPayload(user.id, {
      isoWeek: '2026-W33',
      factorUsado: 1.4,
      wins: [{ posicion: 1, titulo: 'Win real' }],
      tasks: [],
      blocks: [],
    })

    await expect(
      createWeekPayload(user.id, { isoWeek: '2026-W33', factorUsado: 1.4, wins: [{ posicion: 1, titulo: 'otro' }], tasks: [], blocks: [] })
    ).rejects.toThrow(/ya tiene un plan/)

    const wins = await prisma.win.findMany({ where: { week: { userId: user.id } } })
    expect(wins).toHaveLength(1)
  })

  it('sin el opt-in, una semana vacía existente sigue siendo error — protege POST /weeks y la skill', async () => {
    const user = await usuario()
    await prisma.week.create({
      data: { userId: user.id, isoWeek: '2026-W33', rangoInicio: new Date('2026-08-10'), rangoFin: new Date('2026-08-16'), factorUsado: 1.4, estatus: 'active' },
    })

    // Mismo payload que manda /wtw-semana: sin reutilizarVacia. Debe rechazar en
    // vez de sobrescribir en silencio.
    await expect(
      createWeekPayload(user.id, { isoWeek: '2026-W33', factorUsado: 1.4, wins: [], tasks: [], blocks: [] })
    ).rejects.toThrow(/ya existe/)
  })
})

describe('vaciado con trabajo arrastrado', () => {
  // El caso real de Mau: sus pendientes de Cuervo viven como `planned` colgados
  // de la semana anterior y se arrastran día a día en Mi Día. Antes el vaciado
  // solo ofrecía `backlog`, así que salía vacío y el ritual lo habría hecho
  // teclear todo de nuevo.
  it('ofrece las tareas sin terminar de semanas anteriores, marcadas como arrastradas', async () => {
    const user = await usuario()
    const anterior = await createWeekPayload(user.id, {
      isoWeek: '2026-W31',
      factorUsado: 1.4,
      wins: [],
      tasks: [
        { ref: 'a', titulo: 'sigue viva', estimadoMin: 60 },
        { ref: 'b', titulo: 'ya terminada', estimadoMin: 60 },
      ],
      blocks: [],
    })
    const terminada = await prisma.task.findFirstOrThrow({ where: { weekId: anterior.id, titulo: 'ya terminada' } })
    await prisma.task.update({ where: { id: terminada.id }, data: { estatus: 'done' } })
    await prisma.task.create({ data: { userId: user.id, titulo: 'del backlog', estatus: 'backlog' } })

    const ctx = await contextoPlaneacion(user.id, new Date('2026-08-05T12:00:00Z'), '2026-W32')

    const titulos = ctx.backlog.map((t) => t.titulo)
    expect(titulos).toContain('sigue viva')
    expect(titulos).toContain('del backlog')
    // Lo terminado no se re-ofrece.
    expect(titulos).not.toContain('ya terminada')

    expect(ctx.backlog.find((t) => t.titulo === 'sigue viva')?.origen).toBe('arrastrada')
    expect(ctx.backlog.find((t) => t.titulo === 'del backlog')?.origen).toBe('backlog')
  })

  it('no ofrece lo que ya está planeado en la semana QUE SE PLANEA', async () => {
    const user = await usuario()
    await createWeekPayload(user.id, {
      isoWeek: '2026-W32',
      factorUsado: 1.4,
      wins: [],
      tasks: [{ ref: 'a', titulo: 'ya en esta semana', estimadoMin: 60 }],
      blocks: [],
    })

    // Planeando W32: lo que ya vive en W32 no se re-ofrece, o el vaciado lo
    // duplicaría.
    const mismaSemana = await contextoPlaneacion(user.id, new Date('2026-08-05T12:00:00Z'), '2026-W32')
    expect(mismaSemana.backlog.map((t) => t.titulo)).not.toContain('ya en esta semana')

    // Planeando W33, esa misma tarea sin terminar SÍ entra, y como arrastrada:
    // es trabajo vivo que hay que decidir si pasa a la semana que entra. Eso es
    // exactamente para lo que existe el origen 'arrastrada'.
    const siguiente = await contextoPlaneacion(user.id, new Date('2026-08-05T12:00:00Z'), '2026-W33')
    expect(siguiente.backlog.find((t) => t.titulo === 'ya en esta semana')?.origen).toBe('arrastrada')
  })

  it('adoptar una arrastrada la mueve de semana en vez de duplicarla', async () => {
    const user = await usuario()
    const anterior = await createWeekPayload(user.id, {
      isoWeek: '2026-W31',
      factorUsado: 1.4,
      wins: [],
      tasks: [{ ref: 'a', titulo: 'arrastrada', estimadoMin: 60 }],
      blocks: [],
    })
    const tarea = await prisma.task.findFirstOrThrow({ where: { weekId: anterior.id } })

    const nueva = await createWeekPayload(user.id, {
      isoWeek: '2026-W32',
      factorUsado: 1.4,
      wins: [{ posicion: 1, titulo: 'Win' }],
      tasks: [],
      adoptar: [{ id: tarea.id, winPosicion: 1, estimadoMin: 60, ajustadoMin: 84 }],
      blocks: [],
    })

    expect(await prisma.task.count({ where: { userId: user.id } })).toBe(1)
    const movida = await prisma.task.findUniqueOrThrow({ where: { id: tarea.id } })
    expect(movida.weekId).toBe(nueva.id)
  })
})

describe('bloques duplicados al adoptar una arrastrada', () => {
  it('el bloque que dejó el carry se reemplaza por el que decide el planeador', async () => {
    const user = await usuario()
    const anterior = await createWeekPayload(user.id, {
      isoWeek: '2026-W31',
      factorUsado: 1.4,
      wins: [],
      tasks: [{ ref: 'a', titulo: 'arrastrada', estimadoMin: 60 }],
      blocks: [],
    })
    const tarea = await prisma.task.findFirstOrThrow({ where: { weekId: anterior.id } })

    // Cascarón de la semana nueva con el bloque que dejó el carry de Mi Día.
    const shell = await prisma.week.create({
      data: { userId: user.id, isoWeek: '2026-W32', rangoInicio: new Date('2026-08-03'), rangoFin: new Date('2026-08-09'), factorUsado: 1.4, estatus: 'active' },
    })
    await prisma.block.create({
      data: { weekId: shell.id, taskId: tarea.id, fecha: new Date('2026-08-03'), inicio: 'flex', fin: 'flex', tipo: 'tarea', titulo: 'arrastrada', planMin: 84, orden: 0 },
    })

    await createWeekPayload(user.id, {
      isoWeek: '2026-W32',
      factorUsado: 1.4,
      reutilizarVacia: true,
      wins: [{ posicion: 1, titulo: 'Win' }],
      tasks: [],
      adoptar: [{ id: tarea.id, winPosicion: 1, estimadoMin: 60, ajustadoMin: 84 }],
      blocks: [{ fecha: '2026-08-05', inicio: 'flex', fin: 'flex', tipo: 'tarea', taskRef: tarea.id, titulo: 'arrastrada', planMin: 84 }],
    })

    const bloques = await prisma.block.findMany({ where: { weekId: shell.id, taskId: tarea.id } })
    expect(bloques).toHaveLength(1)
    expect(bloques[0].fecha.toISOString().slice(0, 10)).toBe('2026-08-05')
  })
})

// El factor por clase se medía (Task.tipoTrabajo + factor-clase.ts) pero el
// planeador seguía corrigiendo con el promedio global: medir bien y corregir
// mal. Estas pruebas fijan las dos mitades que faltaban — que la clase llegue
// al planeador (guardada o sugerida) y que se persista al crear la semana.
describe('clase de trabajo en el planeador', () => {
  async function tareaTerminada(userId: string, titulo: string, estimadoMin: number, medidoMin: number) {
    const t = await prisma.task.create({
      data: { userId, titulo, estatus: 'done', estimadoMin, tipoTrabajo: 'deck' },
    })
    await prisma.timeEntry.create({
      data: { taskId: t.id, userId, seconds: medidoMin * 60, startedAt: new Date(), stoppedAt: new Date() },
    })
    return t
  }

  it('el contexto trae el factor de la clase que ya tiene muestras suficientes', async () => {
    const user = await usuario()
    // Tres decks planeados a 60 min que tomaron 120: factor de clase 2.0.
    await tareaTerminada(user.id, 'Deck del comité', 60, 120)
    await tareaTerminada(user.id, 'Deck de resultados', 60, 120)
    await tareaTerminada(user.id, 'Deck de negociaciones', 60, 120)

    const ctx = await contextoPlaneacion(user.id)
    expect(ctx.factoresClase.deck).toMatchObject({ factor: 2, muestras: 3 })
    // Sin muestras, la clase no propone corrección: el planeador cae al global.
    expect(ctx.factoresClase.junta?.factor).toBeNull()
  })

  it('sugiere la clase del backlog con el vocabulario del propio usuario', async () => {
    const user = await usuario()
    await tareaTerminada(user.id, 'Deck del comité de negociaciones', 60, 120)
    const pendiente = await prisma.task.create({
      data: { userId: user.id, titulo: 'Deck del comité de septiembre', estatus: 'backlog' },
    })

    const ctx = await contextoPlaneacion(user.id)
    const item = ctx.backlog.find((b) => b.id === pendiente.id)!
    expect(item.tipoTrabajo).toBeNull()
    expect(item.tipoSugerido).toBe('deck')
  })

  it('una tarea que YA trae clase no recibe sugerencia: no se pisa lo que el humano decidió', async () => {
    const user = await usuario()
    await prisma.task.create({
      data: { userId: user.id, titulo: 'Deck del comité', estatus: 'backlog', tipoTrabajo: 'gestion' },
    })

    const ctx = await contextoPlaneacion(user.id)
    expect(ctx.backlog[0]).toMatchObject({ tipoTrabajo: 'gestion', tipoSugerido: null })
  })

  it('createWeekPayload persiste la clase en tareas nuevas y adoptadas', async () => {
    const user = await usuario()
    const delBacklog = await prisma.task.create({
      data: { userId: user.id, titulo: 'Modelo de costeo', estatus: 'backlog' },
    })

    await createWeekPayload(user.id, {
      isoWeek: '2026-W40',
      factorUsado: 1.4,
      wins: [{ posicion: 1, titulo: 'Cerrar el caso' }],
      tasks: [
        { ref: 'n1', titulo: 'Deck del foro', estimadoMin: 60, ajustadoMin: 120, tipoTrabajo: 'deck', dod: [] },
      ],
      adoptar: [{ id: delBacklog.id, estimadoMin: 90, ajustadoMin: 126, tipoTrabajo: 'analisis' }],
      blocks: [],
    })

    const nueva = await prisma.task.findFirstOrThrow({ where: { userId: user.id, titulo: 'Deck del foro' } })
    expect(nueva.tipoTrabajo).toBe('deck')
    // El ajuste de la nueva salió del factor de su clase (2.0), no del global 1.4.
    expect(nueva.ajustadoMin).toBe(120)

    const adoptada = await prisma.task.findUniqueOrThrow({ where: { id: delBacklog.id } })
    expect(adoptada.tipoTrabajo).toBe('analisis')
  })
})

// El planeador solo podía planear la semana EN CURSO (`isoWeekOf(hoy)`),
// mientras el push del ritual del domingo apunta a la que entra: el ritual
// central del producto era imposible desde la UI, y el domingo terminaba en un
// muro que nombraba dos acciones que no ofrecía.
describe('la semana que el planeador planea', () => {
  const DOMINGO = new Date('2026-09-06T23:00:00Z') // 17:00 en México
  const MARTES = new Date('2026-09-08T18:00:00Z')

  it('el domingo por la tarde planea la semana que ARRANCA, no la que termina', async () => {
    const user = await usuario()
    const ctx = await contextoPlaneacion(user.id, DOMINGO)
    // 2026-W36 es la semana que termina ese domingo; W37 la que arranca al día
    // siguiente. Sin esto, el planeador comprobaba el plan de la semana que ya
    // se está viviendo, la encontraba planeada y servía el muro.
    expect(ctx.isoWeek).toBe('2026-W37')
    expect(ctx.isoWeekEnCurso).toBe('2026-W36')
  })

  it('a media semana sigue apuntando a la que entra', async () => {
    const user = await usuario()
    const ctx = await contextoPlaneacion(user.id, MARTES)
    expect(ctx.isoWeek).toBe('2026-W38')
  })

  it('el lunes planea la semana en curso: quien planea el lunes planea el día que empieza', async () => {
    const user = await usuario()
    const ctx = await contextoPlaneacion(user.id, new Date('2026-09-07T15:00:00Z'))
    expect(ctx.isoWeek).toBe('2026-W37')
    expect(ctx.isoWeekEnCurso).toBe('2026-W37')
  })

  it('una semana pedida explícitamente gana sobre el default', async () => {
    const user = await usuario()
    const ctx = await contextoPlaneacion(user.id, DOMINGO, '2026-W40')
    expect(ctx.isoWeek).toBe('2026-W40')
  })

  it('el recap del paso 1 es de la semana anterior a la que se planea', async () => {
    const user = await usuario()
    await createWeekPayload(user.id, {
      isoWeek: '2026-W36',
      factorUsado: 1.4,
      wins: [{ posicion: 1, titulo: 'Cerrar el business case' }],
      tasks: [],
      blocks: [],
    })

    const ctx = await contextoPlaneacion(user.id, DOMINGO)
    // Planeando W37, el AAR mira W36 — la que de verdad acaba de terminar.
    expect(ctx.anterior?.isoWeek).toBe('2026-W36')
    expect(ctx.anterior?.wins.map((w) => w.titulo)).toEqual(['Cerrar el business case'])
    // Y W37 sigue sin plan, así que el planeador NO se bloquea.
    expect(ctx.yaPlaneada).toBe(false)
  })

  it('si la semana objetivo ya tiene plan, ofrece la siguiente como salida', async () => {
    const user = await usuario()
    await createWeekPayload(user.id, {
      isoWeek: '2026-W37',
      factorUsado: 1.4,
      wins: [{ posicion: 1, titulo: 'Ya planeada' }],
      tasks: [],
      blocks: [],
    })

    const ctx = await contextoPlaneacion(user.id, DOMINGO)
    expect(ctx.yaPlaneada).toBe(true)
    // El muro deja de ser un callejón: nombra a dónde ir.
    expect(ctx.isoWeekSiguiente).toBe('2026-W38')
  })
})

describe('borrarSemanaAction (la segunda salida del muro)', () => {
  it('quita el plan pero devuelve al backlog las tareas con su historia', async () => {
    const user = await usuario()
    const conTiempo = await prisma.task.create({
      data: { userId: user.id, titulo: 'Tiene cronómetro', estatus: 'backlog', estimadoMin: 60 },
    })
    await prisma.timeEntry.create({
      data: { taskId: conTiempo.id, userId: user.id, seconds: 3600, startedAt: new Date(), stoppedAt: new Date() },
    })

    await createWeekPayload(user.id, {
      isoWeek: '2026-W41',
      factorUsado: 1.4,
      wins: [{ posicion: 1, titulo: 'Win a borrar' }],
      tasks: [{ ref: 'n', titulo: 'Nacida en el ritual', estimadoMin: 30, dod: [] }],
      adoptar: [{ id: conTiempo.id, estimadoMin: 60 }],
      blocks: [{ fecha: '2026-10-06', inicio: 'flex', fin: 'flex', tipo: 'tarea', taskRef: 'n', titulo: 'B', planMin: 30 }],
      riesgos: [{ riesgo: 'r', defensa: 'd' }],
    })

    const { borrarSemana } = await import('@/app/(app)/semana/nueva/borrar')
    expect(await borrarSemana(user.id, '2026-W41')).toEqual({ ok: true })

    // La semana y todo lo que solo existía dentro de ella se va.
    expect(await prisma.week.findUnique({ where: { userId_isoWeek: { userId: user.id, isoWeek: '2026-W41' } } })).toBeNull()
    expect(await prisma.win.count({ where: { titulo: 'Win a borrar' } })).toBe(0)
    expect(await prisma.block.count({ where: { titulo: 'B' } })).toBe(0)

    // Las tareas NO se destruyen: vuelven al backlog. Borrar horas medidas para
    // poder replanear sería el peor intercambio en una app cuya tesis es que el
    // número sea confiable.
    const devuelta = await prisma.task.findUniqueOrThrow({ where: { id: conTiempo.id } })
    expect(devuelta).toMatchObject({ estatus: 'backlog', weekId: null, winId: null })
    expect(await prisma.timeEntry.count({ where: { taskId: conTiempo.id } })).toBe(1)
    expect(await prisma.task.count({ where: { userId: user.id, titulo: 'Nacida en el ritual' } })).toBe(1)
  })

  it('no borra la semana de otro usuario', async () => {
    const user = await usuario()
    const otro = await prisma.user.create({
      data: { email: 'test-planeador-otro@vp.mx', nombre: 'Otro', passwordHash: 'x' },
    })
    await createWeekPayload(otro.id, {
      isoWeek: '2026-W41',
      factorUsado: 1.4,
      wins: [{ posicion: 1, titulo: 'Ajena' }],
      tasks: [],
      blocks: [],
    })

    const { borrarSemana } = await import('@/app/(app)/semana/nueva/borrar')
    expect(await borrarSemana(user.id, '2026-W41')).toEqual({ error: 'la semana 2026-W41 no existe' })
    expect(await prisma.win.count({ where: { titulo: 'Ajena' } })).toBe(1)

    await deleteTestUser('test-planeador-otro@vp.mx')
  })

  it('rechaza una semana con formato inventado sin tocar nada', async () => {
    const user = await usuario()
    const { borrarSemana } = await import('@/app/(app)/semana/nueva/borrar')
    expect(await borrarSemana(user.id, 'ayer')).toEqual({ error: 'semana inválida' })
  })
})
