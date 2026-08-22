import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import { contextoPlaneacion } from './service'
import { PlaneadorSemanal } from './PlaneadorClient'

export default async function NuevaSemanaPage() {
  const session = await verifySession()
  if (!session) redirect('/login')

  const ctx = await contextoPlaneacion(session.userId)

  return (
    <main className="min-h-dvh bg-paper p-4">
      <div className="mx-auto max-w-3xl">
        <PlaneadorSemanal ctx={ctx} />
      </div>
    </main>
  )
}
