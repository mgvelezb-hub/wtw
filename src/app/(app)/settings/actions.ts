'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import { deleteSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function logoutAction() {
  await deleteSession()
  redirect('/login')
}

export type SettingsState = { error?: string; success?: boolean } | undefined

export async function updateSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  const factorManualRaw = String(formData.get('factorManual') ?? '')
  const bufferPct = Number(formData.get('bufferPct'))
  if (Number.isNaN(bufferPct) || bufferPct < 0 || bufferPct > 100) {
    return { error: 'Buffer debe ser un número entre 0 y 100' }
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: {
      horarioInicio: String(formData.get('horarioInicio')),
      horarioFin: String(formData.get('horarioFin')),
      comidaInicio: String(formData.get('comidaInicio')),
      comidaFin: String(formData.get('comidaFin')),
      bufferPct,
      icsUrl: String(formData.get('icsUrl') || '') || null,
      factorManual: factorManualRaw ? Number(factorManualRaw) : null,
    },
  })

  revalidatePath('/settings')
  return { success: true }
}
