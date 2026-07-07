import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import { LoginForm } from './LoginForm'

export default async function LoginPage() {
  // Check DB-aware (no solo firma del JWT como el proxy): si hay sesión válida,
  // manda a /dia. Esto vive aquí, no en el proxy, para evitar el loop
  // login↔dia cuando una cookie firmada apunta a un usuario ya borrado.
  const session = await verifySession()
  if (session) redirect('/dia')
  return <LoginForm />
}
