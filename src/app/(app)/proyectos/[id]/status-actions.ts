'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { listMinutas } from '@/app/api/v1/minutas/service'
import { generateStatusEquipo, updateArtifact } from '@/lib/ai/generate-status'
import type { Artifact, ArtifactEstado, MinutaItemEstado, MinutaItemTipo } from '@prisma/client'

// Server Actions de la vista de proyecto (Tarea 7, fase 7). Consumen los
// servicios existentes (src/app/api/v1/minutas/service.ts,
// src/lib/ai/generate-status.ts) — nunca duplican su lógica. Objetos planos
// al cliente: nunca se pasa un modelo de Prisma completo (regla 2, CLAUDE.md).

async function userId(): Promise<string> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  return session.userId
}

// ---- Minutas del proyecto (solo lectura aquí — la captura vive en /dia) ----

export type MinutaItemView = {
  id: string
  tipo: MinutaItemTipo
  texto: string
  responsable: string | null
  estado: MinutaItemEstado
}

export type MinutaView = {
  id: string
  fecha: string
  titulo: string
  asistentes: string[]
  items: MinutaItemView[]
}

export async function listMinutasAction(projectId: string): Promise<MinutaView[]> {
  const uid = await userId()
  const minutas = await listMinutas(uid, projectId)
  return minutas.map((m) => ({
    id: m.id,
    fecha: m.fecha.toISOString().slice(0, 10),
    titulo: m.titulo,
    asistentes: m.asistentes,
    items: m.items.map((i) => ({
      id: i.id,
      tipo: i.tipo,
      texto: i.texto,
      responsable: i.responsable,
      estado: i.estado,
    })),
  }))
}

// ---- Status para equipo (Artifact) ----

export type ArtifactView = {
  id: string
  borrador: string
  final: string | null
  estado: ArtifactEstado
  insumos: unknown
  createdAt: string
}

function toArtifactView(a: Artifact): ArtifactView {
  return {
    id: a.id,
    borrador: a.borrador,
    final: a.final,
    estado: a.estado,
    insumos: a.insumos,
    createdAt: a.createdAt.toISOString(),
  }
}

// Historial de artifacts status_equipo del proyecto, más reciente primero.
export async function listStatusArtifactsAction(projectId: string): Promise<ArtifactView[]> {
  const uid = await userId()
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project || project.userId !== uid) throw new Error('proyecto no encontrado')

  const artifacts = await prisma.artifact.findMany({
    where: { userId: uid, projectId, tipo: 'status_equipo' },
    orderBy: { createdAt: 'desc' },
  })
  return artifacts.map(toArtifactView)
}

// Genera un nuevo borrador de status. Si ANTHROPIC_API_KEY no está
// configurada, generateStatusEquipo (vía callModel) lanza
// "ANTHROPIC_API_KEY no configurada" — se propaga tal cual para que la UI la
// muestre en un banner legible, nunca un crash genérico.
export async function generarStatusAction(projectId: string): Promise<ArtifactView> {
  const uid = await userId()
  const artifact = await generateStatusEquipo(uid, projectId)
  revalidatePath(`/proyectos/${projectId}`)
  return toArtifactView(artifact)
}

// Guarda la edición del usuario sobre un borrador. `final`/`estado` — nunca
// toca `borrador` ni `insumos` (traza inmutable, §1 del diseño).
export async function guardarFinalAction(
  artifactId: string,
  final: string,
  estado: ArtifactEstado
): Promise<ArtifactView> {
  const uid = await userId()
  const artifact = await updateArtifact(uid, artifactId, { final, estado })
  revalidatePath('/proyectos')
  return toArtifactView(artifact)
}
