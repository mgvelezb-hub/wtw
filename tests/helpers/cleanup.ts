import { prisma } from '@/lib/prisma'

// Borra únicamente los datos alcanzables desde un usuario de prueba, en orden
// de dependencia (hijos antes que padres). Nunca usar deleteMany() sin `where`
// contra esta base: es compartida (Neon dev) y contiene datos de seed reales.
export async function deleteTestUser(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return

  const weekIds = (await prisma.week.findMany({ where: { userId: user.id }, select: { id: true } })).map((w) => w.id)
  const taskIds = (await prisma.task.findMany({ where: { userId: user.id }, select: { id: true } })).map((t) => t.id)
  const projectIds = (await prisma.project.findMany({ where: { userId: user.id }, select: { id: true } })).map(
    (p) => p.id
  )

  await prisma.evidence.deleteMany({ where: { userId: user.id } })
  await prisma.timeEntry.deleteMany({ where: { userId: user.id } })
  await prisma.dodItem.deleteMany({ where: { taskId: { in: taskIds } } })
  await prisma.block.deleteMany({ where: { weekId: { in: weekIds } } })
  // MinutaItem apunta opcionalmente a Task/Issue sin cascada — hay que borrar
  // las minutas (cascada a sus items) antes de borrar tasks/issues, o la FK truena.
  await prisma.minuta.deleteMany({ where: { userId: user.id } })
  await prisma.task.deleteMany({ where: { userId: user.id } })
  await prisma.win.deleteMany({ where: { weekId: { in: weekIds } } })
  await prisma.week.deleteMany({ where: { userId: user.id } })
  await prisma.issue.deleteMany({ where: { projectId: { in: projectIds } } })
  await prisma.deliverable.deleteMany({ where: { projectId: { in: projectIds } } })
  await prisma.allocation.deleteMany({ where: { userId: user.id } })
  await prisma.calendarEvent.deleteMany({ where: { userId: user.id } })
  await prisma.dayOverride.deleteMany({ where: { userId: user.id } })
  await prisma.artifact.deleteMany({ where: { userId: user.id } })
  await prisma.aiProfile.deleteMany({ where: { userId: user.id } })
  await prisma.aiCall.deleteMany({ where: { userId: user.id } })
  await prisma.project.deleteMany({ where: { userId: user.id } })
  await prisma.user.delete({ where: { id: user.id } })
}
