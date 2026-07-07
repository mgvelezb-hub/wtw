import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { listProyectosConCarga } from '@/app/proyectos/service'

const TEST_EMAIL = 'test-proy@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('listProyectosConCarga', () => {
  it('suma la carga (ajustadoMin/estimadoMin) de tasks activas por proyecto', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool' } })
    await prisma.task.create({ data: { userId: user.id, projectId: proj.id, titulo: 'a', estimadoMin: 60, estatus: 'planned' } })
    await prisma.task.create({ data: { userId: user.id, projectId: proj.id, titulo: 'b', ajustadoMin: 120, estatus: 'in_progress' } })
    await prisma.task.create({ data: { userId: user.id, projectId: proj.id, titulo: 'c', estimadoMin: 999, estatus: 'done' } })

    const proyectos = await listProyectosConCarga(user.id)
    const liverpool = proyectos.find((p) => p.nombre === 'Liverpool')!
    expect(liverpool.cargaActivaHoras).toBeCloseTo(3, 1)
  })

  it('devuelve carga 0 para proyecto sin tasks activas', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    await prisma.project.create({ data: { userId: user.id, nombre: 'Vacio' } })
    const proyectos = await listProyectosConCarga(user.id)
    expect(proyectos.find((p) => p.nombre === 'Vacio')!.cargaActivaHoras).toBe(0)
  })
})
