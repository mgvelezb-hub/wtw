import { verifySession } from '@/lib/auth'
import { isoWeekOf, todayStr } from '@/lib/dates'
import { getDiaView } from './service'
import { DiaBoard } from './DiaBoard'

const ABR = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function fmtDia(fecha: string): { abr: string; num: string; full: string } {
  const d = new Date(fecha)
  return {
    abr: ABR[d.getUTCDay()],
    num: `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`,
    full: FULL[d.getUTCDay()],
  }
}

export default async function DiaPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const session = await verifySession()
  if (!session) return null

  const today = todayStr()
  const { dia } = await searchParams
  const selectedDay = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : today
  const isoWeek = isoWeekOf(new Date(selectedDay))

  const view = await getDiaView(session.userId, isoWeek, selectedDay, today)

  if (!view.week) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 text-center">
        <p className="text-sm text-neutral-500">
          No hay semana activa. Corre <code>/wtw-semana</code> para armarla.
        </p>
      </div>
    )
  }

  const tabs = view.capacidad.dias.map((d) => {
    const f = fmtDia(d.fecha)
    return { fecha: d.fecha, abr: f.abr, num: f.num }
  })

  const rangoInicio = view.week.rangoInicio.toISOString().slice(0, 10)
  const rangoFin = view.week.rangoFin.toISOString().slice(0, 10)

  return (
    <DiaBoard
      isoWeek={view.week.isoWeek}
      rango={`${rangoInicio} – ${rangoFin}`}
      factorUsado={Number(view.week.factorUsado)}
      desbloqueador={view.week.desbloqueador}
      wins={view.week.wins.map((w) => ({ posicion: w.posicion, titulo: w.titulo, estatus: w.estatus }))}
      trabajable={view.capacidad.trabajableTotal}
      carga={view.cargaSemHoras}
      colchon={view.capacidad.trabajablePlaneable - view.cargaSemHoras}
      pct={view.capacidad.trabajablePlaneable > 0 ? (view.cargaSemHoras / view.capacidad.trabajablePlaneable) * 100 : 0}
      tabs={tabs}
      selectedDay={selectedDay}
      today={today}
      selectedLabel={fmtDia(selectedDay).full}
      blocks={view.blocks}
      planeadoMin={view.planeadoMin}
      realMin={view.realMin}
      factorDia={view.factorDia}
      libresHoy={view.libresHoy}
      capacidadHoy={view.capacidadHoy}
      pendientes={view.pendientes}
      stranded={view.stranded}
    />
  )
}
