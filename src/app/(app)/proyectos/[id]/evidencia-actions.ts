'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { inferirEvidencia } from '@/lib/ai/inferir-evidencia'
// Se IMPORTA la action de desarrollo en vez de reimplementar el registro: ahí
// vive el ownership de Task/Deliverable y los revalidatePath de /desarrollo y
// /dia. Duplicarla aquí garantizaría que las dos versiones se separen
// (mismo principio que "ambas capas de auth llaman los MISMOS service.ts").
import { registrarEvidenciaAction } from '@/app/(app)/desarrollo/actions'

// Server Actions de "evidencia inferida desde minutas". La IA propone; el
// registro SIEMPRE pasa por un tap de Mau sobre una sugerencia concreta —
// ninguna ruta de este archivo escribe Evidence sin esa confirmación explícita.

// Los tipos se declaran inline (no se re-exportan tipos importados): un archivo
// 'use server' convierte cada export en un re-export de valor en runtime.
export type SugerenciaView = {
  competencyId: string
  competenciaTexto: string
  competenciaBloque: string
  nota: string
  confianza: 'alta' | 'media'
}

export type ResultadoInferencia =
  | { ok: true; sugerencias: SugerenciaView[]; candidatosEvaluados: number }
  | { ok: false; error: string }

async function userId(): Promise<string> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  return session.userId
}

// Nunca lanza hacia la UI: devuelve la unión para que el componente muestre el
// banner ámbar (incluido el caso "falta la API key") en vez de reventar el
// árbol de React — molde de clasificarMinutaAction.
export async function inferirEvidenciaAction(minutaId: string): Promise<ResultadoInferencia> {
  const session = await verifySession()
  if (!session) return { ok: false, error: 'no autenticado' }

  try {
    // inferirEvidencia ya valida que la minuta sea del usuario.
    const r = await inferirEvidencia(session.userId, minutaId)
    return {
      ok: true,
      sugerencias: r.sugerencias.map((s) => ({
        competencyId: s.competencyId,
        competenciaTexto: s.competenciaTexto,
        competenciaBloque: s.competenciaBloque,
        nota: s.nota,
        confianza: s.confianza,
      })),
      candidatosEvaluados: r.candidatosEvaluados,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error desconocido'
    return {
      ok: false,
      error: msg.includes('ANTHROPIC_API_KEY')
        ? 'Falta la API key de Anthropic — registra la evidencia a mano desde /desarrollo.'
        : msg,
    }
  }
}

// Evidence no tiene minutaId (no se tocó el schema), así que la trazabilidad va
// dentro de la nota: sin la cita, dentro de un año la evidencia dice qué pasó
// pero no dónde verificarlo, y una rúbrica no auditable no sirve para negociar
// una promoción.
function conProcedencia(nota: string, titulo: string, fecha: Date): string {
  const dia = fecha.toISOString().slice(0, 10)
  const cita = `[Minuta: ${titulo} · ${dia}]`
  return nota.includes(cita) ? nota : `${nota} ${cita}`
}

// Un tap = una Evidence. `nota` llega editada por Mau desde la UI: se guarda lo
// que él dejó, no lo que propuso el modelo.
export async function registrarEvidenciaInferidaAction(input: {
  minutaId: string
  competencyId: string
  nota: string
}): Promise<void> {
  const uid = await userId()

  const nota = input.nota.trim()
  if (nota === '') throw new Error('la evidencia necesita una nota')

  const minuta = await prisma.minuta.findFirst({
    where: { id: input.minutaId, userId: uid },
    select: { titulo: true, fecha: true, projectId: true },
  })
  if (!minuta) throw new Error('minuta no encontrada')

  // El competencyId viene del cliente: sin esta comprobación un id inventado
  // llegaría a la FK de Evidence como un error de Prisma ilegible.
  const competencia = await prisma.competency.findUnique({
    where: { id: input.competencyId },
    select: { id: true },
  })
  if (!competencia) throw new Error('reactivo no encontrado')

  await registrarEvidenciaAction({
    competencyId: competencia.id,
    nota: conProcedencia(nota, minuta.titulo, minuta.fecha),
  })

  revalidatePath(`/proyectos/${minuta.projectId}`)
}
