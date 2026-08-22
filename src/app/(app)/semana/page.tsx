import Link from 'next/link'
import { verifySession } from '@/lib/auth'
import { isoWeekOf, todayStr } from '@/lib/dates'
import { getLienzoSemana } from './service'
import { SemanaBoard } from './SemanaBoard'

export default async function SemanaPage() {
  const session = await verifySession()
  if (!session) return null

  const hoy = todayStr()
  // `getLienzoSemana` ya devuelve objetos planos y serializables (regla 2): la
  // página no toca filas de Prisma ni las pasa al board.
  const lienzo = await getLienzoSemana(session.userId, isoWeekOf(new Date(hoy)), hoy)

  if (!lienzo) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-paper px-4 text-center">
        <p className="lbl">Semana sin planear</p>
        <p className="text-sm text-muted">No hay semana activa todavía.</p>
        <Link href="/semana/nueva" className="rounded-md bg-brand-deep px-5 py-2.5 text-sm font-bold text-white">
          Planear la semana
        </Link>
        <p className="text-xs text-faint">
          El ritual completo, en 5 pasos. También sigue disponible <code className="num">/wtw-semana</code> desde el
          chat.
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-paper">
      <SemanaBoard v={lienzo} />
    </main>
  )
}
