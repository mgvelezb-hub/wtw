import { verifySession } from '@/lib/auth'
import { NuevaSemanaForm } from './NuevaSemanaForm'

export default async function NuevaSemanaPage() {
  const session = await verifySession()
  if (!session) return null

  return (
    <main className="min-h-dvh bg-neutral-50">
      <NuevaSemanaForm />
    </main>
  )
}
