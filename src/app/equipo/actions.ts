'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { inviteColleague } from './service'

export async function inviteColleagueAction(email: string, nombre: string): Promise<string> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  const { tempPassword } = await inviteColleague(session.userId, email, nombre)
  revalidatePath('/equipo')
  return tempPassword
}
