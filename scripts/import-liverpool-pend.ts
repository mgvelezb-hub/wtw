import { prisma } from '../src/lib/prisma'

const MAU_TASKS = [
  "Base de datos maestra de volumen y gasto histórico 2025",
  "Bases de datos de análisis de volumen y gasto para estrategia de compra.",
  "Presentación PowerPoint con supuestos y conclusiones relevantes.",
  "Costeo anual de operación por flujo de transporte – proveedor – número de embarques – tarifa.",
  "Talleres con responsable para generar acciones",
  "Seguimiento con responsables",
  "Medición de mejora",
  "Sesión de catch up con Eliel y Mike (validar supuestos de costeo)",
  "Análisis de Temporadas, gestión de flota",
  "Analizar el output para split dedicado - spot",
  "Delegar algoritmo a Mau",
  "Análisis y conclusiones operativas",
  "Integración de KPI's a los análisis ($/km, $/pz y $/viaje)",
  "Modelación",
  "Modelo operativo cómo lo van a cobrar? Revisar proceso actual",
  "Dashboard por LT As Is y To Be",
  "Estudio de los dashboards por LT",
  "Escenario de sincronización de ventanas en el ciclo completo (Un ejemplo)",
  "Minutas",
]

const TEAM_ISSUES: { desc: string; resp: string }[] = [
  { desc: "Estrategia documentada de compra de transporte con criterios de asignación y objetivos de costo por segmento de flujo.", resp: "Mike" },
  { desc: "Armado de paquetes (watch out eficiencias qué cambian en los paquetes)", resp: "Mike / Eliel" },
  { desc: "Alineación del modelo variable: bullet proof", resp: "Mike" },
  { desc: "Calculadora de viajes", resp: "Mike" },
  { desc: "Validación interna", resp: "Mike / Juan / Clau" },
  { desc: "Validación Liverpool: Carlos y abastecimientos", resp: "Mike / Juan / Clau" },
  { desc: "Preparación Negos - se van preparando conforme a la agenda de negos", resp: "Mike / Clau" },
  { desc: "Alineación Carlos y Abastecimientos", resp: "Mike / Clau" },
  { desc: "Interna - bullet proof", resp: "Clau / Mike" },
  { desc: "Con Liverpool: Carlos, Abastecimientos", resp: "Clau / Mike / Juan" },
  { desc: "Entrevistas Previas", resp: "Mike / Clau" },
  { desc: "Benchmark de tarifas en MS Excel.", resp: "Eliel Spot / Mike Dedicado" },
  { desc: "Entendimiento flujos puros spot y puros dedicado, se deben intercambiar?", resp: "Mike / Eliel" },
  { desc: "Algoritmo anual", resp: "Eliel" },
  { desc: "Revisar el file de Evaluación de Transportistas para incluir al input", resp: "Eliel" },
  { desc: "Correr el algoritmo para Liverpool", resp: "Eliel" },
  { desc: "Actualización de acuerdos en gasto", resp: "Eliel" },
  { desc: "Tiempos de descarga top offenders (mayor impacto en ahorros)", resp: "Alex" },
  { desc: "Coordinar con las personas correctas - a través de Carlos", resp: "Alex" },
  { desc: "Simulación (Ventanas de Entrega)", resp: "Alex" },
  { desc: "Paquetes de Negociación (Power BI).", resp: "Sin asignar" },
  { desc: "Archivo de estimación de ahorros.", resp: "Sin asignar" },
  { desc: "Presentación PowerPoint de Resultados y Conclusiones.", resp: "Sin asignar" },
  { desc: "Matriz de Estrategia de Asignación Final.", resp: "Sin asignar" },
  { desc: "Presentación de Ahorros (costo/beneficio) y Siguientes Pasos", resp: "Sin asignar" },
]

async function main() {
  const mau = await prisma.user.findUniqueOrThrow({ where: { email: 'mgonzalez@vpconsulting.mx' } })
  const liverpool = await prisma.project.findFirstOrThrow({ where: { userId: mau.id, nombre: 'Liverpool' } })

  const existingTasks = await prisma.task.findMany({ where: { userId: mau.id }, select: { titulo: true } })
  const existingTitles = new Set(existingTasks.map((t) => t.titulo.toLowerCase().slice(0, 40)))

  let createdTasks = 0
  for (const titulo of MAU_TASKS) {
    const key = titulo.toLowerCase().slice(0, 40)
    if (existingTitles.has(key)) continue
    await prisma.task.create({
      data: { userId: mau.id, projectId: liverpool.id, titulo, estatus: 'backlog', alcance: 'sow' },
    })
    createdTasks++
  }

  const existingIssues = await prisma.issue.findMany({ where: { projectId: liverpool.id }, select: { descripcion: true } })
  const existingDescs = new Set(existingIssues.map((i) => i.descripcion.toLowerCase().slice(0, 40)))

  let createdIssues = 0
  for (const { desc, resp } of TEAM_ISSUES) {
    const key = desc.toLowerCase().slice(0, 40)
    if (existingDescs.has(key)) continue
    await prisma.issue.create({
      data: { projectId: liverpool.id, tipo: 'pendiente', descripcion: desc, responsable: resp, estatus: 'abierto' },
    })
    createdIssues++
  }

  console.log(`Tasks creadas: ${createdTasks}/${MAU_TASKS.length} (${MAU_TASKS.length - createdTasks} ya existían)`)
  console.log(`Issues creadas: ${createdIssues}/${TEAM_ISSUES.length} (${TEAM_ISSUES.length - createdIssues} ya existían)`)
}

main().finally(() => prisma.$disconnect())
