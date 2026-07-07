import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { getProyectoDetalle } from '@/app/(app)/proyectos/[id]/service'

const TEST_EMAIL = 'test-proydet@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('getProyectoDetalle', () => {
  it('marca semáforo "atrasado" si fechaProyectada > fechaComprometida', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool' } })
    await prisma.deliverable.create({
      data: { projectId: proj.id, nombre: 'KPIs', fechaComprometida: new Date('2026-07-01'), fechaProyectada: new Date('2026-07-10'), avancePct: 40 },
    })
    const detalle = await getProyectoDetalle(user.id, proj.id)
    expect(detalle!.entregables[0].semaforo).toBe('atrasado')
  })

  it('marca "a_tiempo" si no hay fechaProyectada', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool' } })
    await prisma.deliverable.create({ data: { projectId: proj.id, nombre: 'KPIs', fechaComprometida: new Date('2026-07-10'), avancePct: 10 } })
    const detalle = await getProyectoDetalle(user.id, proj.id)
    expect(detalle!.entregables[0].semaforo).toBe('a_tiempo')
  })

  it('devuelve null si el proyecto no es del usuario', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'X' } })
    expect(await getProyectoDetalle('otro-id', proj.id)).toBeNull()
  })
})
