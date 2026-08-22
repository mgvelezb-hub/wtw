import { verifySession } from '@/lib/auth'
import { todayStr } from '@/lib/dates'
import { getCierreDia, getPatronDesvios, ventanaCompuerta } from './service'
import { CierreBoard } from './CierreBoard'

function corrido(fecha: string, dias: number): string {
  const d = new Date(fecha)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export default async function CierrePage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const session = await verifySession()
  if (!session) return null

  const { dia } = await searchParams
  const fecha = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : todayStr()
  const ventana = ventanaCompuerta(new Date(fecha))

  const [cierre, patron] = await Promise.all([
    getCierreDia(session.userId, fecha),
    getPatronDesvios(session.userId, ventana.desde, ventana.hasta),
  ])

  return (
    <main className="min-h-dvh bg-paper">
      <div className="mx-auto max-w-2xl p-4">
        <CierreBoard
          cierre={cierre}
          patron={patron}
          diaAnterior={corrido(fecha, -1)}
          diaSiguiente={corrido(fecha, 1)}
        />
      </div>
    </main>
  )
}
