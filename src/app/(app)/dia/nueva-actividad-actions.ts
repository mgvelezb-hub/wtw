'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { callModel } from '@/lib/ai/client'
import { GENERATE } from '@/lib/ai/models'
import { ESTIMAR } from '@/app/(app)/semana/nueva/prompts'
import { extraerJSON } from '@/app/(app)/semana/nueva/parse-json'
import { crearActividadDelDia, type NuevaActividad } from './nueva-actividad'

async function userId(): Promise<string> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  return session.userId
}

export async function crearActividadDelDiaAction(data: NuevaActividad) {
  await crearActividadDelDia(await userId(), data)
  revalidatePath('/dia')
  revalidatePath('/semana')
  revalidatePath('/inbox')
}

// Mismo prompt que el paso 3 del planeador y las mismas referencias: tareas ya
// terminadas CON tiempo medido. Eso es lo que hace la estimación específica de
// Mau en vez de un promedio de internet — y por eso la sugerencia mejora sola
// conforme se corrigen los cronómetros olvidados.
export async function sugerirDuracionAction(
  titulo: string,
  herramienta?: string,
  proyecto?: string
): Promise<{ ok: true; estimadoMin: number; nota?: string } | { ok: false; error: string }> {
  const uid = await userId()
  if (!titulo.trim()) return { ok: false, error: 'Escribe primero de qué se trata.' }

  const medidas = await prisma.task.findMany({
    where: { userId: uid, estatus: 'done', estimadoMin: { not: null }, timeEntries: { some: {} } },
    select: { titulo: true, herramienta: true, timeEntries: { select: { seconds: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 25,
  })

  const contenido = [
    'Tareas a estimar:',
    `- [nueva] ${titulo.trim()}${herramienta ? ` · herramienta: ${herramienta}` : ''}${proyecto ? ` · ${proyecto}` : ''}`,
    '',
    'Referencias (tareas ya medidas, tiempo real):',
    ...medidas.map((m) => {
      const min = Math.round(m.timeEntries.reduce((s, e) => s + e.seconds, 0) / 60)
      return `- ${m.titulo}${m.herramienta ? ` · ${m.herramienta}` : ''} → ${min} min`
    }),
  ].join('\n')

  try {
    const { text } = await callModel({
      userId: uid,
      feature: 'sugerir_duracion',
      model: GENERATE,
      system: ESTIMAR,
      messages: [{ role: 'user', content: contenido }],
    })

    const datos = extraerJSON<Array<{ estimadoMin?: number | null; nota?: string }>>(text)
    const primero = Array.isArray(datos) ? datos[0] : null
    if (!primero || typeof primero.estimadoMin !== 'number' || primero.estimadoMin <= 0) {
      // Sin número usable se devuelve la nota del modelo si la hay: "es muy vaga
      // para estimar" es información útil, no un fallo que ocultar.
      return { ok: false, error: primero?.nota ?? 'La IA no pudo estimar esto. Ponle los minutos a mano.' }
    }

    return { ok: true, estimadoMin: Math.round(primero.estimadoMin), nota: primero.nota }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error desconocido'
    return { ok: false, error: msg.includes('ANTHROPIC_API_KEY') ? 'Falta la API key — pon los minutos a mano.' : msg }
  }
}
