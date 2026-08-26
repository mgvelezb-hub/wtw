import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { capacityForWeek } from '@/app/api/v1/capacity/service'

const TEST_EMAIL = 'test-cap@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('capacityForWeek', () => {
  it('calcula horas libres = horario - comida - eventos, para cada día lun-vie', async () => {
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        nombre: 'T',
        passwordHash: 'x',
        horarioInicio: '09:00',
        horarioFin: '18:00',
        comidaInicio: '14:00',
        comidaFin: '15:00',
        bufferPct: 25,
      },
    })
    await prisma.calendarEvent.create({
      data: { userId: user.id, externalId: 'e1', fecha: new Date('2026-07-06'), inicio: '10:00', fin: '11:00', titulo: 'Junta' },
    })
    const cap = await capacityForWeek(user.id, '2026-W28')
    const lunes = cap.dias.find((d) => d.fecha === '2026-07-06')!
    expect(lunes.horasLibres).toBeCloseTo(7, 1) // 9h jornada - 1h comida - 1h junta
    expect(cap.trabajablePlaneable).toBeCloseTo(cap.trabajableTotal * 0.75, 1)
  })

  it('un DayOverride sin horario marca el día como no laborable (0h)', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    await prisma.dayOverride.create({ data: { userId: user.id, fecha: new Date('2026-07-06'), nota: 'Festivo' } })
    const cap = await capacityForWeek(user.id, '2026-W28')
    expect(cap.dias.find((d) => d.fecha === '2026-07-06')!.horasLibres).toBe(0)
  })

  it('devuelve 5 días (lun-vie)', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const cap = await capacityForWeek(user.id, '2026-W28')
    expect(cap.dias).toHaveLength(5)
  })

  // Una junta interna ocupa tiempo real igual que una de Outlook, pero solo las
  // de Outlook restaban capacidad: una reunión de 90 min agendada a mano era
  // tiempo fantasma, y el día se veía más vacío de lo que estaba. /semana ya las
  // contaba como comprometidas — la capacidad era la única de las tres bases que
  // no las veía.
  async function semanaDe(userId: string) {
    return prisma.week.create({
      data: {
        userId,
        isoWeek: '2026-W28',
        rangoInicio: new Date('2026-07-06'),
        rangoFin: new Date('2026-07-10'),
        factorUsado: 1.4,
      },
    })
  }

  it('una junta interna resta capacidad igual que una de Outlook', async () => {
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL, nombre: 'T', passwordHash: 'x',
        horarioInicio: '09:00', horarioFin: '18:00', comidaInicio: '14:00', comidaFin: '15:00',
      },
    })
    const week = await semanaDe(user.id)
    await prisma.block.create({
      data: {
        weekId: week.id, fecha: new Date('2026-07-06'), inicio: '11:00', fin: '12:30',
        tipo: 'junta', titulo: 'Reunión con Mike', planMin: 90,
      },
    })

    const cap = await capacityForWeek(user.id, '2026-W28')
    expect(cap.dias.find((d) => d.fecha === '2026-07-06')!.horasLibres).toBeCloseTo(6.5, 1) // 9h - 1h comida - 1.5h junta
  })

  it('una junta flex también resta: ocupa tiempo aunque no tenga hora acordada', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x', horarioInicio: '09:00', horarioFin: '18:00', comidaInicio: '14:00', comidaFin: '15:00' } })
    const week = await semanaDe(user.id)
    await prisma.block.create({
      data: { weekId: week.id, fecha: new Date('2026-07-07'), inicio: 'flex', fin: 'flex', tipo: 'junta', titulo: 'Revisión del deck', planMin: 60 },
    })

    const cap = await capacityForWeek(user.id, '2026-W28')
    expect(cap.dias.find((d) => d.fecha === '2026-07-07')!.horasLibres).toBeCloseTo(7, 1)
  })

  // El contrato que NO debe romperse: la carga de trabajo se compara CONTRA la
  // capacidad. Si un bloque de tarea también la restara, se contaría dos veces y
  // el día se vería lleno con la mitad del trabajo.
  it('un bloque de TAREA no resta capacidad — eso sería doble conteo contra el planeado', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x', horarioInicio: '09:00', horarioFin: '18:00', comidaInicio: '14:00', comidaFin: '15:00' } })
    const week = await semanaDe(user.id)
    await prisma.block.create({
      data: { weekId: week.id, fecha: new Date('2026-07-06'), inicio: '09:00', fin: '11:00', tipo: 'tarea', titulo: 'Trabajo', planMin: 120 },
    })

    const cap = await capacityForWeek(user.id, '2026-W28')
    expect(cap.dias.find((d) => d.fecha === '2026-07-06')!.horasLibres).toBeCloseTo(8, 1)
  })

  it('no resta las juntas de otro usuario', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x', horarioInicio: '09:00', horarioFin: '18:00', comidaInicio: '14:00', comidaFin: '15:00' } })
    const otro = await prisma.user.create({ data: { email: 'test-cap-otro@vp.mx', nombre: 'O', passwordHash: 'x' } })
    const weekOtro = await prisma.week.create({
      data: { userId: otro.id, isoWeek: '2026-W28', rangoInicio: new Date('2026-07-06'), rangoFin: new Date('2026-07-10'), factorUsado: 1.4 },
    })
    await prisma.block.create({
      data: { weekId: weekOtro.id, fecha: new Date('2026-07-06'), inicio: '11:00', fin: '12:30', tipo: 'junta', titulo: 'Ajena', planMin: 90 },
    })

    const cap = await capacityForWeek(user.id, '2026-W28')
    expect(cap.dias.find((d) => d.fecha === '2026-07-06')!.horasLibres).toBeCloseTo(8, 1)
    await deleteTestUser('test-cap-otro@vp.mx')
  })

  it('la capacidad nunca sale negativa aunque las juntas rebasen la jornada', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x', horarioInicio: '09:00', horarioFin: '18:00', comidaInicio: '14:00', comidaFin: '15:00' } })
    const week = await semanaDe(user.id)
    await prisma.block.create({
      data: { weekId: week.id, fecha: new Date('2026-07-06'), inicio: '09:00', fin: '18:00', tipo: 'junta', titulo: 'Maratón', planMin: 900 },
    })

    const cap = await capacityForWeek(user.id, '2026-W28')
    expect(cap.dias.find((d) => d.fecha === '2026-07-06')!.horasLibres).toBe(0)
  })
})
