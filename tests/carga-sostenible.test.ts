import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { weekRange } from '@/lib/dates'
import { senalesSobrecarga } from '@/lib/carga-sostenible'
import { deleteTestUser } from './helpers/cleanup'

// Semáforo de sobrecarga (JD-R): tres señales calculadas sobre datos que ya
// existen (Block, TimeEntry, DayReconciliation/Desvio). `hoy` es fijo para que
// el cálculo sea determinista — ver src/lib/carga-sostenible.ts para la
// justificación de cada umbral.

const TEST_EMAIL = 'test-carga-sostenible@vp.mx'
const OTRO_EMAIL = 'test-carga-sostenible-otro@vp.mx'

// Jueves. Las 3 semanas ISO anteriores son W33 (10-14 ago), W32 (3-7 ago) y
// W31 (27-31 jul). Los últimos 14 días son 7-20 ago; los 14 previos, 24 jul-6 ago.
const HOY = new Date('2026-08-20T15:00:00Z')

beforeEach(async () => {
  await deleteTestUser(TEST_EMAIL)
  await deleteTestUser(OTRO_EMAIL)
})

async function usuario(email = TEST_EMAIL) {
  return prisma.user.create({ data: { email, nombre: 'Test', passwordHash: 'x' } })
}

// Crea una semana con `cargaMin` de Block.planMin repartidos en un solo bloque
// del lunes. La capacidad por defecto (jornada 09-18, comida 14-15, buffer
// 25%) da 30h = 1800 min planeables por semana sin overrides ni juntas.
async function semanaConCarga(userId: string, isoWeek: string, cargaMin: number) {
  const { inicio, fin } = weekRange(isoWeek)
  const week = await prisma.week.create({
    data: { userId, isoWeek, rangoInicio: inicio, rangoFin: fin, factorUsado: 1.4 },
  })
  await prisma.block.create({
    data: {
      weekId: week.id,
      fecha: inicio,
      inicio: '09:00',
      fin: '10:00',
      tipo: 'tarea',
      titulo: 'carga',
      planMin: cargaMin,
    },
  })
  return week
}

// Hora local de Ciudad de México (UTC-6 fijo, sin DST) codificada directo en el
// offset del ISO string — evita depender de Intl para construir el fixture.
function mx(fecha: string, hhmm: string): Date {
  return new Date(`${fecha}T${hhmm}:00-06:00`)
}

async function timeEntry(userId: string, taskId: string, startedAt: Date, minutos: number) {
  await prisma.timeEntry.create({ data: { userId, taskId, startedAt, seconds: minutos * 60 } })
}

async function tareaSuelta(userId: string, titulo: string) {
  return prisma.task.create({ data: { userId, titulo } })
}

describe('senalesSobrecarga', () => {
  it('sin datos: nivel verde y ninguna señal activa', async () => {
    const user = await usuario()
    const r = await senalesSobrecarga(user.id, HOY)

    expect(r.nivel).toBe('verde')
    expect(r.senales.every((s) => !s.activa)).toBe(true)
  })

  it('sobrecompromiso sostenido: 2 de 3 semanas anteriores por arriba de lo planeable', async () => {
    const user = await usuario()
    await semanaConCarga(user.id, '2026-W33', 2000) // sobre 1800 → sobrecargada
    await semanaConCarga(user.id, '2026-W32', 2000) // sobrecargada
    await semanaConCarga(user.id, '2026-W31', 1000) // bajo 1800 → no sobrecargada

    const r = await senalesSobrecarga(user.id, HOY)
    const senal = r.senales.find((s) => s.clave === 'sobrecompromiso')!

    expect(senal.activa).toBe(true)
    expect(senal.detalle).toContain('2 de 3')
    // Sola, sube a ámbar, no a rojo.
    expect(r.nivel).toBe('ambar')
  })

  it('no marca sobrecompromiso con solo 1 de 3 semanas sobrecargada', async () => {
    const user = await usuario()
    await semanaConCarga(user.id, '2026-W33', 2000) // sobrecargada
    await semanaConCarga(user.id, '2026-W32', 1000)
    await semanaConCarga(user.id, '2026-W31', 1000)

    const r = await senalesSobrecarga(user.id, HOY)
    expect(r.senales.find((s) => s.clave === 'sobrecompromiso')!.activa).toBe(false)
  })

  it('erosión de frontera: minutos fuera de jornada o en fin de semana > 15% en 14 días', async () => {
    const user = await usuario()
    const task = await tareaSuelta(user.id, 'lo que sea')

    // Dentro de jornada, entre semana: 600 min.
    await timeEntry(user.id, task.id, mx('2026-08-10', '10:00'), 300)
    await timeEntry(user.id, task.id, mx('2026-08-11', '10:00'), 300)
    // Fin de semana (sábado 8 ago, dentro de la ventana de 14 días): 180 min.
    await timeEntry(user.id, task.id, mx('2026-08-08', '09:00'), 180)

    const r = await senalesSobrecarga(user.id, HOY)
    const senal = r.senales.find((s) => s.clave === 'erosion_frontera')!

    // 180 / 780 ≈ 23%
    expect(senal.activa).toBe(true)
    expect(senal.detalle).toContain('23%')
  })

  it('no marca erosión de frontera con minutos fuera de jornada por debajo del 15%', async () => {
    const user = await usuario()
    const task = await tareaSuelta(user.id, 'lo que sea')

    await timeEntry(user.id, task.id, mx('2026-08-10', '10:00'), 950)
    await timeEntry(user.id, task.id, mx('2026-08-08', '09:00'), 50) // sábado, 5%

    const r = await senalesSobrecarga(user.id, HOY)
    expect(r.senales.find((s) => s.clave === 'erosion_frontera')!.activa).toBe(false)
  })

  it('espiral: error de estimación y bomberazos suben juntos frente a los 14 días previos', async () => {
    const user = await usuario()

    // Últimos 14 días (7-20 ago): error alto.
    const tRecienteError = await prisma.task.create({
      data: { userId: user.id, titulo: 'reciente', estatus: 'done', estimadoMin: 100, updatedAt: mx('2026-08-15', '12:00') },
    })
    await timeEntry(user.id, tRecienteError.id, mx('2026-08-15', '09:00'), 200) // |200-100|/100 = 1.0

    // 14 días previos (24 jul-6 ago): error bajo.
    const tViejaError = await prisma.task.create({
      data: { userId: user.id, titulo: 'vieja', estatus: 'done', estimadoMin: 100, updatedAt: mx('2026-08-01', '12:00') },
    })
    await timeEntry(user.id, tViejaError.id, mx('2026-08-01', '09:00'), 110) // |110-100|/100 = 0.1

    // Bomberazos: más en los últimos 14 días que en los 14 previos.
    const cReciente = await prisma.dayReconciliation.create({ data: { userId: user.id, fecha: new Date('2026-08-15') } })
    await prisma.desvio.create({ data: { reconciliationId: cReciente.id, causa: 'bomberazo', minutos: 300 } })
    const cVieja = await prisma.dayReconciliation.create({ data: { userId: user.id, fecha: new Date('2026-08-01') } })
    await prisma.desvio.create({ data: { reconciliationId: cVieja.id, causa: 'bomberazo', minutos: 50 } })

    const r = await senalesSobrecarga(user.id, HOY)
    const senal = r.senales.find((s) => s.clave === 'espiral')!

    expect(senal.activa).toBe(true)
    expect(senal.detalle).toContain('300 min')
  })

  it('solo un eje subiendo (error sube, bomberazos no) no cuenta como espiral', async () => {
    const user = await usuario()

    const tReciente = await prisma.task.create({
      data: { userId: user.id, titulo: 'reciente', estatus: 'done', estimadoMin: 100, updatedAt: mx('2026-08-15', '12:00') },
    })
    await timeEntry(user.id, tReciente.id, mx('2026-08-15', '09:00'), 200) // error sube

    const tVieja = await prisma.task.create({
      data: { userId: user.id, titulo: 'vieja', estatus: 'done', estimadoMin: 100, updatedAt: mx('2026-08-01', '12:00') },
    })
    await timeEntry(user.id, tVieja.id, mx('2026-08-01', '09:00'), 110)

    // Bomberazos bajan: 50 recientes contra 300 previos.
    const cReciente = await prisma.dayReconciliation.create({ data: { userId: user.id, fecha: new Date('2026-08-15') } })
    await prisma.desvio.create({ data: { reconciliationId: cReciente.id, causa: 'bomberazo', minutos: 50 } })
    const cVieja = await prisma.dayReconciliation.create({ data: { userId: user.id, fecha: new Date('2026-08-01') } })
    await prisma.desvio.create({ data: { reconciliationId: cVieja.id, causa: 'bomberazo', minutos: 300 } })

    const r = await senalesSobrecarga(user.id, HOY)
    expect(r.senales.find((s) => s.clave === 'espiral')!.activa).toBe(false)
  })

  it('con 2 señales activas el nivel sube a rojo', async () => {
    const user = await usuario()
    await semanaConCarga(user.id, '2026-W33', 2000)
    await semanaConCarga(user.id, '2026-W32', 2000)
    await semanaConCarga(user.id, '2026-W31', 1000)

    const task = await tareaSuelta(user.id, 'lo que sea')
    await timeEntry(user.id, task.id, mx('2026-08-10', '10:00'), 600)
    await timeEntry(user.id, task.id, mx('2026-08-08', '09:00'), 180)

    const r = await senalesSobrecarga(user.id, HOY)

    expect(r.senales.filter((s) => s.activa)).toHaveLength(2)
    expect(r.nivel).toBe('rojo')
  })

  it('no ve las señales de otro usuario', async () => {
    const user = await usuario()
    const otro = await usuario(OTRO_EMAIL)

    // El otro usuario está sobrecargado en las 3 dimensiones.
    await semanaConCarga(otro.id, '2026-W33', 2000)
    await semanaConCarga(otro.id, '2026-W32', 2000)
    const task = await tareaSuelta(otro.id, 'lo que sea')
    await timeEntry(otro.id, task.id, mx('2026-08-08', '09:00'), 1000)

    const r = await senalesSobrecarga(user.id, HOY)

    expect(r.nivel).toBe('verde')
    expect(r.senales.every((s) => !s.activa)).toBe(true)
  })
})
