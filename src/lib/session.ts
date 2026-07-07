import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const ALGORITHM = 'HS256'

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.SESSION_SECRET!)
}

export async function encrypt(payload: { userId: string }): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret())
}

export async function decrypt(
  token: string | undefined
): Promise<{ userId: string; exp: number } | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret())
    return payload as { userId: string; exp: number }
  } catch {
    return null
  }
}

export async function createSession(userId: string): Promise<void> {
  const token = await encrypt({ userId })
  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  })
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('session')
}
