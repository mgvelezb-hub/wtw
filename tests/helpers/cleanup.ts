import { prisma } from '@/lib/prisma'

// Borra únicamente los datos alcanzables desde un usuario de prueba, en orden
// de dependencia (hijos antes que padres). Nunca usar deleteMany() sin `where`
// contra esta base: es compartida (Neon dev) y contiene datos de seed reales.
//
// Todo va en UN $transaction batch: una sola conexión y un solo commit. Con la
// latencia variable de Neon (1-2s por round trip en horas malas) los ~20 awaits
// sueltos que había antes superaban el hookTimeout y tiraban la suite completa
// con "Hook timed out" sin que ningún test estuviera realmente roto.
export async function deleteTestUser(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return

  const [weeks, tasks, projects] = await Promise.all([
    prisma.week.findMany({ where: { userId: user.id }, select: { id: true } }),
    prisma.task.findMany({ where: { userId: user.id }, select: { id: true } }),
    prisma.project.findMany({ where: { userId: user.id }, select: { id: true } }),
  ])
  const weekIds = weeks.map((w) => w.id)
  const taskIds = tasks.map((t) => t.id)
  const projectIds = projects.map((p) => p.id)

  await prisma.$transaction([
    prisma.evidence.deleteMany({ where: { userId: user.id } }),
    prisma.timeEntry.deleteMany({ where: { userId: user.id } }),
    ...(taskIds.length ? [prisma.dodItem.deleteMany({ where: { taskId: { in: taskIds } } })] : []),
    ...(weekIds.length ? [prisma.block.deleteMany({ where: { weekId: { in: weekIds } } })] : []),
    // MinutaItem apunta opcionalmente a Task/Issue sin cascada — hay que borrar
    // las minutas (cascada a sus items) antes de borrar tasks/issues, o la FK truena.
    prisma.minuta.deleteMany({ where: { userId: user.id } }),
    prisma.task.deleteMany({ where: { userId: user.id } }),
    ...(weekIds.length ? [prisma.win.deleteMany({ where: { weekId: { in: weekIds } } })] : []),
    prisma.week.deleteMany({ where: { userId: user.id } }),
    ...(projectIds.length
      ? [
          prisma.issue.deleteMany({ where: { projectId: { in: projectIds } } }),
          prisma.deliverable.deleteMany({ where: { projectId: { in: projectIds } } }),
        ]
      : []),
    prisma.allocation.deleteMany({ where: { userId: user.id } }),
    prisma.calendarEvent.deleteMany({ where: { userId: user.id } }),
    prisma.dayOverride.deleteMany({ where: { userId: user.id } }),
    prisma.artifact.deleteMany({ where: { userId: user.id } }),
    prisma.aiProfile.deleteMany({ where: { userId: user.id } }),
    prisma.aiCall.deleteMany({ where: { userId: user.id } }),
    prisma.project.deleteMany({ where: { userId: user.id } }),
    prisma.user.delete({ where: { id: user.id } }),
  ])
}
