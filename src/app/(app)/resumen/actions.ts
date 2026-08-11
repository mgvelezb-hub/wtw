'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { callModel } from '@/lib/ai/client'
import { GENERATE } from '@/lib/ai/models'
import { RESUMEN_SYSTEM, RESUMEN_VERSION } from '@/lib/ai/prompts/resumen'
import { ensamblarResumen, renderContexto, type AlcanceResumen } from './service'

export type ResultadoResumen =
  | { ok: true; artifactId: string; texto: string; etiqueta: string; insumos: { minutas: number; tareas: number; issues: number; entregables: number } }
  | { ok: false; error: string }

export async function generarResumenAction(alcance: AlcanceResumen): Promise<ResultadoResumen> {
  const session = await verifySession()
  if (!session) return { ok: false, error: 'no autenticado' }

  const ctx = await ensamblarResumen(session.userId, alcance)
  if (ctx.vacio) {
    return { ok: false, error: 'No hay minutas ni trabajo abierto en ese alcance. Nada que resumir.' }
  }

  try {
    const { text } = await callModel({
      userId: session.userId,
      feature: 'resumen_minuta',
      model: GENERATE,
      system: RESUMEN_SYSTEM,
      messages: [{ role: 'user', content: renderContexto(ctx) }],
      maxTokens: 4000,
    })

    // El Artifact guarda el borrador crudo y el snapshot de insumos: sin eso no
    // se puede auditar después de qué se alimentó un resumen que salió mal.
    const artifact = await prisma.artifact.create({
      data: {
        userId: session.userId,
        projectId: alcance.tipo === 'proyecto' ? alcance.projectId : undefined,
        tipo: 'resumen_minuta',
        audiencia: ctx.etiqueta,
        rangoDesde: ctx.desde ? new Date(ctx.desde) : undefined,
        rangoHasta: ctx.hasta ? new Date(ctx.hasta) : undefined,
        insumos: ctx.insumos,
        borrador: text,
        modelo: GENERATE,
        promptVersion: RESUMEN_VERSION,
      },
    })

    revalidatePath('/resumen')
    return {
      ok: true,
      artifactId: artifact.id,
      texto: text,
      etiqueta: ctx.etiqueta,
      insumos: {
        minutas: ctx.minutas.length,
        tareas: ctx.tareas.length,
        issues: ctx.issues.length,
        entregables: ctx.entregables.length,
      },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error desconocido'
    return { ok: false, error: msg.includes('ANTHROPIC_API_KEY') ? 'Falta la API key de Anthropic.' : msg }
  }
}

// Guarda la versión editada. `borrador` NUNCA se sobrescribe: el par
// borrador/final es el diff del que la capa IA aprende qué corrige Mau siempre.
export async function guardarResumenFinalAction(artifactId: string, final: string): Promise<void> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  const { count } = await prisma.artifact.updateMany({
    where: { id: artifactId, userId: session.userId },
    data: { final, estado: 'editado' },
  })
  if (count === 0) throw new Error('resumen no encontrado')

  revalidatePath('/resumen')
}

// Marca que el resumen se usó de verdad (se copió o se mandó) — señal de
// aceptación, distinta de "lo generé y lo dejé ahí".
export async function marcarResumenEnviadoAction(artifactId: string): Promise<void> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  await prisma.artifact.updateMany({
    where: { id: artifactId, userId: session.userId },
    data: { estado: 'enviado' },
  })
  revalidatePath('/resumen')
}
