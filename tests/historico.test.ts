import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { getHistorico } from '@/app/(app)/historico/service'

const TEST_EMAIL = 'test-historico@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('getHistorico', () => {
  it('lista semanas cerradas con factor, wins logrados y total', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const week = await prisma.week.create({
      data: {
        userId: user.id,
        isoWeek: '2026-W20',
        rangoInicio: new Date('2026-05-11'),
        rangoFin: new Date('2026-05-15'),
        factorUsado: 1.4,
        estatus: 'closed',
      },
    })
    await prisma.win.create({ data: { weekId: week.id, posicion: 1, titulo: 'W1', estatus: 'logrado' } })
    await prisma.win.create({ data: { weekId: week.id, posicion: 2, titulo: 'W2', estatus: 'pendiente' } })

    const historico = await getHistorico(user.id)
    expect(historico).toHaveLength(1)
    expect(historico[0].isoWeek).toBe('2026-W20')
    expect(historico[0].winsLogrados).toBe(1)
    expect(historico[0].winsTotal).toBe(2)
    expect(historico[0].factorUsado).toBe(1.4)
  })

  it('no incluye semanas en planning/active', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    await prisma.week.create({
      data: { userId: user.id, isoWeek: '2026-W28', rangoInicio: new Date(), rangoFin: new Date(), factorUsado: 1.4, estatus: 'active' },
    })
    expect(await getHistorico(user.id)).toHaveLength(0)
  })
})
