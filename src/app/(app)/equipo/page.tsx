import { verifySession } from '@/lib/auth'
import { listReports } from './service'
import { EquipoBoard } from './EquipoBoard'

export default async function EquipoPage() {
  const session = await verifySession()
  if (!session) return null

  const reports = await listReports(session.userId)

  return (
    <main className="min-h-dvh bg-paper">
      <EquipoBoard reports={reports} />
    </main>
  )
}
