import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { computeUtilizacion } from '@/app/api/v1/utilizacion/service'
import { isoWeekOf, todayStr } from '@/lib/dates'

function tempPassword(): string {
  return randomBytes(9).toString('base64url').slice(0, 12)
}

// Invitar CREA una cuenta con acceso a la app, así que las tres validaciones de
// aquí no son cosmética de formulario: son el control de acceso.
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export type ResultadoInvitacion = { ok: true; tempPassword: string } | { ok: false; error: string }

export async function inviteColleague(
  managerId: string,
  emailCrudo: string,
  nombreCrudo: string
): Promise<ResultadoInvitacion> {
  const nombre = nombreCrudo.trim()
  // El login normaliza a minúsculas antes de buscar (`login/actions.ts`). Sin
  // hacer lo mismo aquí, "A@vp.mx" crea una cuenta que su dueño no puede usar:
  // el `findUnique` del login busca "a@vp.mx" y no la encuentra.
  const email = emailCrudo.trim().toLowerCase()

  if (nombre === '') return { ok: false, error: 'la persona necesita un nombre' }
  if (!RE_EMAIL.test(email)) return { ok: false, error: 'ese correo no tiene forma de correo' }

  // Control de rol. No hay campo de rol en el schema —los roles granulares están
  // diferidos a propósito—, así que el rol es la posición en el árbol: quien ya
  // le reporta a alguien no invita. Sin esto, cualquier cuenta de la app podía
  // crear cuentas nuevas y colgárselas a sí misma, armando una organización
  // paralela dentro de la de su propio manager.
  const quienInvita = await prisma.user.findUnique({ where: { id: managerId }, select: { managerId: true } })
  if (!quienInvita) return { ok: false, error: 'usuario no encontrado' }
  if (quienInvita.managerId !== null) {
    return { ok: false, error: 'solo quien no le reporta a nadie puede invitar a alguien al equipo' }
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return { ok: false, error: 'ese correo ya tiene cuenta' }

  const password = tempPassword()
  await prisma.user.create({
    data: { email, nombre, passwordHash: await bcrypt.hash(password, 10), managerId },
  })
  return { ok: true, tempPassword: password }
}

export async function listReports(managerId: string) {
  const reports = await prisma.user.findMany({ where: { managerId } })

  return Promise.all(
    reports.map(async (r) => {
      const [proyectosActivos, semanaActiva, utilizacion] = await Promise.all([
        prisma.project.count({ where: { userId: r.id, estatus: 'activo' } }),
        prisma.week.findUnique({
          // `isoWeekOf(new Date())` lee el reloj UTC: el domingo entre 18:00 y
          // medianoche CDMX ya contestaba la semana siguiente y el tablero
          // mostraba los Wins de una semana que nadie ha empezado.
          where: { userId_isoWeek: { userId: r.id, isoWeek: isoWeekOf(new Date(`${todayStr()}T00:00:00Z`)) } },
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
