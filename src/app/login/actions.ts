'use server'

import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { createSession } from '@/lib/session'

export type LoginState = { error?: string } | undefined

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
    .toLowerCase()
    .trim()
  const password = String(formData.get('password') ?? '')

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: 'Credenciales inválidas' }
  }

  await createSession(user.id)
  redirect('/dia')
}
