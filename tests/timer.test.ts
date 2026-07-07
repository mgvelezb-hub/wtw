import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { startTimer, stopTimer, runningEntry } from '@/app/api/v1/timer/service'

async function cleanDb() {
  await prisma.$transaction([
    prisma.timeEntry.deleteMany(),
    prisma.task.deleteMany(),
    prisma.user.deleteMany({ where: { email: 'test-timer@vp.mx' } }),
  ])
}

async function setup() {
  const user = await prisma.user.create({ data: { email: 'test-timer@vp.mx', nombre: 'Test', passwordHash: 'x' } })
  const taskA = await prisma.task.create({ data: { userId: user.id, titulo: 'Tarea A' } })
  const taskB = await prisma.task.create({ data: { userId: user.id, titulo: 'Tarea B' } })
  return { user, taskA, taskB }
}

beforeEach(cleanDb)

describe('startTimer', () => {
  it('crea entry corriendo y pone la task en in_progress', async () => {
    const { user, taskA } = await setup()
    const entry = await startTimer(user.id, taskA.id)
    expect(entry.stoppedAt).toBeNull()
    const task = await prisma.task.findUnique({ where: { id: taskA.id } })
    expect(task!.estatus).toBe('in_progress')
  })

  it('iniciar otra task detiene la primera y acumula seconds', async () => {
    const { user, taskA, taskB } = await setup()
    const first = await startTimer(user.id, taskA.id)
    await prisma.timeEntry.update({
      where: { id: first.id },
      data: { startedAt: new Date(Date.now() - 5000) }, // simula 5s transcurridos, sin sleep real
    })

    await startTimer(user.id, taskB.id)

    const stopped = await prisma.timeEntry.findUnique({ where: { id: first.id } })
    expect(stopped!.stoppedAt).not.toBeNull()
    expect(stopped!.seconds).toBeGreaterThanOrEqual(5)

    const running = await runningEntry(user.id)
    expect(running!.taskId).toBe(taskB.id)
  })
})

describe('stopTimer', () => {
  it('sin timer corriendo devuelve null sin error', async () => {
    const { user } = await setup()
    expect(await stopTimer(user.id)).toBeNull()
  })

  it('detiene el timer corriendo y calcula seconds', async () => {
    const { user, taskA } = await setup()
    const entry = await startTimer(user.id, taskA.id)
    await prisma.timeEntry.update({
      where: { id: entry.id },
      data: { startedAt: new Date(Date.now() - 3000) },
    })
    const stopped = await stopTimer(user.id)
    expect(stopped!.stoppedAt).not.toBeNull()
    expect(stopped!.seconds).toBeGreaterThanOrEqual(3)
  })
})

describe('runningEntry', () => {
  it('devuelve null si no hay timer corriendo', async () => {
    const { user } = await setup()
    expect(await runningEntry(user.id)).toBeNull()
  })
})
