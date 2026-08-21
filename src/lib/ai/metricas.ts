import { prisma } from '@/lib/prisma'

// Métrica de aceptación de la IA — lección Motion 2026: cada feature de IA
// tiene que demostrar su loop (¿lo usa la gente tal cual sale, o lo reescriben
// siempre?) o sale del producto. La señal ya vive en el schema sin tocarlo:
//
// - `AiCall` registra CADA llamada al modelo, agrupable por `feature`
//   (ver src/lib/ai/client.ts — todo llamador pasa por callModel()).
// - `Artifact.borrador` es la salida cruda y NUNCA se sobrescribe;
//   `Artifact.final` es lo que quedó tras la edición humana (o null si nadie
//   lo ha revisado todavía). Ese par es el diff de lo que Mau corrige.
//
// No toda feature genera Artifact — solo las que persisten un borrador
// editable (hoy: status_equipo, resumen_minuta — ver ArtifactTipo en el
// schema). Features como clasificar_minuta o planear_* solo dejan AiCall:
// para esas reportamos nada más el conteo de llamadas.

export type MetricaArtifacts = {
  total: number
  aceptadosSinEditar: number // final === borrador: se usó tal cual salió
  editados: number // final !== borrador (y no null): se corrigió antes de usarse
  pendientes: number // final === null: generado, todavía sin revisar
  pctAceptacion: number | null // aceptadosSinEditar / (aceptados + editados) * 100, redondeado. null si nada revisado aún.
}

export type MetricaFeature = {
  llamadas: number
  artifacts: MetricaArtifacts | null
}

export async function metricasAceptacion(userId: string): Promise<Record<string, MetricaFeature>> {
  const [llamadasPorFeature, artifacts] = await Promise.all([
    prisma.aiCall.groupBy({
      by: ['feature'],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.artifact.findMany({
      where: { userId },
      select: { tipo: true, borrador: true, final: true },
    }),
  ])

  const artifactsPorTipo = new Map<string, Array<{ borrador: string; final: string | null }>>()
  for (const a of artifacts) {
    const lista = artifactsPorTipo.get(a.tipo) ?? []
    lista.push({ borrador: a.borrador, final: a.final })
    artifactsPorTipo.set(a.tipo, lista)
  }

  // Unión de features con llamadas y features con artifacts (por si alguna
  // vez hay un Artifact huérfano de AiCall — no debería pasar, pero no lo
  // escondemos si pasa).
  const features = new Set<string>(llamadasPorFeature.map((f) => f.feature))
  for (const tipo of artifactsPorTipo.keys()) features.add(tipo)

  const resultado: Record<string, MetricaFeature> = {}
  for (const feature of Array.from(features).sort()) {
    const llamadas = llamadasPorFeature.find((f) => f.feature === feature)?._count._all ?? 0
    const lista = artifactsPorTipo.get(feature)

    if (!lista || lista.length === 0) {
      resultado[feature] = { llamadas, artifacts: null }
      continue
    }

    let aceptadosSinEditar = 0
    let editados = 0
    let pendientes = 0
    for (const a of lista) {
      if (a.final === null) pendientes++
      else if (a.final === a.borrador) aceptadosSinEditar++
      else editados++
    }
    const revisados = aceptadosSinEditar + editados

    resultado[feature] = {
      llamadas,
      artifacts: {
        total: lista.length,
        aceptadosSinEditar,
        editados,
        pendientes,
        pctAceptacion: revisados > 0 ? Math.round((aceptadosSinEditar / revisados) * 100) : null,
      },
    }
  }

  return resultado
}
