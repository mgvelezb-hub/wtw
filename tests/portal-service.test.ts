import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { hashPortalToken } from '@/lib/tokens'
import { getPortalData } from '@/app/portal/[token]/service'

const TEST_EMAIL = 'test-portal@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('getPortalData', () => {
  it('devuelve entregables, semáforos e issues con responsable=cliente, sin datos internos', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({
      data: { userId: user.id, nombre: 'Liverpool', portalTokenHash: hashPortalToken('tok123'), tarifaHora: 2000, presupuestoHoras: 500 },
    })
    await prisma.deliverable.create({ data: { projectId: proj.id, nombre: 'KPIs', avancePct: 60, fechaComprometida: new Date('2026-08-01') } })
    await prisma.issue.create({ data: { projectId: proj.id, tipo: 'pendiente', descripcion: 'Falta info CDRs', responsable: 'Cliente', estatus: 'abierto' } })

    const data = await getPortalData('tok123')
    expect(data).not.toBeNull()
    expect(data!.proyecto.nombre).toBe('Liverpool')
    expect(data!.entregables[0].avancePct).toBe(60)
    expect(data!.apoyoRequerido).toHaveLength(1)
    expect(JSON.stringify(data)).not.toMatch(/hora|presupuesto|tarifa|aliado|allocation/i)
  })

  it('devuelve null con un token inválido', async () => {
    expect(await getPortalData('token-que-no-existe')).toBeNull()
  })

  it('filtra issues cuyo responsable no es el cliente', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'X', portalTokenHash: hashPortalToken('tok456') } })
    await prisma.issue.create({ data: { projectId: proj.id, tipo: 'pendiente', descripcion: 'interno', responsable: 'Mau', estatus: 'abierto' } })
    const data = await getPortalData('tok456')
    expect(data!.apoyoRequerido).toHaveLength(0)
  })
})
