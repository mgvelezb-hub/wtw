import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { registrarImpacto, getProyectoDetalle } from '@/app/(app)/proyectos/[id]/service'
import { deleteTestUser } from './helpers/cleanup'

const TEST_EMAIL = 'test-impacto-entregable@vp.mx'

beforeEach(() => deleteTestUser(TEST_EMAIL))

async function proyectoConEntregable() {
  const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
  const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool' } })
  const entregable = await prisma.deliverable.create({ data: { projectId: proj.id, nombre: 'Truck Fill' } })
  return { user, proj, entregable }
}

describe('registrarImpacto', () => {
  it('persiste el impacto y sale en getProyectoDetalle', async () => {
    const { user, proj, entregable } = await proyectoConEntregable()

    await registrarImpacto(user.id, entregable.id, {
      baseline: 'fill rate 71%',
      delta: '→ 78.4%, +$12 MM anualizados',
      validadoPor: 'Carlos Sierra',
    })

    const detalle = await getProyectoDetalle(user.id, proj.id)
    expect(detalle).not.toBeNull()
    const ent = detalle!.entregables.find((e) => e.id === entregable.id)
    expect(ent).toBeDefined()
    expect(ent!.impactos).toHaveLength(1)
    expect(ent!.impactos[0].baseline).toBe('fill rate 71%')
    expect(ent!.impactos[0].delta).toBe('→ 78.4%, +$12 MM anualizados')
    expect(ent!.impactos[0].validadoPor).toBe('Carlos Sierra')
  })

  it('ordena los impactos desc por fecha', async () => {
    const { user, proj, entregable } = await proyectoConEntregable()

    const primero = await prisma.impactoEntregable.create({
      data: { deliverableId: entregable.id, baseline: 'a', delta: 'b', fecha: new Date('2026-01-01') },
    })
    const segundo = await prisma.impactoEntregable.create({
      data: { deliverableId: entregable.id, baseline: 'c', delta: 'd', fecha: new Date('2026-06-01') },
    })

    const detalle = await getProyectoDetalle(user.id, proj.id)
    const ent = detalle!.entregables.find((e) => e.id === entregable.id)
    expect(ent!.impactos.map((i) => i.id)).toEqual([segundo.id, primero.id])
  })

  it('rechaza baseline o delta vacíos', async () => {
    const { user, entregable } = await proyectoConEntregable()

    await expect(registrarImpacto(user.id, entregable.id, { baseline: '  ', delta: 'x' })).rejects.toThrow(
      'baseline y delta son requeridos',
    )
    await expect(registrarImpacto(user.id, entregable.id, { baseline: 'x', delta: '  ' })).rejects.toThrow(
      'baseline y delta son requeridos',
    )
  })

  it('rechaza un deliverableId que no pertenece al usuario', async () => {
    const { entregable } = await proyectoConEntregable()

    await expect(
      registrarImpacto('otro-usuario', entregable.id, { baseline: 'x', delta: 'y' }),
    ).rejects.toThrow('entregable no encontrado')
  })

  it('borrar el usuario no deja huérfanos: el impacto cascadea con el entregable', async () => {
    const { user, entregable } = await proyectoConEntregable()

    await registrarImpacto(user.id, entregable.id, { baseline: 'x', delta: 'y' })
    const impactosAntes = await prisma.impactoEntregable.findMany({ where: { deliverableId: entregable.id } })
    expect(impactosAntes).toHaveLength(1)

    await deleteTestUser(TEST_EMAIL)

    const impactosDespues = await prisma.impactoEntregable.findMany({ where: { deliverableId: entregable.id } })
    expect(impactosDespues).toHaveLength(0)
  })
})
