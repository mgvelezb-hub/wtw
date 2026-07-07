import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { computeUtilizacion } from '@/app/api/v1/utilizacion/service'

const TEST_EMAIL = 'test-util@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

async function entry(userId: string, taskId: string, seconds: number) {
  await prisma.timeEntry.create({ data: { userId, taskId, startedAt: new Date(), stoppedAt: new Date(), seconds } })
}

describe('computeUtilizacion', () => {
  it('separa horas en facturable / aliado / interno', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const facturable = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool', tipo: 'facturable' } })
    const interno = await prisma.project.create({ data: { userId: user.id, nombre: 'VP', tipo: 'interno' } })

    const t1 = await prisma.task.create({ data: { userId: user.id, projectId: facturable.id, titulo: 'sow', alcance: 'sow' } })
    const t2 = await prisma.task.create({ data: { userId: user.id, projectId: facturable.id, titulo: 'aliado', alcance: 'aliado' } })
    const t3 = await prisma.task.create({ data: { userId: user.id, projectId: interno.id, titulo: 'interno' } })

    await entry(user.id, t1.id, 3600)
    await entry(user.id, t2.id, 1800)
    await entry(user.id, t3.id, 900)

    const util = await computeUtilizacion(user.id)
    expect(util.facturableHoras).toBeCloseTo(1, 2)
    expect(util.aliadoHoras).toBeCloseTo(0.5, 2)
    expect(util.internoHoras).toBeCloseTo(0.25, 2)
    expect(util.pctFacturable).toBeCloseTo((1 / 1.75) * 100, 1)
  })

  it('devuelve ceros si no hay TimeEntries', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const util = await computeUtilizacion(user.id)
    expect(util.facturableHoras).toBe(0)
    expect(util.pctFacturable).toBe(0)
  })
})
