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
})
