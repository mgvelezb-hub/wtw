// Migración única: limpia TODO rastro de pruebas (cuentas test-*, colega demo,
// bloques/tasks de verificación) e importa datos reales: historial W26+W27,
// los 5 entregables reales del SOW de Liverpool (avances-data.js), y los 66
// pendientes reales del seguimiento interno (pendientes-data.js).
//
// Uso: npx tsx scripts/import-real-data.ts
import { prisma } from '../src/lib/prisma'

const MAU_EMAIL = 'mgonzalez@vpconsulting.mx'

async function deleteUserCascade(userId: string) {
  const weekIds = (await prisma.week.findMany({ where: { userId }, select: { id: true } })).map((w) => w.id)
  const taskIds = (await prisma.task.findMany({ where: { userId }, select: { id: true } })).map((t) => t.id)
  await prisma.evidence.deleteMany({ where: { userId } })
  await prisma.timeEntry.deleteMany({ where: { userId } })
  await prisma.dodItem.deleteMany({ where: { taskId: { in: taskIds } } })
  await prisma.block.deleteMany({ where: { weekId: { in: weekIds } } })
  await prisma.task.deleteMany({ where: { userId } })
  await prisma.win.deleteMany({ where: { weekId: { in: weekIds } } })
  await prisma.week.deleteMany({ where: { userId } })
  await prisma.allocation.deleteMany({ where: { userId } })
  await prisma.calendarEvent.deleteMany({ where: { userId } })
  await prisma.dayOverride.deleteMany({ where: { userId } })
  const projectIds = (await prisma.project.findMany({ where: { userId }, select: { id: true } })).map((p) => p.id)
  await prisma.issue.deleteMany({ where: { projectId: { in: projectIds } } })
  await prisma.deliverable.deleteMany({ where: { projectId: { in: projectIds } } })
  await prisma.project.deleteMany({ where: { userId } })
  await prisma.user.delete({ where: { id: userId } })
}

async function limpiarPruebas() {
  const testUsers = await prisma.user.findMany({ where: { email: { contains: '@vp.mx' } } })
  for (const u of testUsers) {
    await deleteUserCascade(u.id)
    console.log(`  eliminado: ${u.email}`)
  }

  const alejandro = await prisma.user.findUnique({ where: { email: 'alejandro.demo@vpconsulting.mx' } })
  if (alejandro) {
    await deleteUserCascade(alejandro.id)
    console.log(`  eliminado: ${alejandro.email} (colega demo)`)
  }

  const mau = await prisma.user.findUniqueOrThrow({ where: { email: MAU_EMAIL } })

  // Bloques/task demo de "hoy" sembrados en Fase 2 para verificación de Mi Día
  const demoBlocks = await prisma.block.findMany({
    where: { week: { userId: mau.id }, fecha: new Date('2026-07-07') },
  })
  for (const b of demoBlocks) {
    if (b.taskId) {
      await prisma.timeEntry.deleteMany({ where: { taskId: b.taskId } })
      await prisma.dodItem.deleteMany({ where: { taskId: b.taskId } })
    }
    await prisma.block.delete({ where: { id: b.id } })
  }
  const demoTask = await prisma.task.findFirst({
    where: { userId: mau.id, titulo: { contains: 'KPIs Liverpool — detallar $/pieza región 1' } },
  })
  if (demoTask) await prisma.task.delete({ where: { id: demoTask.id } })

  // Tarea suelta de prueba del módulo inbox (Fase 3)
  await prisma.task.deleteMany({ where: { userId: mau.id, titulo: 'Probar módulo de settings con Mau' } })

  console.log('  bloques/tasks demo de Mau eliminados')
  return mau
}

async function importarDeliverablesReales(liverpoolId: string) {
  await prisma.deliverable.deleteMany({ where: { projectId: liverpoolId } }) // placeholders de Fase 1

  const entregables = [
    {
      numeroSow: '1',
      nombre: 'Entregable #1 — Firma de contrato (anticipo)',
      fechaComprometida: new Date('2026-03-01'),
      avancePct: 100,
      estatus: 'aceptado' as const,
    },
    {
      numeroSow: '2',
      nombre: 'Entregable #2 — Línea Base de Gasto y Operación de Transporte',
      fechaComprometida: new Date('2026-05-06'),
      avancePct: 90, // estimado — "en ensamble final" per avances-data.js; ajustar en la app
      estatus: 'rev_interna' as const,
    },
    {
      numeroSow: '3',
      nombre: 'Entregable #3 — Paquetes de Negociación',
      fechaComprometida: new Date('2026-06-03'),
      avancePct: 30, // estimado — ligado al trabajo activo de Spot-Regional/paquetes; ajustar en la app
      estatus: 'borrador' as const,
    },
    {
      numeroSow: '4',
      nombre: 'Entregable #4 — Negociaciones',
      fechaComprometida: new Date('2026-07-08'),
      avancePct: 0,
      estatus: 'borrador' as const,
    },
    {
      numeroSow: '5',
      nombre: 'Entregable #5 — Caso de Negocio',
      fechaComprometida: new Date('2026-07-22'),
      avancePct: 0,
      estatus: 'borrador' as const,
    },
  ]

  for (const e of entregables) {
    await prisma.deliverable.create({ data: { projectId: liverpoolId, ...e } })
  }
  console.log(`  ${entregables.length} entregables reales del SOW importados (Entregables #3 y #4 están vencidos o por vencer — revisa avancePct)`)
}

async function importarPendientesReales(liverpoolId: string) {
  // pendientes-data.js es un script plano de navegador (const PEND = [...]),
  // sin exports de módulo — se ejecuta en un scope de función para extraer PEND.
  const fs = await import('fs')
  const path = await import('path')
  const filePath = path.resolve(__dirname, '../../wtw-tablero/pendientes-data.js')
  const source = fs.readFileSync(filePath, 'utf-8')
  const items: Array<{
    tema: string
    act: string
    resp: string
    fecha: string
    completado: boolean
    sinFecha: boolean
  }> = new Function(`${source}\nreturn PEND;`)()

  let importados = 0
  for (const item of items) {
    if (!item.act?.trim()) continue
    await prisma.issue.create({
      data: {
        projectId: liverpoolId,
        tipo: 'pendiente',
        tema: item.tema,
        descripcion: item.act,
        responsable: item.resp || null,
        estatus: item.completado ? 'cerrado' : 'abierto',
        // fechas de texto libre ("May 6 18/Jun") no son parseables de forma confiable — se omiten
      },
    })
    importados++
  }
  console.log(`  ${importados} pendientes reales importados como Issues (RAID)`)
}

async function importarSemanaHistorica(
  userId: string,
  isoWeek: string,
  rangoInicio: string,
  rangoFin: string,
  wins: { titulo: string; estatus: 'logrado' | 'pendiente' }[],
  tasks: { titulo: string; projectNombre?: string; winPosicion?: number; estimadoMin: number; ajustadoMin: number; estatus: 'done' | 'planned' }[]
) {
  const existing = await prisma.week.findUnique({ where: { userId_isoWeek: { userId, isoWeek } } })
  if (existing) {
    console.log(`  ${isoWeek} ya existe — se omite`)
    return
  }

  const week = await prisma.week.create({
    data: {
      userId,
      isoWeek,
      rangoInicio: new Date(rangoInicio),
      rangoFin: new Date(rangoFin),
      factorUsado: 1.4,
      estatus: 'closed',
    },
  })

  const winByPos = new Map<number, string>()
  for (const [i, w] of wins.entries()) {
    const win = await prisma.win.create({
      data: { weekId: week.id, posicion: i + 1, titulo: w.titulo, estatus: w.estatus },
    })
    winByPos.set(i + 1, win.id)
  }

  const projectIdCache = new Map<string, string>()
  for (const t of tasks) {
    let projectId: string | undefined
    if (t.projectNombre) {
      projectId = projectIdCache.get(t.projectNombre)
      if (!projectId) {
        const p = await prisma.project.upsert({
          where: { userId_nombre: { userId, nombre: t.projectNombre } },
          create: { userId, nombre: t.projectNombre },
          update: {},
        })
        projectId = p.id
        projectIdCache.set(t.projectNombre, projectId)
      }
    }
    await prisma.task.create({
      data: {
        userId,
        weekId: week.id,
        projectId,
        winId: t.winPosicion ? winByPos.get(t.winPosicion) : undefined,
        titulo: t.titulo,
        estimadoMin: t.estimadoMin,
        ajustadoMin: t.ajustadoMin,
        estatus: t.estatus,
      },
    })
  }
  console.log(`  ${isoWeek} importada: ${wins.length} wins, ${tasks.length} tasks (sin bloques hora-a-hora — no aportan valor a /historico)`)
}

async function main() {
  console.log('1. Limpiando TODO rastro de pruebas...')
  const mau = await limpiarPruebas()

  console.log('2. Importando entregables reales del SOW de Liverpool...')
  const liverpool = await prisma.project.findFirstOrThrow({ where: { userId: mau.id, nombre: 'Liverpool' } })
  await importarDeliverablesReales(liverpool.id)

  console.log('3. Importando pendientes reales (RAID) de Liverpool...')
  await importarPendientesReales(liverpool.id)

  console.log('4. Importando semana histórica 2026-W26...')
  await importarSemanaHistorica(
    mau.id,
    '2026-W26',
    '2026-06-22',
    '2026-06-26',
    [
      { titulo: 'Material Braverman entregado', estatus: 'logrado' },
      { titulo: 'KPIs Liverpool — 1er corte', estatus: 'logrado' },
      { titulo: 'Cuervo — core cerrado', estatus: 'logrado' },
    ],
    [
      { titulo: 'Verificación carro (novia)', estimadoMin: 150, ajustadoMin: 90, estatus: 'done' },
      { titulo: 'Material Braverman', projectNombre: 'Liverpool', winPosicion: 1, estimadoMin: 60, ajustadoMin: 60, estatus: 'done' },
      { titulo: 'KPIs — terminar base/prorrateo 2026', projectNombre: 'Liverpool', winPosicion: 2, estimadoMin: 120, ajustadoMin: 168, estatus: 'done' },
      { titulo: 'KPIs — 1er corte $/km y $/viaje × región', projectNombre: 'Liverpool', winPosicion: 2, estimadoMin: 210, ajustadoMin: 270, estatus: 'done' },
      { titulo: 'Cuervo — macros', projectNombre: 'Cuervo', winPosicion: 3, estimadoMin: 120, ajustadoMin: 168, estatus: 'done' },
      { titulo: 'Cuervo — modelo AnyLogic', projectNombre: 'Cuervo', winPosicion: 3, estimadoMin: 120, ajustadoMin: 168, estatus: 'done' },
      { titulo: 'Cuervo — prueba de humo', projectNombre: 'Cuervo', winPosicion: 3, estimadoMin: 90, ajustadoMin: 90, estatus: 'done' },
    ]
  )

  console.log('5. Importando semana histórica 2026-W27...')
  await importarSemanaHistorica(
    mau.id,
    '2026-W27',
    '2026-06-29',
    '2026-07-03',
    [
      { titulo: 'Data 2026 — integridad entendida, base lista para Alejandro Nila', estatus: 'pendiente' },
      { titulo: 'Cuervo (gemelo) — prueba VM + corrida completa 2 escenarios', estatus: 'pendiente' },
      { titulo: 'Estrategia Spot-Regional + metodología paquetes con Compras', estatus: 'pendiente' },
    ],
    [
      { titulo: 'Prep + preguntas junta data 2026', projectNombre: 'Liverpool', winPosicion: 1, estimadoMin: 30, ajustadoMin: 42, estatus: 'planned' },
      { titulo: 'Post-junta: documentar + base para Alejandro', projectNombre: 'Liverpool', winPosicion: 1, estimadoMin: 90, ajustadoMin: 126, estatus: 'planned' },
      { titulo: 'KPIs $/pieza × mes × lane (1 región)', projectNombre: 'Liverpool', estimadoMin: 180, ajustadoMin: 252, estatus: 'planned' },
      { titulo: 'Estrategia Spot-Regional — criterios + 2 regiones', projectNombre: 'Liverpool', winPosicion: 3, estimadoMin: 150, ajustadoMin: 210, estatus: 'planned' },
      { titulo: 'Cuervo — prueba en VM', projectNombre: 'Cuervo', winPosicion: 2, estimadoMin: 120, ajustadoMin: 168, estatus: 'planned' },
      { titulo: 'Cuervo — corrida completa 2 escenarios', projectNombre: 'Cuervo', winPosicion: 2, estimadoMin: 180, ajustadoMin: 252, estatus: 'planned' },
      { titulo: 'Cuervo — documentar supuestos + resultados', projectNombre: 'Cuervo', winPosicion: 2, estimadoMin: 90, ajustadoMin: 126, estatus: 'planned' },
    ]
  )

  console.log('\nMigración completa.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
