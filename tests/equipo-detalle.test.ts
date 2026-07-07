import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { getCoberturaParaManager } from '@/app/equipo/[reportId]/service'

const MANAGER_EMAIL = 'test-mgr-det@vp.mx'
const REPORT_EMAIL = 'test-rep-det@vp.mx'
const OTRO_EMAIL = 'test-otro-det@vp.mx'

beforeEach(async () => {
  await deleteTestUser(REPORT_EMAIL)
  await deleteTestUser(OTRO_EMAIL)
  await deleteTestUser(MANAGER_EMAIL)
})

describe('getCoberturaParaManager', () => {
  it('devuelve la cobertura si el report es directo del manager', async () => {
    const manager = await prisma.user.create({ data: { email: MANAGER_EMAIL, nombre: 'M', passwordHash: 'x' } })
    const report = await prisma.user.create({ data: { email: REPORT_EMAIL, nombre: 'R', passwordHash: 'x', managerId: manager.id } })
    const cobertura = await getCoberturaParaManager(manager.id, report.id)
    expect(cobertura).not.toBeNull()
    expect(cobertura!.report.nombre).toBe('R')
  })

  it('devuelve null si el usuario objetivo NO es su report — frontera de privacidad', async () => {
    const manager = await prisma.user.create({ data: { email: MANAGER_EMAIL, nombre: 'M', passwordHash: 'x' } })
    const otro = await prisma.user.create({ data: { email: OTRO_EMAIL, nombre: 'Otro', passwordHash: 'x' } })
    expect(await getCoberturaParaManager(manager.id, otro.id)).toBeNull()
  })

  it('gapsTop5 solo incluye competencias con evidenciaCount=0, máximo 5', async () => {
    const manager = await prisma.user.create({ data: { email: MANAGER_EMAIL, nombre: 'M', passwordHash: 'x' } })
    const report = await prisma.user.create({ data: { email: REPORT_EMAIL, nombre: 'R', passwordHash: 'x', managerId: manager.id } })
    const cobertura = await getCoberturaParaManager(manager.id, report.id)
    expect(cobertura!.gapsTop5.length).toBeLessThanOrEqual(5)
    expect(cobertura!.gapsTop5.every((g) => g.evidenciaCount === 0)).toBe(true)
  })
})
