import { prisma } from '../src/lib/prisma'

const ICS = 'https://outlook.office365.com/owa/calendar/cb2cf8955a6d4d48bb5cc7e3ae31dac9@vpconsulting.mx/6990044271ea4d7fbe2c8996ba44c66a9367818107072554717/calendar.ics'

async function main() {
  const mau = await prisma.user.findUniqueOrThrow({ where: { email: 'mgonzalez@vpconsulting.mx' } })
  await prisma.user.update({ where: { id: mau.id }, data: { icsUrl: ICS } })
  console.log('icsUrl configurada')

  const liverpool = await prisma.project.findFirstOrThrow({ where: { userId: mau.id, nombre: 'Liverpool' } })

  // Estado real mapeado del plan 06Jul (34 actividades → 5 entregables SOW).
  // avancePct desde los % del plan; fechaProyectada con el corrimiento de ~2 sem.
  const updates: { numeroSow: string; avancePct: number; estatus: 'aceptado'|'rev_cliente'|'rev_interna'|'borrador'; fechaProyectada: string | null }[] = [
    { numeroSow: '1', avancePct: 100, estatus: 'aceptado',    fechaProyectada: null },
    { numeroSow: '2', avancePct: 100, estatus: 'rev_cliente', fechaProyectada: null },
    { numeroSow: '3', avancePct: 80,  estatus: 'rev_interna', fechaProyectada: '2026-07-10' },
    { numeroSow: '4', avancePct: 5,   estatus: 'borrador',    fechaProyectada: '2026-07-22' },
    { numeroSow: '5', avancePct: 0,   estatus: 'borrador',    fechaProyectada: '2026-08-05' },
  ]
  for (const u of updates) {
    const d = await prisma.deliverable.findFirst({ where: { projectId: liverpool.id, numeroSow: u.numeroSow } })
    if (!d) { console.log(`  #${u.numeroSow} no encontrado`); continue }
    await prisma.deliverable.update({
      where: { id: d.id },
      data: { avancePct: u.avancePct, estatus: u.estatus, fechaProyectada: u.fechaProyectada ? new Date(u.fechaProyectada) : null },
    })
    console.log(`  #${u.numeroSow} → ${u.avancePct}% ${u.estatus}${u.fechaProyectada ? ' · proy '+u.fechaProyectada : ''}`)
  }
}
main().finally(() => prisma.$disconnect())
