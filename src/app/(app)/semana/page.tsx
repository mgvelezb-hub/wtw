import { verifySession } from '@/lib/auth'
import { isoWeekOf } from '@/lib/dates'
import { getWeekView } from './service'
import { SemanaBoard } from './SemanaBoard'

export default async function SemanaPage() {
  const session = await verifySession()
  if (!session) return null

  const view = await getWeekView(session.userId, isoWeekOf(new Date()))

  if (!view) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-neutral-50 px-4 text-center">
        <p className="text-sm text-neutral-500">
          No hay semana activa todavía. Corre <code>/wtw-semana</code>.
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-neutral-50">
      <SemanaBoard
        wins={view.week.wins}
        blocks={view.week.blocks}
        cargaHoras={view.cargaHoras}
        trabajableTotal={view.capacidad.trabajableTotal}
        trabajablePlaneable={view.capacidad.trabajablePlaneable}
      />
    </main>
  )
}
