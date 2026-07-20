'use client'

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function FocusClock({ tickMs }: { tickMs: number | null }) {
  if (tickMs === null) return null
  const d = new Date(tickMs)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const fecha = `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`

  return (
    <div className="text-right">
      <p className="font-serif text-6xl font-thin tabular-nums tracking-wide text-[#ededed]">
        {hh}:{mm}
      </p>
      <p className="mt-1 text-sm capitalize tracking-wide text-[#8a8578]">{fecha}</p>
    </div>
  )
}
