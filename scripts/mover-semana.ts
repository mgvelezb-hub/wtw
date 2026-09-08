// Mueve una Week de un isoWeek a otro desplazando sus bloques el mismo número
// de días. Nació el 8-sep-2026: el planeador mandó el plan a W38 con W37 vacía
// (martes + default "la que entra") y /dia amaneció sin nada. Wins, tareas,
// estimados y tiempo medido no se tocan: solo `isoWeek`, el rango y `Block.fecha`.
//
// Uso (contra la base que diga DATABASE_URL):
//   npx tsx scripts/mover-semana.ts <email> <de> <a>            # dry run
//   npx tsx scripts/mover-semana.ts <email> <de> <a> --aplicar
//
// Regla 11 del CLAUDE.md: antes de mover fechas se lee lo que dependa de ellas.
// Por eso el dry run cuenta TimeEntry y DayReconciliation del rango origen y
// se niega si el destino ya existe.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const [email, de, a, flag] = process.argv.slice(2)
const aplicar = flag === '--aplicar'

function lunesDe(isoWeek: string): Date {
  const [y, w] = isoWeek.split('-W').map(Number)
  const jan4 = new Date(Date.UTC(y, 0, 4))
  const lunesW1 = new Date(jan4)
  lunesW1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7))
  const d = new Date(lunesW1)
  d.setUTCDate(lunesW1.getUTCDate() + (w - 1) * 7)
  return d
}

function mas(d: Date, n: number): Date {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + n)
  return x
}

function dia(d: Date): string {
  return d.toISOString().slice(0, 10)
}

async function main(): Promise<void> {
  if (!email || !de || !a) throw new Error('uso: mover-semana.ts <email> <de> <a> [--aplicar]')
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } })
  const origen = await prisma.week.findUniqueOrThrow({
    where: { userId_isoWeek: { userId: user.id, isoWeek: de } },
    include: {
      blocks: { select: { id: true, fecha: true, titulo: true, inicio: true, fin: true } },
      _count: { select: { wins: true, tasks: true } },
    },
  })
  const destino = await prisma.week.findUnique({
    where: { userId_isoWeek: { userId: user.id, isoWeek: a } },
    select: { id: true },
  })
  const delta = Math.round((lunesDe(a).getTime() - lunesDe(de).getTime()) / 86_400_000)

  console.log(`Week ${de} (${origen.id}): wins ${origen._count.wins}, tasks ${origen._count.tasks}, blocks ${origen.blocks.length}`)
  console.log(`Destino ${a}: ${destino ? 'YA EXISTE, abortar' : 'libre'}; delta ${delta} días`)
  if (destino) process.exit(1)
  for (const b of origen.blocks) {
    console.log(`  ${dia(b.fecha)} -> ${dia(mas(b.fecha, delta))}  ${b.inicio ?? '--:--'}-${b.fin ?? '--:--'}  ${b.titulo ?? ''}`)
  }
  const rango = { gte: origen.rangoInicio, lte: mas(origen.rangoFin, 1) }
  const te = await prisma.timeEntry.count({ where: { userId: user.id, startedAt: rango } })
  const rec = await prisma.dayReconciliation.count({ where: { userId: user.id, fecha: rango } })
  console.log(`TimeEntry en el rango origen: ${te}; DayReconciliation: ${rec}`)
  if (!aplicar) {
    console.log('DRY RUN: nada escrito')
    return
  }

  await prisma.$transaction(async (tx) => {
    await tx.week.update({
      where: { id: origen.id },
      data: { isoWeek: a, rangoInicio: mas(origen.rangoInicio, delta), rangoFin: mas(origen.rangoFin, delta) },
    })
    for (const b of origen.blocks) {
      await tx.block.update({ where: { id: b.id }, data: { fecha: mas(b.fecha, delta) } })
    }
  })
  const check = await prisma.week.findUniqueOrThrow({
    where: { userId_isoWeek: { userId: user.id, isoWeek: a } },
    include: { blocks: { select: { fecha: true } } },
  })
  console.log(`OK ${a}: ${dia(check.rangoInicio)} -> ${dia(check.rangoFin)}; bloques ${check.blocks.map((b) => dia(b.fecha)).sort().join(', ')}`)
}

main().finally(() => prisma.$disconnect())
