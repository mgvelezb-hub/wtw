import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { getLedgerAliado } from '@/app/aliado/service'

const TEST_EMAIL = 'test-aliado@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('getLedgerAliado', () => {
  it('acumula horas aliado por proyecto con sus dolores y valoriza a tarifa', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool', tarifaHora: 2000 } })
    const t1 = await prisma.task.create({
      data: { userId: user.id, projectId: proj.id, titulo: 'x', alcance: 'aliado', dolorCliente: 'Falta de visibilidad de datos' },
    })
    await prisma.timeEntry.create({ data: { userId: user.id, taskId: t1.id, startedAt: new Date(), stoppedAt: new Date(), seconds: 3600 } })

    const ledger = await getLedgerAliado(user.id)
    const liverpool = ledger.find((l) => l.projectNombre === 'Liverpool')!
    expect(liverpool.horasAliado).toBeCloseTo(1, 2)
    expect(liverpool.valorizado).toBe(2000)
    expect(liverpool.dolores).toContain('Falta de visibilidad de datos')
  })

  it('proyecto sin tarifaHora no valoriza (null, no truena)', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'SinTarifa' } })
    const t1 = await prisma.task.create({ data: { userId: user.id, projectId: proj.id, titulo: 'x', alcance: 'aliado' } })
    await prisma.timeEntry.create({ data: { userId: user.id, taskId: t1.id, startedAt: new Date(), stoppedAt: new Date(), seconds: 3600 } })
    const ledger = await getLedgerAliado(user.id)
    expect(ledger.find((l) => l.projectNombre === 'SinTarifa')!.valorizado).toBeNull()
  })

  it('ignora tasks sow (no cuentan como aliado)', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'SoloSow' } })
    const t1 = await prisma.task.create({ data: { userId: user.id, projectId: proj.id, titulo: 'x', alcance: 'sow' } })
    await prisma.timeEntry.create({ data: { userId: user.id, taskId: t1.id, startedAt: new Date(), stoppedAt: new Date(), seconds: 3600 } })
    const ledger = await getLedgerAliado(user.id)
    expect(ledger.find((l) => l.projectNombre === 'SoloSow')).toBeUndefined()
  })
})
