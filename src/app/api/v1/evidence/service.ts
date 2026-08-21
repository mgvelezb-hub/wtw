import { prisma } from '@/lib/prisma'

// Registro de evidencia compartido por las DOS capas de auth: la Server Action
// de /desarrollo (cookie de sesión) y POST /api/v1/evidence (Bearer PAT, skills
// /wtw-dia y /wtw-semana). La validación vive aquí y solo aquí.

export type RegistrarEvidenciaInput = {
  competencyId: string
  nota: string
  taskId?: string
  deliverableId?: string
  // Ambos opcionales a propósito: exigirlos convertiría el registro en un
  // formulario y la evidencia dejaría de capturarse. Pero sin testigo el comité
  // solo tiene tu palabra, y sin nivel no se sabe a qué altura operaste.
  testigo?: string
  nivelDemostrado?: string
}

export async function registrarEvidencia(userId: string, input: RegistrarEvidenciaInput) {
  const nota = input.nota.trim()
  if (nota === '') throw new Error('la evidencia necesita una nota')

  const testigo = input.testigo?.trim() || null

  // El nivel se valida contra el escalafón real: un string libre aquí rompería
  // el conteo de "a qué nivel operas" con variantes tipo "gerente"/"Gerente ".
  const nivelDemostrado = input.nivelDemostrado?.trim() || null
  if (nivelDemostrado !== null) {
    const nivel = await prisma.level.findUnique({ where: { nombre: nivelDemostrado }, select: { id: true } })
    if (!nivel) throw new Error('nivel no reconocido')
  }

  // Ownership: una evidencia solo puede colgar de trabajo propio. Sin esto, un id
  // ajeno permitiría acreditarse el trabajo de otro usuario.
  if (input.taskId) {
    const task = await prisma.task.findFirst({ where: { id: input.taskId, userId }, select: { id: true } })
    if (!task) throw new Error('tarea no encontrada')
  }
  if (input.deliverableId) {
    const entregable = await prisma.deliverable.findFirst({
      where: { id: input.deliverableId, project: { userId } },
      select: { id: true },
    })
    if (!entregable) throw new Error('entregable no encontrado')
  }

  return prisma.evidence.create({
    data: {
      userId,
      competencyId: input.competencyId,
      taskId: input.taskId,
      deliverableId: input.deliverableId,
      nota,
      testigo,
      nivelDemostrado,
    },
  })
}
