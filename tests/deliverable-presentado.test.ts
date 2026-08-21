import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { marcarPresentado } from '@/app/(app)/proyectos/[id]/service'
import { deleteTestUser } from './helpers/cleanup'

const TEST_EMAIL = 'test-deliverable-presentado@vp.mx'

beforeEach(() => deleteTestUser(TEST_EMAIL))

async function proyectoConEntregable() {
  const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
  const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool' } })
  const entregable = await prisma.deliverable.create({ data: { projectId: proj.id, nombre: 'KPIs 2026' } })
  return { user, proj, entregable }
}

describe('marcarPresentado', () => {
  it('al marcar presentado=true crea evidencia de "Quien presenta" y "La mano del Rey"', async () => {
    const { user, entregable } = await proyectoConEntregable()

    await marcarPresentado(user.id, entregable.id, true, 'director de finanzas')

    const actualizado = await prisma.deliverable.findUniqueOrThrow({ where: { id: entregable.id } })
    expect(actualizado.presentado).toBe(true)
    expect(actualizado.presentadoA).toBe('director de finanzas')

    const evidencias = await prisma.evidence.findMany({
      where: { userId: user.id, deliverableId: entregable.id },
      include: { competency: true },
    })
    expect(evidencias).toHaveLength(2)
    const grupos = evidencias.map((e) => e.competency.grupo).sort()
    expect(grupos).toEqual(['La mano del Rey', 'Quien presenta'])
    expect(evidencias[0].nota).toContain('KPIs 2026')
  })

  it('marcar presentado=true dos veces no duplica evidencia', async () => {
    const { user, entregable } = await proyectoConEntregable()

    await marcarPresentado(user.id, entregable.id, true)
    await marcarPresentado(user.id, entregable.id, true)

    const evidencias = await prisma.evidence.findMany({ where: { userId: user.id, deliverableId: entregable.id } })
    expect(evidencias).toHaveLength(2)
  })

  it('marcar presentado=false limpia presentadoA y no borra evidencia ya generada', async () => {
    const { user, entregable } = await proyectoConEntregable()

    await marcarPresentado(user.id, entregable.id, true, 'CFO')
    await marcarPresentado(user.id, entregable.id, false)

    const actualizado = await prisma.deliverable.findUniqueOrThrow({ where: { id: entregable.id } })
    expect(actualizado.presentado).toBe(false)
    expect(actualizado.presentadoA).toBeNull()

    const evidencias = await prisma.evidence.findMany({ where: { userId: user.id, deliverableId: entregable.id } })
    expect(evidencias).toHaveLength(2)
  })

  it('rechaza un deliverableId que no pertenece al usuario', async () => {
    const { entregable } = await proyectoConEntregable()

    await expect(marcarPresentado('otro-usuario', entregable.id, true)).rejects.toThrow('entregable no encontrado')
  })
})
