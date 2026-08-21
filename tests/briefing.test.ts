import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { isoWeekOf, weekRange } from '@/lib/dates'
import { briefingDe } from '@/lib/briefing'
import { getStrandedBlocks } from '@/app/(app)/dia/service'
import { deleteTestUser } from './helpers/cleanup'

// Briefing matutino "Tu arranque" — determinista, sin IA y sin cron: se calcula
// al cargar /dia. Lo que se prueba aquí no es que las secciones existan, sino las
// tres afirmaciones que hacen que la card valga la pena:
//
// 1. Sin nada registrado NO hay briefing. Una card que siempre trae seis líneas
//    —tres de ellas "todo bien"— se aprende a saltar en una semana.
// 2. Cada sección sale de la MISMA definición que ya usa su pantalla dueña
//    (saludDe en /stakeholders, getPatronDesvios en /cierre, getStrandedBlocks
//    en el banner de /dia). Si un umbral cambia allá, cambia aquí.
// 3. Nada de otro usuario se filtra: el briefing es la primera cosa que se lee
//    cada mañana, y una línea ajena ahí destruye la confianza en toda la card.

const TEST_EMAIL = 'test-briefing@vp.mx'
const OTRO_EMAIL = 'test-briefing-otro@vp.mx'

// Jueves 20 de agosto de 2026, fijo. `hoy` se inyecta siempre — un briefing que
// depende del reloj del servidor no se puede probar ni reproducir.
const HOY = new Date('2026-08-20T12:00:00Z')
const HOY_STR = '2026-08-20'
const AYER_STR = '2026-08-19'
const ISO_WEEK = isoWeekOf(HOY)

beforeEach(async () => {
  await deleteTestUser(TEST_EMAIL)
  await deleteTestUser(OTRO_EMAIL)
})

async function usuario(email = TEST_EMAIL) {
  return prisma.user.create({ data: { email, nombre: 'Test', passwordHash: 'x' } })
}

async function semana(userId: string) {
  const { inicio, fin } = weekRange(ISO_WEEK)
  return prisma.week.create({
    data: { userId, isoWeek: ISO_WEEK, rangoInicio: inicio, rangoFin: fin, factorUsado: 1.4 },
  })
}

async function win(weekId: string, posicion: number, titulo: string, siEntonces: string | null = null) {
  return prisma.win.create({ data: { weekId, posicion, titulo, siEntonces } })
}

async function bloqueDeWin(userId: string, weekId: string, winId: string, fecha: string, titulo: string) {
  const task = await prisma.task.create({ data: { userId, weekId, winId, titulo, estatus: 'planned' } })
  await prisma.block.create({
    data: {
      weekId,
      taskId: task.id,
      fecha: new Date(fecha),
      inicio: '09:00',
      fin: '10:00',
      tipo: 'tarea',
      titulo,
      planMin: 60,
    },
  })
  return task
}

// Días antes de HOY, como fecha ISO — para fechar interacciones sin escribirlas
// a mano y equivocarse de mes.
function haceDias(n: number): Date {
  const d = new Date(HOY)
  d.setUTCDate(d.getUTCDate() - n)
  d.setUTCHours(12, 0, 0, 0)
  return d
}

async function stakeholderFrio(
  userId: string,
  nombre: string,
  datos: { diasSinContacto: number; incumplimiento?: boolean; conVariable?: boolean }
) {
  const s = await prisma.stakeholder.create({
    data: { userId, nombre, poder: 2, interes: 2, cadenciaDias: 7 },
  })
  await prisma.stakeholderInteraccion.create({
    data: {
      stakeholderId: s.id,
      fecha: haceDias(datos.diasSinContacto),
      tipo: 'llamada',
      variableConfianza: datos.conVariable ? 'credibilidad' : null,
      esIncumplimiento: datos.incumplimiento ?? false,
    },
  })
  return s
}

describe('briefingDe — sin datos', () => {
  it('un usuario sin nada registrado no produce briefing', async () => {
    const user = await usuario()

    const b = await briefingDe(user.id, HOY, 0)

    expect(b.fecha).toBe(HOY_STR)
    expect(b.primerBloque).toBeNull()
    expect(b.seMovioAyer).toBeNull()
    expect(b.arrastradas).toBeNull()
    expect(b.stakeholdersFrios).toBeNull()
    expect(b.winEnRiesgo).toBeNull()
    expect(b.sobrecarga).toBeNull()
    // Sin esto la card se pinta vacía: marco, título y nada adentro.
    expect(b.hayContenido).toBe(false)
  })
})

describe('briefingDe — primer bloque y arrastradas', () => {
  it('el primer bloque es el primero SIN terminar, no el primero del día', async () => {
    const user = await usuario()
    const week = await semana(user.id)

    const hecha = await prisma.task.create({
      data: { userId: user.id, weekId: week.id, titulo: 'Ya cerrada', estatus: 'done' },
    })
    await prisma.block.create({
      data: {
        weekId: week.id,
        taskId: hecha.id,
        fecha: new Date(HOY_STR),
        inicio: '09:00',
        fin: '10:00',
        tipo: 'tarea',
        titulo: 'Ya cerrada',
        planMin: 60,
      },
    })
    const pendiente = await prisma.task.create({
      data: { userId: user.id, weekId: week.id, titulo: 'Modelo de red', estatus: 'planned' },
    })
    await prisma.block.create({
      data: {
        weekId: week.id,
        taskId: pendiente.id,
        fecha: new Date(HOY_STR),
        inicio: '11:00',
        fin: '13:00',
        tipo: 'tarea',
        titulo: 'Modelo de red',
        planMin: 120,
      },
    })

    const b = await briefingDe(user.id, HOY, 0)

    expect(b.primerBloque).toEqual({ hora: '11:00', titulo: 'Modelo de red', tipo: 'tarea' })
    expect(b.hayContenido).toBe(true)
  })

  it('el conteo de arrastradas es el mismo que alimenta el banner del tablero', async () => {
    const user = await usuario()
    const week = await semana(user.id)
    const vieja = await prisma.task.create({
      data: { userId: user.id, weekId: week.id, titulo: 'De ayer', estatus: 'planned' },
    })
    await prisma.block.create({
      data: {
        weekId: week.id,
        taskId: vieja.id,
        fecha: new Date(AYER_STR),
        inicio: '09:00',
        fin: '10:00',
        tipo: 'tarea',
        titulo: 'De ayer',
        planMin: 60,
      },
    })

    const stranded = await getStrandedBlocks(user.id, HOY_STR)
    const b = await briefingDe(user.id, HOY, stranded.length)

    expect(stranded).toHaveLength(1)
    expect(b.arrastradas).toBe(1)
  })

  it('cero arrastradas no es una línea: se representa como null', async () => {
    const user = await usuario()
    const b = await briefingDe(user.id, HOY, 0)
    expect(b.arrastradas).toBeNull()
  })
})

describe('briefingDe — win en riesgo', () => {
  it('un win pendiente sin bloques restantes sale con su si-entonces', async () => {
    const user = await usuario()
    const week = await semana(user.id)

    const conBloque = await win(week.id, 1, 'Cerrar el SOW')
    await bloqueDeWin(user.id, week.id, conBloque.id, HOY_STR, 'Redactar SOW')
    await win(week.id, 2, 'Entregar el modelo', 'Si se cae la data, entonces corro el escenario base')

    const b = await briefingDe(user.id, HOY, 0)

    expect(b.winEnRiesgo).toEqual({
      posicion: 2,
      titulo: 'Entregar el modelo',
      siEntonces: 'Si se cae la data, entonces corro el escenario base',
    })
  })

  it('un bloque que ya pasó no salva al win — solo cuenta lo que queda por delante', async () => {
    const user = await usuario()
    const week = await semana(user.id)
    const w = await win(week.id, 1, 'Entregar el modelo')
    await bloqueDeWin(user.id, week.id, w.id, AYER_STR, 'Avance de ayer')

    const b = await briefingDe(user.id, HOY, 0)

    expect(b.winEnRiesgo?.posicion).toBe(1)
  })

  it('un win ya logrado sin bloques no es un riesgo, es un win', async () => {
    const user = await usuario()
    const week = await semana(user.id)
    const w = await win(week.id, 1, 'Entregar el modelo')
    await prisma.win.update({ where: { id: w.id }, data: { estatus: 'logrado' } })

    const b = await briefingDe(user.id, HOY, 0)

    expect(b.winEnRiesgo).toBeNull()
  })
})

describe('briefingDe — stakeholders que se enfrían', () => {
  it('un stakeholder frío aparece con la acción concreta, no solo con la etiqueta', async () => {
    const user = await usuario()
    await stakeholderFrio(user.id, 'Carlos Sierra', { diasSinContacto: 30, conVariable: true })

    const b = await briefingDe(user.id, HOY, 0)

    expect(b.stakeholdersFrios).toHaveLength(1)
    const s = b.stakeholdersFrios![0]
    expect(s.nombre).toBe('Carlos Sierra')
    expect(s.etiqueta).toBe('fria')
    expect(s.etiquetaLabel).toBe('fría')
    expect(s.diasSinContacto).toBe(30)
    // El qué hacer, no solo el está frío: la variable de la Trust Equation menos
    // trabajada. Con un solo contacto de credibilidad, la que falta es la
    // siguiente de la ecuación.
    expect(s.tocaContactoDe).toBe('confiabilidad')
    expect(s.siguienteAccion).toContain('cadencia de 7d')
  })

  it('trae dos como máximo, y primero el que tiene un incumplimiento sin compensar', async () => {
    const user = await usuario()
    // Fría por cadencia, con un contacto positivo que le sube el score.
    await stakeholderFrio(user.id, 'Ana', { diasSinContacto: 30, conVariable: true })
    // Fría por cadencia y sin nada que la compense: score más bajo que Ana.
    await stakeholderFrio(user.id, 'Beto', { diasSinContacto: 40 })
    // Al día en cadencia, pero con una promesa rota: eso manda sobre la cadencia.
    await stakeholderFrio(user.id, 'Carla', { diasSinContacto: 3, incumplimiento: true })

    const b = await briefingDe(user.id, HOY, 0)

    expect(b.stakeholdersFrios?.map((s) => s.nombre)).toEqual(['Carla', 'Beto'])
    expect(b.stakeholdersFrios![0].etiqueta).toBe('en_riesgo')
  })

  it('una relación al día no aparece', async () => {
    const user = await usuario()
    await stakeholderFrio(user.id, 'Al día', { diasSinContacto: 2, conVariable: true })

    const b = await briefingDe(user.id, HOY, 0)

    expect(b.stakeholdersFrios).toBeNull()
  })
})

describe('briefingDe — qué movió el plan', () => {
  it('reporta la causa dominante del último cierre con desvíos', async () => {
    const user = await usuario()
    const cierre = await prisma.dayReconciliation.create({
      data: { userId: user.id, fecha: new Date(AYER_STR) },
    })
    await prisma.desvio.createMany({
      data: [
        { reconciliationId: cierre.id, causa: 'junta_se_alargo', minutos: 90 },
        { reconciliationId: cierre.id, causa: 'trabajo_sin_cronometro', minutos: 30 },
      ],
    })

    const b = await briefingDe(user.id, HOY, 0)

    expect(b.seMovioAyer).not.toBeNull()
    expect(b.seMovioAyer!.fecha).toBe(AYER_STR)
    expect(b.seMovioAyer!.esAyer).toBe(true)
    expect(b.seMovioAyer!.causa).toBe('junta_se_alargo')
    expect(b.seMovioAyer!.minutos).toBe(90)
    expect(b.seMovioAyer!.label.length).toBeGreaterThan(0)
  })

  it('un cierre sin desvíos no es noticia', async () => {
    const user = await usuario()
    await prisma.dayReconciliation.create({ data: { userId: user.id, fecha: new Date(AYER_STR) } })

    const b = await briefingDe(user.id, HOY, 0)

    expect(b.seMovioAyer).toBeNull()
  })
})

describe('briefingDe — aislamiento entre usuarios', () => {
  it('nada de otro usuario se cuela en el briefing', async () => {
    const user = await usuario()
    const otro = await usuario(OTRO_EMAIL)

    const semanaOtro = await semana(otro.id)
    await win(semanaOtro.id, 1, 'Win del otro', 'si-entonces del otro')
    await stakeholderFrio(otro.id, 'Stakeholder del otro', { diasSinContacto: 40 })
    const cierreOtro = await prisma.dayReconciliation.create({
      data: { userId: otro.id, fecha: new Date(AYER_STR) },
    })
    await prisma.desvio.create({
      data: { reconciliationId: cierreOtro.id, causa: 'bomberazo', minutos: 120 },
    })
    const tareaOtro = await prisma.task.create({
      data: { userId: otro.id, weekId: semanaOtro.id, titulo: 'Bloque del otro', estatus: 'planned' },
    })
    await prisma.block.create({
      data: {
        weekId: semanaOtro.id,
        taskId: tareaOtro.id,
        fecha: new Date(HOY_STR),
        inicio: '09:00',
        fin: '10:00',
        tipo: 'tarea',
        titulo: 'Bloque del otro',
        planMin: 60,
      },
    })

    const b = await briefingDe(user.id, HOY, 0)

    expect(b.hayContenido).toBe(false)
    expect(b.primerBloque).toBeNull()
    expect(b.seMovioAyer).toBeNull()
    expect(b.stakeholdersFrios).toBeNull()
    expect(b.winEnRiesgo).toBeNull()
  })
})
