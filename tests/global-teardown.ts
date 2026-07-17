import { PrismaClient } from '@prisma/client'

// Cada archivo de test limpia SU usuario al INICIO (beforeEach) para que las
// corridas sean deterministas — pero eso deja el último usuario de cada
// archivo vivo en la DB compartida de Neon hasta la siguiente corrida. Este
// teardown global corre UNA vez al final de toda la suite y barre cualquier
// residuo, sin importar qué archivo lo dejó — la garantía real de "sin
// esquema de pruebas parcial" vive aquí, no en cada beforeEach individual.
export async function teardown() {
  const prisma = new PrismaClient()
  try {
    const testUsers = await prisma.user.findMany({ where: { email: { endsWith: '@vp.mx' } } })
    for (const u of testUsers) {
      const weekIds = (await prisma.week.findMany({ where: { userId: u.id }, select: { id: true } })).map((w) => w.id)
      const taskIds = (await prisma.task.findMany({ where: { userId: u.id }, select: { id: true } })).map((t) => t.id)
      const projectIds = (await prisma.project.findMany({ where: { userId: u.id }, select: { id: true } })).map((p) => p.id)

      await prisma.evidence.deleteMany({ where: { userId: u.id } })
      await prisma.timeEntry.deleteMany({ where: { userId: u.id } })
      await prisma.dodItem.deleteMany({ where: { taskId: { in: taskIds } } })
      await prisma.block.deleteMany({ where: { weekId: { in: weekIds } } })
      // Minutas antes que tasks/issues: MinutaItem apunta a ambos sin cascada
      await prisma.minuta.deleteMany({ where: { userId: u.id } })
      await prisma.task.deleteMany({ where: { userId: u.id } })
      await prisma.win.deleteMany({ where: { weekId: { in: weekIds } } })
      await prisma.week.deleteMany({ where: { userId: u.id } })
      await prisma.issue.deleteMany({ where: { projectId: { in: projectIds } } })
      await prisma.deliverable.deleteMany({ where: { projectId: { in: projectIds } } })
      await prisma.allocation.deleteMany({ where: { userId: u.id } })
      await prisma.calendarEvent.deleteMany({ where: { userId: u.id } })
      await prisma.dayOverride.deleteMany({ where: { userId: u.id } })
      await prisma.artifact.deleteMany({ where: { userId: u.id } })
      await prisma.aiProfile.deleteMany({ where: { userId: u.id } })
      await prisma.aiCall.deleteMany({ where: { userId: u.id } })
      await prisma.project.deleteMany({ where: { userId: u.id } })
    }
    await prisma.user.deleteMany({ where: { email: { endsWith: '@vp.mx' } } })
    if (testUsers.length > 0) {
      console.log(`[global-teardown] ${testUsers.length} usuario(s) de prueba eliminados al final de la suite`)
    }
  } finally {
    await prisma.$disconnect()
  }
}
