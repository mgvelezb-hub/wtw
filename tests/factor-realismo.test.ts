import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { computeFactorRealismo } from '@/lib/factor-realismo'

const TEST_EMAIL = 'test-factor@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('computeFactorRealismo', () => {
  it('usa factorManual si hay menos de 3 semanas cerradas', async () => {
    const user = await prisma.user.create({
      data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x', factorManual: 1.4 },
    })
    expect(await computeFactorRealismo(user.id)).toBe(1.4)
  })

  it('promedia real/estimado de tasks completadas cuando hay ≥3 semanas cerradas', async () => {
    const user = await prisma.user.create({
      data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x', factorManual: 1.4 },
    })
    for (let i = 0; i < 3; i++) {
      const week = await prisma.week.create({
        data: {
          userId: user.id,
          isoWeek: `2026-W0${i + 1}`,
          rangoInicio: new Date('2026-01-05'),
          rangoFin: new Date('2026-01-09'),
          factorUsado: 1.4,
          estatus: 'closed',
        },
      })
      const task = await prisma.task.create({
        data: { userId: user.id, weekId: week.id, titulo: `T${i}`, estimadoMin: 60, estatus: 'done' },
      })
      await prisma.timeEntry.create({
        data: { userId: user.id, taskId: task.id, startedAt: new Date(), stoppedAt: new Date(), seconds: 90 * 60 },
      })
    }
    // real=90min, estimado=60min -> ratio 1.5; suavizado 0.6*1.4 + 0.4*1.5 = 1.44
    expect(await computeFactorRealismo(user.id)).toBeCloseTo(1.44, 2)
  })
})
