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
    const ctx = await contextoPlaneacion(user.id, new Date('2026-08-05T12:00:00Z'))

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

    const ctx = await contextoPlaneacion(user.id, new Date('2026-08-05T12:00:00Z'))

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

    const ctx = await contextoPlaneacion(user.id, new Date('2026-08-05T12:00:00Z'))

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

    const ctx = await contextoPlaneacion(user.id, new Date('2026-08-05T12:00:00Z'))

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

    const ctx = await contextoPlaneacion(user.id, new Date('2026-08-05T12:00:00Z'))

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

    const ctx = await contextoPlaneacion(user.id, new Date('2026-08-05T12:00:00Z'))

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

    const ctx = await contextoPlaneacion(user.id, new Date('2026-08-10T12:00:00Z'))

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
})
