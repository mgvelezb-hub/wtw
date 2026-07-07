import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { getROIRelacion } from '@/app/(app)/roi/service'

const TEST_EMAIL = 'test-roi@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('getROIRelacion', () => {
  it('agrupa proyectos por origen y cuenta recompras', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool KPIs', origen: 'Liverpool' } })
    await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool Gemelo', origen: 'Liverpool' } })
    await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool' } })

    const roi = await getROIRelacion(user.id)
    const liverpool = roi.find((r) => r.origen === 'Liverpool')!
    expect(liverpool.recompras).toBe(2)
    expect(liverpool.proyectos).toEqual(expect.arrayContaining(['Liverpool KPIs', 'Liverpool Gemelo']))
  })

  it('devuelve [] si ningún proyecto tiene origen', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    await prisma.project.create({ data: { userId: user.id, nombre: 'X' } })
    expect(await getROIRelacion(user.id)).toEqual([])
  })
})
