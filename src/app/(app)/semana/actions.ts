'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function toggleWinAction(winId: string) {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  const win = await prisma.win.findUnique({ where: { id: winId }, include: { week: true } })
  if (!win || win.week.userId !== session.userId) throw new Error('win no encontrado')

  await prisma.win.update({
    where: { id: winId },
    data: { estatus: win.estatus === 'logrado' ? 'pendiente' : 'logrado' },
  })
  revalidatePath('/semana')
}
