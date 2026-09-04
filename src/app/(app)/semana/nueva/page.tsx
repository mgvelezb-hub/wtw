import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import { contextoPlaneacion } from './service'
import { PlaneadorSemanal } from './PlaneadorClient'

// `?semana=2026-W37` elige qué semana se planea. Sin el parámetro se planea la
// que ENTRA: el push del ritual manda aquí el domingo por la tarde, y antes el
// planeador miraba la semana que estaba terminando esa misma noche.
export default async function NuevaSemanaPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>
}) {
  const session = await verifySession()
  if (!session) redirect('/login')

  const { semana } = await searchParams
  const ctx = await contextoPlaneacion(session.userId, new Date(), semana)

  return (
    <main className="min-h-dvh bg-paper p-4">
      <div className="mx-auto max-w-3xl">
        <PlaneadorSemanal ctx={ctx} />
      </div>
    </main>
  )
}
