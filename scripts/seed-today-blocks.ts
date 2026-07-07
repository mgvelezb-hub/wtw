// Datos de verificación para Fase 2 — bloques reales de HOY sobre la semana
// activa ya sembrada en Fase 1. No usa POST /api/v1/weeks (crearía una semana
// duplicada); inserta directo sobre la Week existente. Idempotente.
import { prisma } from '../src/lib/prisma'
import { todayStr, isoWeekOf } from '../src/lib/dates'

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'mgonzalez@vpconsulting.mx' } })
  const today = todayStr()
  const isoWeek = isoWeekOf(new Date())

  const existentes = await prisma.block.count({ where: { fecha: new Date(today), week: { userId: user.id } } })
  if (existentes > 0) {
    console.log(`Ya hay ${existentes} bloques para ${today} — no se duplica.`)
    return
  }

  const week = await prisma.week.findUniqueOrThrow({ where: { userId_isoWeek: { userId: user.id, isoWeek } } })
  const liverpool = await prisma.project.findFirstOrThrow({ where: { userId: user.id, nombre: 'Liverpool' } })

  const task = await prisma.task.create({
    data: {
      userId: user.id,
      projectId: liverpool.id,
      weekId: week.id,
      titulo: 'KPIs Liverpool — detallar $/pieza región 1',
      estimadoMin: 180,
      estatus: 'planned',
      dodItems: {
        create: [
          { texto: '$/pieza por O-D limpio', orden: 0 },
          { texto: 'al menos 1 región cerrada', orden: 1 },
        ],
      },
    },
  })

  await prisma.block.createMany({
    data: [
      {
        weekId: week.id,
        taskId: task.id,
        fecha: new Date(today),
        inicio: '09:00',
        fin: '12:00',
        tipo: 'tarea',
        titulo: task.titulo,
        planMin: 180,
        orden: 0,
      },
      {
        weekId: week.id,
        fecha: new Date(today),
        inicio: '12:00',
        fin: '13:00',
        tipo: 'descanso',
        titulo: 'Comida',
        planMin: 60,
        orden: 1,
      },
      {
        weekId: week.id,
        fecha: new Date(today),
        inicio: '17:00',
        fin: '18:00',
        tipo: 'junta',
        titulo: 'Revisión Base de Datos',
        planMin: 60,
        orden: 2,
      },
    ],
  })

  console.log(`3 bloques creados para ${today}.`)
}

main().finally(() => prisma.$disconnect())
