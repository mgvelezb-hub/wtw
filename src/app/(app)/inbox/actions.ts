'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import type { Alcance, TipoTrabajo } from '@prisma/client'
import { createInboxTask, discardTask, etiquetarClases } from './service'

async function userId(): Promise<string> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  return session.userId
}

export async function captureAction(data: {
  titulo: string
  herramienta?: string
  tipoTrabajo?: TipoTrabajo
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

// El lote se confirma completo: la sugerencia se calculó en el servidor y el
// humano la revisó en pantalla. Lo que llega aquí ya es una decisión, no una
// propuesta — pero se re-escopa por userId igual, porque los ids vienen del
// cliente.
export async function etiquetarClasesAction(pares: Array<{ id: string; tipo: TipoTrabajo }>) {
  if (pares.length === 0) return { escritas: 0 }
  const escritas = await etiquetarClases(await userId(), pares)
  revalidatePath('/inbox')
  revalidatePath('/semana/nueva')
  return { escritas }
}

export async function discardAction(taskId: string) {
  await discardTask(taskId, await userId())
  revalidatePath('/inbox')
}
