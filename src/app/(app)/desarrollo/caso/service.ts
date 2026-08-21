import { prisma } from '@/lib/prisma'
import { getDesarrollo, type PiezaEvidencia, type SemaforoPatron } from '../service'

// One-pager exportable del promotion case (Fase 7). El comité no necesita el
// tablero completo de /desarrollo: necesita la versión que se imprime — "varios
// managers diciendo lo mismo" con evidencia específica. Este service NUNCA
// recalcula el patrón: lo toma tal cual de getDesarrollo (../service.ts), que
// es la única fuente de semaforoDe/alertasDe/siguientePasoDe. Lo único que se
// agrega aquí es específico del one-pager: recorte a las mejores 3 piezas por
// reactivo (testigo primero) y el impacto de cliente, que el gap dashboard no
// necesita y por eso no vive ahí.

const MAX_PIEZAS_POR_REACTIVO = 3

export type PiezaCaso = Pick<PiezaEvidencia, 'nota' | 'testigo' | 'nivelDemostrado' | 'proyecto' | 'diasDesde'>

export type ReactivoCaso = {
  orden: number
  texto: string
  semaforo: SemaforoPatron
  evidenciaCount: number
  piezas: PiezaCaso[]
}

export type ImpactoCaso = {
  id: string
  entregable: string
  proyecto: string
  baseline: string
  delta: string
  validadoPor: string | null
  fecha: string
}

export type PromotionCaseView = {
  nombre: string
  nivelActual: string | null
  nivelObjetivo: string | null
  fecha: string
  veredicto: string | null
  conPatron: number
  totalReactivos: number
  // Reactivos del nivel objetivo, con sus mejores piezas — el cuerpo del caso.
  reactivos: ReactivoCaso[]
  impactos: ImpactoCaso[]
  // La línea honesta de cierre: lo que todavía no es patrón.
  huecos: Array<{ orden: number; texto: string; semaforo: SemaforoPatron }>
}

// Testigo primero — es lo que el comité pide para creerse una pieza sin tener
// que confirmarla por su cuenta. A igualdad de testigo se respeta el orden que
// ya trae getDesarrollo (más reciente primero), por eso el sort es estable.
function mejoresPiezas(piezas: PiezaEvidencia[]): PiezaCaso[] {
  return [...piezas]
    .sort((a, b) => Number(b.testigo !== null) - Number(a.testigo !== null))
    .slice(0, MAX_PIEZAS_POR_REACTIVO)
    .map((p) => ({
      nota: p.nota,
      testigo: p.testigo,
      nivelDemostrado: p.nivelDemostrado,
      proyecto: p.proyecto,
      diasDesde: p.diasDesde,
    }))
}

export async function getPromotionCase(userId: string, hoy: Date = new Date()): Promise<PromotionCaseView> {
  const [user, view, impactosRaw] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { nombre: true } }),
    getDesarrollo(userId, hoy),
    // Scopeado a userId por el dueño del proyecto — es el único camino que
    // existe de un ImpactoEntregable a un usuario (cuelga de Deliverable→Project).
    prisma.impactoEntregable.findMany({
      where: { deliverable: { project: { userId } } },
      include: { deliverable: { select: { nombre: true, project: { select: { nombre: true } } } } },
      orderBy: { fecha: 'desc' },
    }),
  ])

  const reactivos: ReactivoCaso[] = (view.patron?.reactivos ?? []).map((r) => ({
    orden: r.orden,
    texto: r.texto,
    semaforo: r.semaforo,
    evidenciaCount: r.evidenciaCount,
    piezas: mejoresPiezas(r.piezas),
  }))

  return {
    nombre: user.nombre,
    nivelActual: view.nivelActual,
    nivelObjetivo: view.nivelObjetivo,
    fecha: hoy.toISOString().slice(0, 10),
    veredicto: view.patron?.veredicto ?? null,
    conPatron: view.patron?.conPatron ?? 0,
    totalReactivos: view.patron?.total ?? 0,
    reactivos,
    impactos: impactosRaw.map((i) => ({
      id: i.id,
      entregable: i.deliverable.nombre,
      proyecto: i.deliverable.project.nombre,
      baseline: i.baseline,
      delta: i.delta,
      validadoPor: i.validadoPor,
      fecha: i.fecha.toISOString().slice(0, 10),
    })),
    huecos: reactivos
      .filter((r) => r.semaforo !== 'patron')
      .map((r) => ({ orden: r.orden, texto: r.texto, semaforo: r.semaforo })),
  }
}
