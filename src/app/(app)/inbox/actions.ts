'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import type { Alcance } from '@prisma/client'
import { createInboxTask, discardTask } from './service'

async function userId(): Promise<string> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  return session.userId
}

export async function captureAction(data: {
  titulo: string
  herramienta?: string
  projectId?: string
  estimadoMin?: number
  alcance?: Alcance
  dolorCliente?: string
}) {
  if (!data.titulo.trim()) return
  await createInboxTask(await userId(), { ...data, titulo: data.titulo.trim() })
  revalidatePath('/inbox')
  revalidatePath('/dia')
}

export async function discardAction(taskId: string) {
  await discardTask(taskId, await userId())
  revalidatePath('/inbox')
}
