import { prisma } from '@/lib/prisma'

// Repara los bloques CLON que la misma tarea llegó a tener el mismo día.
//
// El hueco se abrió cuando descartar dejó de BORRAR el bloque —para que lo
// planeado no encogiera hacia atrás— sin que `scheduleTaskAction` mirara si ya
// había uno. La regla queda cerrada en el código; esto limpia lo que alcanzó a
// escribirse.
//
// CLON, no "duplicado": una tarea SÍ puede tener varios bloques el mismo día
// —el reflow la parte en tramos y el cierre lo contempla— y borrar esos sería
// destruir historia real. Un clon es el MISMO compromiso dos veces: mismo
// `planMin` y mismo horario. La primera versión de este script no distinguía y
// se habría llevado por delante tramos de agosto de 12, 8 y 5 minutos.
//
//   npx tsx scripts/fusionar-bloques-duplicados.ts <email>
//   npx tsx scripts/fusionar-bloques-duplicados.ts <email> --aplicar
async function main() {
  const email = process.argv[2]
  const aplicar = process.argv.includes('--aplicar')
  if (!email) throw new Error('uso: fusionar-bloques-duplicados.ts <email> [--aplicar]')

  const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } })
  const bloques = await prisma.block.findMany({
    where: { week: { userId: user.id }, tipo: 'tarea', taskId: { not: null } },
    include: { task: { select: { titulo: true, estatus: true } }, minutas: { select: { id: true } } },
    orderBy: [{ done: 'asc' }, { createdAt: 'asc' }],
  })

  // La clave incluye el estimado y el horario: dos tramos distintos del mismo
  // día caen en grupos distintos y no se tocan.
  const grupos = new Map<string, typeof bloques>()
  for (const b of bloques) {
    const clave = `${b.taskId}|${b.fecha.toISOString().slice(0, 10)}|${b.planMin}|${b.inicio}-${b.fin}`
    grupos.set(clave, [...(grupos.get(clave) ?? []), b])
  }

  const clones = [...grupos.entries()].filter(([, g]) => g.length > 1)
  if (clones.length === 0) {
    console.log('Sin clones. Nada que hacer.')
    return
  }

  const aBorrar: string[] = []
  for (const [clave, grupo] of clones) {
    const dia = clave.split('|')[1]
    const [conservar, ...sobran] = grupo
    console.log(`\n${dia} · "${conservar.task?.titulo}" [${conservar.task?.estatus}] — ${grupo.length} clones de ${conservar.planMin}min`)
    console.log(`  conservar ${conservar.id.slice(-6)} done=${conservar.done}`)
    for (const s of sobran) {
      const minutas = s.minutas.length
      console.log(`  borrar    ${s.id.slice(-6)} done=${s.done}${minutas ? ` ⚠️ ${minutas} minuta(s): SE CONSERVA` : ''}`)
      if (minutas === 0) aBorrar.push(s.id)
    }
    console.log(`  planeado del día por esta tarea: ${grupo.reduce((n, b) => n + b.planMin, 0)}min → ${conservar.planMin}min`)
  }

  console.log(`\n${clones.length} grupo(s) de clones; ${aBorrar.length} bloque(s) a borrar.`)
  if (!aplicar) {
    console.log('Ensayo. Vuelve a correrlo con --aplicar para escribir.')
    return
  }
  const { count } = await prisma.block.deleteMany({ where: { id: { in: aBorrar } } })
  console.log(`Listo: ${count} bloque(s) borrado(s).`)
}

void main().finally(() => prisma.$disconnect())
