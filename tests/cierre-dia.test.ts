import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getCierreDia, getPatronDesvios, ventanaCompuerta } from '@/app/(app)/cierre/service'
import { deleteTestUser } from './helpers/cleanup'

// Reconciliación de cierre de día (Fase 1 del plan del council). Lo que se prueba
// aquí es que el hueco entre lo planeado y lo cronometrado se calcule honesto, y
// que el patrón de causas no invente un dominante cuando no hay datos.

const TEST_EMAIL = 'test-cierre@vp.mx'
const FECHA = '2026-08-11'

beforeEach(() => deleteTestUser(TEST_EMAIL))

async function usuario() {
  return prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'Test', passwordHash: 'x' } })
}

async function semana(userId: string) {
  return prisma.week.create({
    data: {
      userId,
      isoWeek: '2026-W33',
      rangoInicio: new Date('2026-08-10'),
      rangoFin: new Date('2026-08-16'),
      factorUsado: 1.4,
    },
  })
}

async function tareaConBloque(
  userId: string,
  weekId: string,
  datos: { titulo: string; planMin: number; segundos?: number; estatus?: 'done' | 'planned' }
) {
  const task = await prisma.task.create({
    data: { userId, weekId, titulo: datos.titulo, estatus: datos.estatus ?? 'planned' },
  })
  await prisma.block.create({
    data: {
      weekId,
      taskId: task.id,
      fecha: new Date(FECHA),
      inicio: '09:00',
      fin: '10:00',
      tipo: 'tarea',
      titulo: datos.titulo,
      planMin: datos.planMin,
    },
  })
  if (datos.segundos) {
    await prisma.timeEntry.create({
      data: { userId, taskId: task.id, seconds: datos.segundos, startedAt: new Date(FECHA) },
    })
  }
  return task
}

describe('getCierreDia', () => {
  it('un día sin nada planeado no truena y no inventa hueco', async () => {
    const user = await usuario()
    const cierre = await getCierreDia(user.id, FECHA)

    expect(cierre.planMin).toBe(0)
    expect(cierre.huecoMin).toBe(0)
    expect(cierre.yaReconciliado).toBe(false)
    expect(cierre.sugerencia).toBeNull()
  })

  it('calcula el hueco entre lo planeado y lo cronometrado', async () => {
    const user = await usuario()
    const w = await semana(user.id)
    await tareaConBloque(user.id, w.id, { titulo: 'modelo de red', planMin: 120, segundos: 1800 })

    const cierre = await getCierreDia(user.id, FECHA)

    expect(cierre.planMin).toBe(120)
    expect(cierre.medidoMin).toBe(30)
    expect(cierre.huecoMin).toBe(90)
  })

  it('el hueco nunca es negativo — cronometrar de más no es un hueco', async () => {
    const user = await usuario()
    const w = await semana(user.id)
    await tareaConBloque(user.id, w.id, { titulo: 'se tardó', planMin: 30, segundos: 7200 })

    const cierre = await getCierreDia(user.id, FECHA)

    expect(cierre.medidoMin).toBe(120)
    expect(cierre.huecoMin).toBe(0)
  })

  it('marca la tarea terminada sin un solo segundo de cronómetro', async () => {
    const user = await usuario()
    const w = await semana(user.id)
    await tareaConBloque(user.id, w.id, { titulo: 'se hizo a ciegas', planMin: 60, estatus: 'done' })
    await tareaConBloque(user.id, w.id, { titulo: 'medida', planMin: 60, segundos: 3600, estatus: 'done' })

    const cierre = await getCierreDia(user.id, FECHA)
    const sinMedir = cierre.tareas.filter((t) => t.hechaSinMedir)

    expect(sinMedir).toHaveLength(1)
    expect(sinMedir[0].titulo).toBe('se hizo a ciegas')
  })

  it('sugiere "trabajé sin cronómetro" para que el cierre tome 60 s', async () => {
    const user = await usuario()
    const w = await semana(user.id)
    await tareaConBloque(user.id, w.id, { titulo: 'a ciegas', planMin: 90, estatus: 'done' })

    const cierre = await getCierreDia(user.id, FECHA)

    expect(cierre.sugerencia?.causa).toBe('trabajo_sin_cronometro')
    expect(cierre.sugerencia?.minutos).toBe(90)
    expect(cierre.sugerencia?.taskId).not.toBeNull()
  })

  it('no sugiere nada si el día ya se reconcilió — sugerir sobre lo clasificado empuja a duplicar', async () => {
    const user = await usuario()
    const w = await semana(user.id)
    await tareaConBloque(user.id, w.id, { titulo: 'a ciegas', planMin: 90, estatus: 'done' })
    await prisma.dayReconciliation.create({ data: { userId: user.id, fecha: new Date(FECHA) } })

    const cierre = await getCierreDia(user.id, FECHA)

    expect(cierre.yaReconciliado).toBe(true)
    expect(cierre.sugerencia).toBeNull()
  })

  it('una tarea partida en dos bloques no cuenta su medición dos veces', async () => {
    const user = await usuario()
    const w = await semana(user.id)
    const task = await tareaConBloque(user.id, w.id, { titulo: 'partida', planMin: 60, segundos: 1800 })
    // El reflow la partió: segundo bloque, MISMA tarea y mismos TimeEntries.
    await prisma.block.create({
      data: {
        weekId: w.id,
        taskId: task.id,
        fecha: new Date(FECHA),
        inicio: '15:00',
        fin: '16:00',
        tipo: 'tarea',
        titulo: 'partida',
        planMin: 60,
      },
    })

    const cierre = await getCierreDia(user.id, FECHA)

    expect(cierre.tareas).toHaveLength(1)
    expect(cierre.planMin).toBe(120)
    // 30 min, no 60: los TimeEntries son de la tarea, no del bloque.
    expect(cierre.medidoMin).toBe(30)
  })

  it('lee los desvíos ya guardados con su stakeholder y su tarea', async () => {
    const user = await usuario()
    const w = await semana(user.id)
    const task = await tareaConBloque(user.id, w.id, { titulo: 'la que se cayó', planMin: 60 })
    const s = await prisma.stakeholder.create({ data: { userId: user.id, nombre: 'Director de Operaciones' } })
    const cierre = await prisma.dayReconciliation.create({ data: { userId: user.id, fecha: new Date(FECHA) } })
    await prisma.desvio.create({
      data: { reconciliationId: cierre.id, causa: 'bomberazo', minutos: 45, stakeholderId: s.id, taskId: task.id },
    })

    const view = await getCierreDia(user.id, FECHA)

    expect(view.desvios).toHaveLength(1)
    expect(view.desvios[0].stakeholderNombre).toBe('Director de Operaciones')
    expect(view.desvios[0].taskTitulo).toBe('la que se cayó')
    expect(view.explicadoMin).toBe(45)
  })

  it('no ve el cierre de otro usuario', async () => {
    const user = await usuario()
    const otro = await prisma.user.create({
      data: { email: 'test-cierre-otro@vp.mx', nombre: 'Otro', passwordHash: 'x' },
    })
    await prisma.dayReconciliation.create({ data: { userId: otro.id, fecha: new Date(FECHA) } })

    const view = await getCierreDia(user.id, FECHA)
    expect(view.yaReconciliado).toBe(false)

    await prisma.dayReconciliation.deleteMany({ where: { userId: otro.id } })
    await prisma.user.delete({ where: { id: otro.id } })
  })
})

describe('getPatronDesvios — la compuerta', () => {
  it('sin días reconciliados no declara dominante', async () => {
    const user = await usuario()
    const patron = await getPatronDesvios(user.id, '2026-07-30', '2026-08-12')

    expect(patron.diasReconciliados).toBe(0)
    expect(patron.dominante).toBeNull()
    expect(patron.totalMin).toBe(0)
  })

  it('un día cerrado SIN desvíos cuenta como reconciliado pero no inventa dominante', async () => {
    const user = await usuario()
    await prisma.dayReconciliation.create({ data: { userId: user.id, fecha: new Date(FECHA) } })

    const patron = await getPatronDesvios(user.id, '2026-07-30', '2026-08-12')

    // Es la diferencia entre "el plan se cumplió" y "no reconcilié".
    expect(patron.diasReconciliados).toBe(1)
    expect(patron.dominante).toBeNull()
  })

  it('reporta la causa dominante por minutos, no por número de renglones', async () => {
    const user = await usuario()
    const c = await prisma.dayReconciliation.create({ data: { userId: user.id, fecha: new Date(FECHA) } })
    // Tres renglones chicos de una causa contra uno grande de otra: gana el tiempo.
    await prisma.desvio.createMany({
      data: [
        { reconciliationId: c.id, causa: 'junta_se_alargo', minutos: 10 },
        { reconciliationId: c.id, causa: 'junta_se_alargo', minutos: 10 },
        { reconciliationId: c.id, causa: 'junta_se_alargo', minutos: 10 },
        { reconciliationId: c.id, causa: 'bomberazo', minutos: 180 },
      ],
    })

    const patron = await getPatronDesvios(user.id, '2026-07-30', '2026-08-12')

    expect(patron.dominante).toBe('bomberazo')
    expect(patron.totalMin).toBe(210)
    expect(patron.porCausa[0].minutos).toBe(180)
    expect(patron.porCausa[0].aQuienToca).toBe('cliente')
  })

  it('atribuye las urgencias a su stakeholder — es el argumento con el cliente', async () => {
    const user = await usuario()
    const s = await prisma.stakeholder.create({ data: { userId: user.id, nombre: 'Gerente de Transporte' } })
    const c = await prisma.dayReconciliation.create({ data: { userId: user.id, fecha: new Date(FECHA) } })
    await prisma.desvio.createMany({
      data: [
        { reconciliationId: c.id, causa: 'bomberazo', minutos: 60, stakeholderId: s.id },
        { reconciliationId: c.id, causa: 'cambio_prioridad_cliente', minutos: 30, stakeholderId: s.id },
        // Sin stakeholder: se agrupa aparte en vez de desaparecer.
        { reconciliationId: c.id, causa: 'bomberazo', minutos: 15 },
        // Trabajar sin cronómetro NO es una urgencia de nadie.
        { reconciliationId: c.id, causa: 'trabajo_sin_cronometro', minutos: 120 },
      ],
    })

    const patron = await getPatronDesvios(user.id, '2026-07-30', '2026-08-12')

    expect(patron.origenUrgencias).toEqual([
      { nombre: 'Gerente de Transporte', minutos: 90 },
      { nombre: 'Sin identificar', minutos: 15 },
    ])
  })

  it('deja fuera los días afuera de la ventana', async () => {
    const user = await usuario()
    const viejo = await prisma.dayReconciliation.create({
      data: { userId: user.id, fecha: new Date('2026-06-01') },
    })
    await prisma.desvio.create({ data: { reconciliationId: viejo.id, causa: 'bomberazo', minutos: 999 } })

    const patron = await getPatronDesvios(user.id, '2026-07-30', '2026-08-12')

    expect(patron.diasReconciliados).toBe(0)
    expect(patron.totalMin).toBe(0)
  })
})

describe('ventanaCompuerta', () => {
  it('son 14 días incluyendo hoy, que es la compuerta de dos semanas del plan', () => {
    const v = ventanaCompuerta(new Date('2026-08-12T00:00:00Z'))
    expect(v.hasta).toBe('2026-08-12')
    expect(v.desde).toBe('2026-07-30')
  })

  it('cruza el cambio de mes sin inventar días', () => {
    const v = ventanaCompuerta(new Date('2026-03-05T00:00:00Z'))
    expect(v.desde).toBe('2026-02-20')
  })
})
