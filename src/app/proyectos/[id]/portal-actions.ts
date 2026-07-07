'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { newPortalToken, hashPortalToken } from '@/lib/tokens'

export async function generatePortalLinkAction(projectId: string): Promise<string> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project || project.userId !== session.userId) throw new Error('proyecto no encontrado')

  const token = newPortalToken()
  await prisma.project.update({ where: { id: projectId }, data: { portalTokenHash: hashPortalToken(token) } })
  revalidatePath(`/proyectos/${projectId}`)
  return token
}

export async function revokePortalLinkAction(projectId: string) {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project || project.userId !== session.userId) throw new Error('proyecto no encontrado')
  await prisma.project.update({ where: { id: projectId }, data: { portalTokenHash: null } })
  revalidatePath(`/proyectos/${projectId}`)
}
