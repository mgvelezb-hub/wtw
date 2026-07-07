import 'server-only'
import { cookies } from 'next/headers'
import { decrypt } from './session'

export async function verifySession(): Promise<{ userId: string; exp: number } | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get('session')?.value
  return decrypt(cookie)
}
