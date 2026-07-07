import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { getCoberturaCompetencias } from '@/app/(app)/desarrollo/service'

const TEST_EMAIL = 'test-dev@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

async function cleanupCompetencies() {
  await prisma.evidence.deleteMany({ where: { competency: { grupo: 'Test Grupo Temporal' } } })
  await prisma.competency.deleteMany({ where: { grupo: 'Test Grupo Temporal' } })
}

describe('getCoberturaCompetencias', () => {
  it('cuenta evidencias por competencia y marca huecos (0 evidencia)', async () => {
    await cleanupCompetencies()
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const comp1 = await prisma.competency.create({ data: { tipo: 'rol', grupo: 'Test Grupo Temporal', texto: 'x', orden: 0 } })
    const comp2 = await prisma.competency.create({ data: { tipo: 'rol', grupo: 'Test Grupo Temporal', texto: 'y', orden: 1 } })
    await prisma.evidence.create({ data: { userId: user.id, competencyId: comp1.id, nota: 'hice x' } })

    const cobertura = await getCoberturaCompetencias(user.id)
    const c1 = cobertura.find((c) => c.id === comp1.id)!
    const c2 = cobertura.find((c) => c.id === comp2.id)!
    expect(c1.evidenciaCount).toBe(1)
    expect(c2.evidenciaCount).toBe(0)

    await cleanupCompetencies()
  })
})
