import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { inviteColleague, listReports } from '@/app/(app)/equipo/service'
import { isoWeekOf } from '@/lib/dates'

const MANAGER_EMAIL = 'test-manager@vp.mx'
const REPORT_EMAIL = 'test-report@vp.mx'

beforeEach(async () => {
  await deleteTestUser(REPORT_EMAIL)
  await deleteTestUser(MANAGER_EMAIL)
})

// Invitar crea una cuenta con acceso a la app: lo que se prueba aquí es control
// de acceso, no validación de formulario.
describe('inviteColleague', () => {
  async function jefe() {
    return prisma.user.create({ data: { email: MANAGER_EMAIL, nombre: 'Manager', passwordHash: 'x' } })
  }

  it('crea un usuario con managerId apuntando al invitador y devuelve password temporal', async () => {
    const manager = await jefe()
    const r = await inviteColleague(manager.id, REPORT_EMAIL, 'Compañero Nuevo')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tempPassword).toHaveLength(12)
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: REPORT_EMAIL } })
    expect(stored.managerId).toBe(manager.id)
    expect(stored.passwordHash).not.toBe(r.tempPassword)
  })

  it('rechaza si el email ya existe, sin lanzar', async () => {
    const manager = await jefe()
    await prisma.user.create({ data: { email: REPORT_EMAIL, nombre: 'Ya existe', passwordHash: 'x' } })
    expect(await inviteColleague(manager.id, REPORT_EMAIL, 'X')).toEqual({
      ok: false,
      error: 'ese correo ya tiene cuenta',
    })
  })

  it('rechaza lo que no tiene forma de correo', async () => {
    const manager = await jefe()
    // El formulario hace preventDefault y lee refs, así que el `type="email"`
    // del input nunca valida nada: "abc" llegaba hasta la base.
    for (const malo of ['abc', 'a@b', 'a b@vp.mx', '@vp.mx']) {
      const r = await inviteColleague(manager.id, malo, 'X')
      expect(r.ok).toBe(false)
    }
    expect(await prisma.user.count({ where: { managerId: manager.id } })).toBe(0)
  })

  it('normaliza el correo a minúsculas, como hace el login', async () => {
    const manager = await jefe()
    // Sin esto la cuenta se crea con mayúsculas y su dueño no puede entrar: el
    // login busca el correo en minúsculas y no lo encuentra.
    const r = await inviteColleague(manager.id, ' TEST-Report@VP.mx ', 'Nuevo')
    expect(r.ok).toBe(true)
    expect(await prisma.user.findUnique({ where: { email: REPORT_EMAIL } })).not.toBeNull()
  })

  it('quien le reporta a alguien no puede invitar', async () => {
    const manager = await jefe()
    const report = await prisma.user.create({
      data: { email: REPORT_EMAIL, nombre: 'Reporte', passwordHash: 'x', managerId: manager.id },
    })

    // Sin este candado, cualquier cuenta de la app creaba cuentas y se las
    // colgaba a sí misma: una organización paralela dentro de la de su manager.
    const r = await inviteColleague(report.id, 'test-tercero@vp.mx', 'Tercero')
    expect(r.ok).toBe(false)
    expect(await prisma.user.count({ where: { managerId: report.id } })).toBe(0)
  })
})

describe('listReports', () => {
  it('lista reports directos con utilización, wins de la semana activa y proyectos activos', async () => {
    const manager = await prisma.user.create({ data: { email: MANAGER_EMAIL, nombre: 'Manager', passwordHash: 'x' } })
    const report = await prisma.user.create({
      data: { email: REPORT_EMAIL, nombre: 'Reporte', passwordHash: 'x', managerId: manager.id },
    })
    const proj = await prisma.project.create({ data: { userId: report.id, nombre: 'X', estatus: 'activo' } })
    const week = await prisma.week.create({
      // isoWeek de HOY — listReports busca la semana con isoWeekOf(new Date());
      // hardcodear la semana en que se escribió el test lo rompe al cruzar de semana.
      data: { userId: report.id, isoWeek: isoWeekOf(new Date()), rangoInicio: new Date(), rangoFin: new Date(), factorUsado: 1.4, estatus: 'active' },
    })
    await prisma.win.create({ data: { weekId: week.id, posicion: 1, titulo: 'Win reporte', estatus: 'pendiente' } })
    const task = await prisma.task.create({ data: { userId: report.id, projectId: proj.id, titulo: 'y' } })
    await prisma.timeEntry.create({ data: { userId: report.id, taskId: task.id, startedAt: new Date(), stoppedAt: new Date(), seconds: 3600 } })

    const reports = await listReports(manager.id)
    expect(reports).toHaveLength(1)
    expect(reports[0].nombre).toBe('Reporte')
    expect(reports[0].proyectosActivos).toBe(1)
    expect(reports[0].winsSemana).toHaveLength(1)
    expect(reports[0].utilizacion.facturableHoras + reports[0].utilizacion.internoHoras).toBeGreaterThan(0)
  })

  it('devuelve [] si no tiene reports', async () => {
    const manager = await prisma.user.create({ data: { email: MANAGER_EMAIL, nombre: 'Manager', passwordHash: 'x' } })
    expect(await listReports(manager.id)).toEqual([])
  })
})
