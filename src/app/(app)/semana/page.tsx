import Link from 'next/link'
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
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-neutral-50 px-4 text-center">
        <p className="text-sm text-neutral-500">No hay semana activa todavía.</p>
        <Link href="/semana/nueva" className="rounded-full bg-brand-deep px-5 py-2.5 text-sm font-bold text-white">
          Planear la semana
        </Link>
        <p className="text-xs text-neutral-400">
          El ritual completo, en 5 pasos. También sigue disponible <code>/wtw-semana</code> desde el chat.
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
