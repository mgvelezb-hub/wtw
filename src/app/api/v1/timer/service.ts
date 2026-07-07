import { prisma } from '@/lib/prisma'

export async function runningEntry(userId: string) {
  return prisma.timeEntry.findFirst({ where: { userId, stoppedAt: null } })
}

export async function stopTimer(userId: string) {
  const running = await runningEntry(userId)
  if (!running) return null

  const stoppedAt = new Date()
  return prisma.timeEntry.update({
    where: { id: running.id },
    data: {
      stoppedAt,
      seconds: Math.round((stoppedAt.getTime() - running.startedAt.getTime()) / 1000),
    },
  })
}

export async function startTimer(userId: string, taskId: string) {
  await stopTimer(userId)

  const [entry] = await prisma.$transaction([
    prisma.timeEntry.create({ data: { userId, taskId, startedAt: new Date() } }),
    prisma.task.update({ where: { id: taskId }, data: { estatus: 'in_progress' } }),
  ])
  return entry
}
