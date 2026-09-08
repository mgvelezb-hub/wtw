import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { complianceForWeek } from '@/app/api/v1/asignaciones/service'

const TEST_EMAIL = 'test-alloc@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('complianceForWeek', () => {
  it('compara % objetivo vigente vs % real dedicado', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool' } })
    await prisma.allocation.create({ data: { userId: user.id, projectId: proj.id, pct: 50, vigenteDesde: new Date('2026-01-01') } })

    const task = await prisma.task.create({ data: { userId: user.id, projectId: proj.id, titulo: 'x' } })
    await prisma.timeEntry.create({ data: { userId: user.id, taskId: task.id, startedAt: new Date(), stoppedAt: new Date(), seconds: 3600 } })
    const otherTask = await prisma.task.create({ data: { userId: user.id, titulo: 'y' } })
    await prisma.timeEntry.create({ data: { userId: user.id, taskId: otherTask.id, startedAt: new Date(), stoppedAt: new Date(), seconds: 3600 } })

    const compliance = await complianceForWeek(user.id)
    const liverpool = compliance.find((c) => c.projectNombre === 'Liverpool')!
    expect(liverpool.pctObjetivo).toBe(50)
    expect(liverpool.pctReal).toBeCloseTo(50, 1)
  })

  it('no cuenta el tiempo de semanas pasadas contra un objetivo semanal', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const activo = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool' } })
    const viejo = await prisma.project.create({ data: { userId: user.id, nombre: 'Cuervo' } })
    await prisma.allocation.create({ data: { userId: user.id, projectId: activo.id, pct: 100, vigenteDesde: new Date('2026-01-01') } })

    const tActivo = await prisma.task.create({ data: { userId: user.id, projectId: activo.id, titulo: 'x' } })
    await prisma.timeEntry.create({
      data: { userId: user.id, taskId: tActivo.id, startedAt: new Date(), stoppedAt: new Date(), seconds: 3600 },
    })
    // 200 h del año pasado en otro proyecto: antes aplastaban el porcentaje del
    // proyecto que hoy tiene el 100% de la asignación.
    const tViejo = await prisma.task.create({ data: { userId: user.id, projectId: viejo.id, titulo: 'y' } })
    await prisma.timeEntry.create({
      data: {
        userId: user.id,
        taskId: tViejo.id,
        startedAt: new Date('2025-03-10T15:00:00Z'),
        stoppedAt: new Date('2025-03-10T17:00:00Z'),
        seconds: 720_000,
      },
    })

    const liverpool = (await complianceForWeek(user.id)).find((c) => c.projectNombre === 'Liverpool')!
    expect(liverpool.pctReal).toBeCloseTo(100, 1)
  })

  it('dice "sin medir" en vez de 0% cuando la semana no tiene cronómetro', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool' } })
    await prisma.allocation.create({ data: { userId: user.id, projectId: proj.id, pct: 50, vigenteDesde: new Date('2026-01-01') } })

    // Un 0% afirma "no le dediqué nada"; la verdad es que no hay medición.
    expect((await complianceForWeek(user.id))[0].pctReal).toBeNull()
  })

  it('ignora allocations ya no vigentes', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'Cuervo' } })
    await prisma.allocation.create({
      data: { userId: user.id, projectId: proj.id, pct: 100, vigenteDesde: new Date('2025-01-01'), vigenteHasta: new Date('2025-06-01') },
    })
    const compliance = await complianceForWeek(user.id)
    expect(compliance.find((c) => c.projectNombre === 'Cuervo')).toBeUndefined()
  })

  it('devuelve [] si no hay allocations vigentes', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    expect(await complianceForWeek(user.id)).toEqual([])
  })
})
