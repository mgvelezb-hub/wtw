import { describe, it, expect, beforeAll } from 'vitest'
import { execSync } from 'child_process'
import { prisma } from '@/lib/prisma'

beforeAll(() => {
  execSync('npx tsx prisma/seed.ts', { stdio: 'inherit', cwd: process.cwd() })
}, 60_000) // cada upsert es un roundtrip a Neon — el seed completo tarda >10s

describe('seed', () => {
  it('crea los 4 niveles del escalafón VP', async () => {
    const levels = await prisma.level.findMany({ orderBy: { orden: 'asc' } })
    expect(levels).toHaveLength(4)
    expect(levels.map((l) => l.nombre)).toEqual(['Analista', 'Consultor Sr', 'Gerente', 'Gerente Sr'])
  })

  it('carga al menos 20 conductas individuales', async () => {
    const count = await prisma.competency.count({ where: { tipo: 'individual' } })
    expect(count).toBeGreaterThanOrEqual(20)
  })

  it('carga los 10 roles VP con reactivos', async () => {
    const grupos = await prisma.competency.findMany({
      where: { tipo: 'rol' },
      select: { grupo: true },
      distinct: ['grupo'],
    })
    expect(grupos).toHaveLength(10)
  })

  it('crea a Mau con nivel actual y objetivo ligados', async () => {
    const user = await prisma.user.findUnique({
      where: { email: 'mgonzalez@vpconsulting.mx' },
      include: { nivelActual: true, nivelObjetivo: true },
    })
    expect(user).not.toBeNull()
    expect(user!.nivelActual?.nombre).toBe('Consultor Sr')
    expect(user!.nivelObjetivo?.nombre).toBe('Gerente')
  })

  it('crea los 4 proyectos base', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'mgonzalez@vpconsulting.mx' } })
    const count = await prisma.project.count({ where: { userId: user.id } })
    expect(count).toBe(4)
  })

  it(
    'es idempotente — correr dos veces no duplica datos',
    async () => {
      execSync('npx tsx prisma/seed.ts', { stdio: 'inherit', cwd: process.cwd() })
      const count = await prisma.competency.count({ where: { tipo: 'individual' } })
      expect(count).toBeGreaterThanOrEqual(20)
      expect(count).toBeLessThan(40) // no se duplicó
    },
    60_000
  )
})
