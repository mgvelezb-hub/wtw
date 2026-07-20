'use client'

import { useTransition } from 'react'
import type { DayBlockView } from '@/app/(app)/dia/service'
import { stopTimerAction, toggleDodItemAction } from '@/app/(app)/dia/actions'

function fmt(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

export function FocusActivity({
  activity,
  tickMs,
  onTerminar,
}: {
  activity: DayBlockView
  tickMs: number | null
  onTerminar: (taskId: string, blockFin: string) => void
}) {
  const [pending, startTransition] = useTransition()

  const seconds =
    tickMs === null || !activity.runningSince
      ? activity.accumulatedSeconds
      : activity.accumulatedSeconds + (tickMs - new Date(activity.runningSince).getTime()) / 1000
  const over = seconds > activity.planMin * 60

  return (
    <div className="mx-auto max-w-2xl text-center">
      {activity.proyecto && (
        <span
          className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide text-white/90"
          style={{ backgroundColor: activity.proyecto.color }}
        >
          {activity.proyecto.nombre}
        </span>
      )}
      <h1 className="mt-3 font-serif text-4xl font-light text-[#ededed]">{activity.titulo}</h1>

      <p className={`mt-6 font-mono text-7xl font-bold tabular-nums ${over ? 'text-[#c9a24b]' : 'text-white'}`}>
        {fmt(seconds)}
      </p>
      <p className="mt-1 text-sm text-[#8a8578]">de {activity.planMin}min planeados</p>

      {activity.dodItems.length > 0 && (
        <ul className="mx-auto mt-6 max-w-sm space-y-2 text-left">
          {activity.dodItems.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={d.done}
                disabled={pending}
                onChange={() => startTransition(() => void toggleDodItemAction(d.id))}
              />
              <span className={d.done ? 'text-white/30 line-through' : 'text-white/80'}>{d.texto}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 flex justify-center gap-3">
        <button
          disabled={pending}
          onClick={() => startTransition(() => void stopTimerAction())}
          className="rounded-md bg-white/10 px-5 py-2 text-sm font-bold text-white hover:bg-white/20"
        >
          ❚❚ Pausar
        </button>
        <button
          disabled={pending || !activity.taskId}
          onClick={() => activity.taskId && onTerminar(activity.taskId, activity.fin)}
          className="rounded-md bg-[#15803d] px-5 py-2 text-sm font-bold text-white hover:bg-[#12692f]"
        >
          ✓ Terminar
        </button>
      </div>
    </div>
  )
}
