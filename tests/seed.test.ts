import { describe, it, expect, beforeAll } from 'vitest'
import { execSync } from 'child_process'
import { prisma } from '@/lib/prisma'

beforeAll(() => {
  execSync('npx tsx prisma/seed.ts', { stdio: 'inherit', cwd: process.cwd() })
}, 180_000) // ~50 upserts, cada uno un roundtrip a Neon — con latencia mala supera los 60s

describe('seed', () => {
  it('crea los 8 niveles del escalafón VP, de Trainee a Socio', async () => {
    const levels = await prisma.level.findMany({ orderBy: { orden: 'asc' } })
    // Antes eran 4: arrancaba en Analista y se cortaba en Gerente Sr. El
    // instrumento real (Expectations Vp.pdf) trae Trainee y Consultor al inicio,
    // y Director antes de Socio.
    expect(levels).toHaveLength(8)
    expect(levels.map((l) => l.nombre)).toEqual([
      'Trainee',
      'Analista',
      'Consultor',
      'Consultor Sr',
      'Gerente',
      'Gerente Sr',
      'Director',
      'Socio',
    ])
  })

  it('carga los reactivos por nivel del instrumento de VP', async () => {
    const gerente = await prisma.competency.findMany({
      where: { tipo: 'nivel', grupo: 'Gerente' },
      orderBy: { orden: 'asc' },
    })
    // Los números son los del documento (arrancan en 9 porque la sección 1 ocupa
    // del 1 al 8) y se conservan para poder decir "el reactivo 10 de Gerente".
    expect(gerente.map((c) => c.orden)).toEqual([9, 10, 11, 12])
    expect(gerente[3].texto).toBe('Establece relaciones de proximidad con stakeholders claves del cliente')

    // Socio no viene en el documento: se deja vacío en vez de inventarlo.
    expect(await prisma.competency.count({ where: { tipo: 'nivel', grupo: 'Socio' } })).toBe(0)
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
    180_000
  )
})
