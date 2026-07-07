import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'
import { isoWeekOf, weekRange } from '../src/lib/dates'
import { CONDUCTAS_INDIVIDUALES, ROLES_VP } from './seed-data/competencias-vp'

async function seedLevels() {
  const levels = [
    { nombre: 'Analista', orden: 1, expectativas: null },
    { nombre: 'Consultor Sr', orden: 2, expectativas: null },
    {
      nombre: 'Gerente',
      orden: 3,
      expectativas:
        'Liderar tramos táctico-operativos, asignar y dar orientación a equipos, y establecer proximidad con stakeholders.',
    },
    { nombre: 'Gerente Sr', orden: 4, expectativas: null },
  ]
  const byNombre = new Map<string, string>()
  for (const l of levels) {
    const level = await prisma.level.upsert({
      where: { nombre: l.nombre },
      create: l,
      update: { orden: l.orden, expectativas: l.expectativas },
    })
    byNombre.set(l.nombre, level.id)
  }
  return byNombre
}

// Prisma no acepta `null` dentro de un where compuesto (@@unique) para upsert
// — grupo es nullable en las conductas individuales, así que se resuelve a mano.
async function upsertCompetency(tipo: 'individual' | 'rol', grupo: string | null, orden: number, texto: string) {
  const existing = await prisma.competency.findFirst({ where: { tipo, grupo, orden } })
  if (existing) {
    await prisma.competency.update({ where: { id: existing.id }, data: { texto } })
  } else {
    await prisma.competency.create({ data: { tipo, grupo, orden, texto } })
  }
}

async function seedCompetencies() {
  for (const [orden, texto] of CONDUCTAS_INDIVIDUALES.entries()) {
    await upsertCompetency('individual', null, orden, texto)
  }

  for (const [grupo, reactivos] of Object.entries(ROLES_VP)) {
    for (const [orden, texto] of reactivos.entries()) {
      await upsertCompetency('rol', grupo, orden, texto)
    }
  }
}

async function seedUser(levels: Map<string, string>) {
  const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD ?? 'cambiar-ya', 10)
  return prisma.user.upsert({
    where: { email: 'mgonzalez@vpconsulting.mx' },
    create: {
      email: 'mgonzalez@vpconsulting.mx',
      nombre: 'Mauricio González',
      passwordHash,
      horarioInicio: '09:00',
      horarioFin: '18:00',
      comidaInicio: '14:00',
      comidaFin: '15:00',
      bufferPct: 25,
      factorManual: 1.4,
      nivelActualId: levels.get('Consultor Sr'),
      nivelObjetivoId: levels.get('Gerente'),
    },
    update: {},
  })
}

async function seedProjects(userId: string) {
  const projects = [
    { nombre: 'Liverpool', cliente: 'El Puerto de Liverpool', tipo: 'facturable' as const, color: '#0A7C82' },
    { nombre: 'Cuervo', cliente: 'Cuervo', tipo: 'facturable' as const, color: '#B8860B' },
    { nombre: 'VP Interno', cliente: null, tipo: 'interno' as const, color: '#5B6470' },
    { nombre: 'Desarrollo Personal', cliente: null, tipo: 'desarrollo' as const, color: '#7B5EA7' },
  ]
  const byNombre = new Map<string, string>()
  for (const p of projects) {
    const project = await prisma.project.upsert({
      where: { userId_nombre: { userId, nombre: p.nombre } },
      create: { userId, ...p },
      update: {},
    })
    byNombre.set(p.nombre, project.id)
  }
  return byNombre
}

async function seedActiveWeek(userId: string) {
  const isoWeek = isoWeekOf(new Date())
  const existing = await prisma.week.findUnique({ where: { userId_isoWeek: { userId, isoWeek } } })
  if (existing) return existing

  const { inicio, fin } = weekRange(isoWeek)
  return prisma.week.create({
    data: {
      userId,
      isoWeek,
      rangoInicio: inicio,
      rangoFin: fin,
      factorUsado: 1.4,
      estatus: 'active',
    },
  })
}

async function main() {
  const levels = await seedLevels()
  await seedCompetencies()
  const user = await seedUser(levels)
  const projects = await seedProjects(user.id)
  const week = await seedActiveWeek(user.id)

  console.log('Seed completo:')
  console.log(`  usuario: ${user.email}`)
  console.log(`  proyectos: ${projects.size}`)
  console.log(`  semana activa: ${week.isoWeek}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
