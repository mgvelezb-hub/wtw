import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { listInbox, triageTask, createInboxTask, discardTask, getHerramientaFactors } from '@/app/(app)/inbox/service'

const TEST_EMAIL = 'test-inbox@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('listInbox', () => {
  it('devuelve solo tasks backlog del usuario', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    await prisma.task.create({ data: { userId: user.id, titulo: 'Idea suelta', estatus: 'backlog' } })
    await prisma.task.create({ data: { userId: user.id, titulo: 'Ya planeada', estatus: 'planned' } })
    const inbox = await listInbox(user.id)
    expect(inbox).toHaveLength(1)
    expect(inbox[0].titulo).toBe('Idea suelta')
  })
})

describe('createInboxTask', () => {
  it('crea una task en backlog con alcance sow por default', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const task = await createInboxTask(user.id, { titulo: 'Nueva idea' })
    expect(task.estatus).toBe('backlog')
    expect(task.alcance).toBe('sow')
  })
})

describe('triageTask', () => {
  it('mueve una task de backlog a planned dentro de una semana', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const week = await prisma.week.create({
      data: { userId: user.id, isoWeek: '2026-W28', rangoInicio: new Date(), rangoFin: new Date(), factorUsado: 1.4 },
    })
    const task = await prisma.task.create({ data: { userId: user.id, titulo: 'Idea', estatus: 'backlog' } })
    const result = await triageTask(task.id, user.id, { weekId: week.id, estimadoMin: 60 })
    expect(result.estatus).toBe('planned')
    expect(result.weekId).toBe(week.id)
    expect(result.estimadoMin).toBe(60)
  })

  it('lanza si la task no pertenece al usuario', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const task = await prisma.task.create({ data: { userId: user.id, titulo: 'Idea', estatus: 'backlog' } })
    await expect(triageTask(task.id, 'otro-id', {})).rejects.toThrow()
  })
})

describe('getHerramientaFactors', () => {
  it('calcula el factor real/estimado con al menos 2 muestras', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    for (const estimado of [60, 100]) {
      const task = await prisma.task.create({
        data: { userId: user.id, titulo: 'Excel task', estatus: 'done', herramienta: 'Excel', estimadoMin: estimado },
      })
      await prisma.timeEntry.create({
        data: { userId: user.id, taskId: task.id, startedAt: new Date(), stoppedAt: new Date(), seconds: estimado * 1.5 * 60 },
      })
    }
    const factores = await getHerramientaFactors(user.id)
    expect(factores['Excel']).toBeCloseTo(1.5, 1)
  })

  it('omite herramientas con menos de 2 muestras', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const task = await prisma.task.create({
      data: { userId: user.id, titulo: 'Python task', estatus: 'done', herramienta: 'Python', estimadoMin: 60 },
    })
    await prisma.timeEntry.create({
      data: { userId: user.id, taskId: task.id, startedAt: new Date(), stoppedAt: new Date(), seconds: 3600 },
    })
    const factores = await getHerramientaFactors(user.id)
    expect(factores['Python']).toBeUndefined()
  })
})

describe('discardTask', () => {
  it('marca la task como deferred', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const task = await prisma.task.create({ data: { userId: user.id, titulo: 'Idea', estatus: 'backlog' } })
    const result = await discardTask(task.id, user.id)
    expect(result.estatus).toBe('deferred')
  })
})
