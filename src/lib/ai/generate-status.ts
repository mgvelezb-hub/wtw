import { prisma } from '@/lib/prisma'
import type { Artifact, ArtifactEstado } from '@prisma/client'
import { callModel } from '@/lib/ai/client'
import { GENERATE } from '@/lib/ai/models'
import { buildStatusContext } from '@/lib/ai/status-context'
import { buildStatusEquipoPrompt, PROMPT_VERSION } from '@/lib/ai/prompts/status-equipo'

// Servicio: ensambla contexto → arma prompt → llama al modelo → persiste
// Artifact. Ver docs/plans/2026-07-16-fase7-pmo-ia-design.md §5-6 (Tarea 5).

const VOICE_PROFILE_TIPO = 'voice_status_equipo'
const FEWSHOT_LIMIT = 2

// Orden de few-shots: más reciente primero — mismo criterio que
// `statusAnterior` en status-context.ts (el status más reciente es la
// referencia de continuidad más fuerte).
async function getFewshots(userId: string, projectId: string): Promise<string[]> {
  const artifacts = await prisma.artifact.findMany({
    where: {
      userId,
      projectId,
      tipo: 'status_equipo',
      estado: { in: ['editado', 'enviado'] },
      final: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: FEWSHOT_LIMIT,
  })
  return artifacts.map((artifact) => artifact.final as string)
}

export async function generateStatusEquipo(userId: string, projectId: string): Promise<Artifact> {
  // buildStatusContext ya valida ownership del proyecto (lanza si no es del usuario).
  const insumos = await buildStatusContext(userId, projectId)

  const [user, perfil, fewshots] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.aiProfile.findFirst({ where: { userId, projectId: null, tipo: VOICE_PROFILE_TIPO } }),
    getFewshots(userId, projectId),
  ])

  if (!perfil) {
    throw new Error(
      `no existe AiProfile de tipo "${VOICE_PROFILE_TIPO}" para este usuario — corre scripts/seed-ai-profile.ts o crea el perfil primero`
    )
  }

  const { system, messages } = buildStatusEquipoPrompt({
    nombreUsuario: user?.nombre ?? 'el usuario',
    perfilVoz: perfil.contenido,
    fewshots,
    insumos,
  })

  const { text } = await callModel({
    userId,
    feature: 'status_equipo',
    model: GENERATE,
    system,
    messages,
  })

  return prisma.artifact.create({
    data: {
      userId,
      projectId,
      tipo: 'status_equipo',
      audiencia: 'equipo',
      rangoDesde: new Date(insumos.rangoDesde),
      rangoHasta: new Date(),
      insumos: insumos as object,
      borrador: text,
      estado: 'borrador',
      modelo: GENERATE,
      promptVersion: PROMPT_VERSION,
    },
  })
}

export type UpdateArtifactInput = Partial<{
  final: string
  estado: ArtifactEstado
}>

const ESTADOS_VALIDOS: ArtifactEstado[] = ['borrador', 'editado', 'enviado', 'descartado']

async function getOwnedArtifact(userId: string, artifactId: string): Promise<Artifact> {
  const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } })
  if (!artifact || artifact.userId !== userId) throw new Error('artifact no encontrado')
  return artifact
}

// Actualiza `final`/`estado` de un Artifact ya existente. NUNCA toca
// `borrador` ni `insumos` — son la traza inmutable de lo que el modelo vio y
// generó (§1 del diseño: el par borrador/final es el activo de aprendizaje).
export async function updateArtifact(
  userId: string,
  artifactId: string,
  input: UpdateArtifactInput
): Promise<Artifact> {
  await getOwnedArtifact(userId, artifactId)

  if (input.estado !== undefined && !ESTADOS_VALIDOS.includes(input.estado)) {
    throw new Error(`estado inválido: ${input.estado}`)
  }

  return prisma.artifact.update({
    where: { id: artifactId },
    data: {
      final: input.final,
      estado: input.estado,
    },
  })
}

export async function getArtifact(userId: string, artifactId: string): Promise<Artifact> {
  return getOwnedArtifact(userId, artifactId)
}
