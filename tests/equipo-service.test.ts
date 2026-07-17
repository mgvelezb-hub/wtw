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

describe('inviteColleague', () => {
  it('crea un usuario con managerId apuntando al invitador y devuelve password temporal', async () => {
    const manager = await prisma.user.create({ data: { email: MANAGER_EMAIL, nombre: 'Manager', passwordHash: 'x' } })
    const { user, tempPassword } = await inviteColleague(manager.id, REPORT_EMAIL, 'Compañero Nuevo')
    expect(user.managerId).toBe(manager.id)
    expect(tempPassword).toHaveLength(12)
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(stored.passwordHash).not.toBe(tempPassword)
  })

  it('rechaza si el email ya existe', async () => {
    const manager = await prisma.user.create({ data: { email: MANAGER_EMAIL, nombre: 'Manager', passwordHash: 'x' } })
    await prisma.user.create({ data: { email: REPORT_EMAIL, nombre: 'Ya existe', passwordHash: 'x' } })
    await expect(inviteColleague(manager.id, REPORT_EMAIL, 'X')).rejects.toThrow()
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
