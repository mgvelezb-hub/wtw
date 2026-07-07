import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { computeUtilizacion } from '@/app/api/v1/utilizacion/service'
import { isoWeekOf } from '@/lib/dates'

function tempPassword(): string {
  return randomBytes(9).toString('base64url').slice(0, 12)
}

export async function inviteColleague(managerId: string, email: string, nombre: string) {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new Error('ese correo ya tiene cuenta')

  const password = tempPassword()
  const user = await prisma.user.create({
    data: { email, nombre, passwordHash: await bcrypt.hash(password, 10), managerId },
  })
  return { user, tempPassword: password }
}

export async function listReports(managerId: string) {
  const reports = await prisma.user.findMany({ where: { managerId } })

  return Promise.all(
    reports.map(async (r) => {
      const [proyectosActivos, semanaActiva, utilizacion] = await Promise.all([
        prisma.project.count({ where: { userId: r.id, estatus: 'activo' } }),
        prisma.week.findUnique({
          where: { userId_isoWeek: { userId: r.id, isoWeek: isoWeekOf(new Date()) } },
          include: { wins: true },
        }),
        computeUtilizacion(r.id),
      ])
      return {
        id: r.id,
        nombre: r.nombre,
        email: r.email,
        proyectosActivos,
        winsSemana: semanaActiva?.wins ?? [],
        utilizacion,
      }
    })
  )
}
