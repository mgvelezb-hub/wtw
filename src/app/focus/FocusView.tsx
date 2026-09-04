'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { DayBlockView } from '@/app/(app)/dia/service'
import { startTimerAction, stopTimerAction, markTaskDoneAction } from '@/app/(app)/dia/actions'
import {
  getActiveBlock,
  getNextTaskBlock,
  getUpcomingMeeting,
  getBreakSuggestion,
  pickRememberedActivity,
} from '@/lib/focus-selectors'
import { useClock } from './useClock'
import { useWakeLock } from './useWakeLock'
import { FocusClock } from './FocusClock'
import { FocusMeeting } from './FocusMeeting'
import { FocusNextShadow } from './FocusNextShadow'
import { FocusActivity } from './FocusActivity'
import { StartNextModal } from './StartNextModal'
import { BreakAlert } from './BreakAlert'

const MEETING_THRESHOLD_MIN = 5

export function FocusView({ blocks }: { blocks: DayBlockView[] }) {
  const router = useRouter()
  const { tickMs, nowHHMM } = useClock()
  const [, startTransition] = useTransition()
  const [modalNext, setModalNext] = useState<DayBlockView | null>(null)
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null)
  const [dismissedRunningSince, setDismissedRunningSince] = useState<string | null>(null)

  // Recordamos qué tarea es "la de Focus" para que al pausar (runningSince
  // vuelve a null) siga siendo la actividad mostrada, con botón Reanudar,
  // en vez de desaparecer de la vista.
  //
  // Se ajusta DURANTE el render y no en un efecto: es el patrón de React para
  // estado que deriva de props cambiantes. El efecto pintaba un frame con la
  // actividad vieja antes de corregirse, y necesitaba una lista de dependencias
  // incompleta para no borrar el recuerdo al pausar.
  const runningNow = getActiveBlock(blocks)
  const [ultimoRunningId, setUltimoRunningId] = useState<string | null>(null)
  if (runningNow && runningNow.id !== ultimoRunningId) {
    setUltimoRunningId(runningNow.id)
    setFocusTaskId(runningNow.taskId)
  }

  const activity = pickRememberedActivity(blocks, focusTaskId, runningNow)
  const isPaused = activity !== null && activity.runningSince === null
  useWakeLock(activity !== null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') router.push('/dia')
      if ((e.key === ' ' || e.code === 'Space') && e.target === document.body && activity?.taskId) {
        e.preventDefault()
        const action = isPaused ? startTimerAction(activity.taskId) : stopTimerAction()
        startTransition(() => {
          void action.then(() => router.refresh())
        })
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [router, activity?.taskId, isPaused, startTransition])

  const next = nowHHMM ? getNextTaskBlock(blocks, activity?.inicio ?? nowHHMM) : null
  const meeting = nowHHMM ? getUpcomingMeeting(blocks, nowHHMM, MEETING_THRESHOLD_MIN) : null

  // El tiempo de foco continuo se mide desde el runningSince actual: al
  // pausar y reanudar ese timestamp cambia, así que el conteo se reinicia
  // solo — pausar ya cuenta como el descanso.
  const continuousSeconds =
    tickMs !== null && activity?.runningSince ? (tickMs - new Date(activity.runningSince).getTime()) / 1000 : 0
  const breakSuggestion = activity ? getBreakSuggestion(activity.planMin) : null
  const showBreakAlert =
    !!activity?.runningSince &&
    !!breakSuggestion &&
    continuousSeconds >= breakSuggestion.umbralMin * 60 &&
    dismissedRunningSince !== activity.runningSince

  function handleTerminar(taskId: string, blockFin: string) {
    const eraTemprano = !!nowHHMM && nowHHMM < blockFin
    startTransition(() => {
      void markTaskDoneAction(taskId).then(() => {
        router.refresh()
        if (eraTemprano && next) setModalNext(next)
      })
    })
  }

  function handleIniciarSiguiente() {
    if (!modalNext?.taskId) return
    startTransition(() => {
      void startTimerAction(modalNext.taskId!).then(() => router.refresh())
    })
    setModalNext(null)
  }

  return (
    <div className="flex min-h-dvh flex-col justify-between bg-[#0a0a0a] p-8">
      <div className="flex items-start justify-between">
        <button onClick={() => router.push('/dia')} className="text-2xl text-white/30 hover:text-white/70">
          ✕
        </button>
        <div className="flex items-start gap-4">
          <FocusMeeting meeting={meeting} />
          <FocusClock tickMs={tickMs} />
        </div>
      </div>

      {showBreakAlert && breakSuggestion && (
        <BreakAlert
          breakMin={breakSuggestion.breakMin}
          actividad={breakSuggestion.actividad}
          onPosponer={() => setDismissedRunningSince(activity!.runningSince)}
        />
      )}

      <div className="flex-1 flex items-center justify-center">
        {activity ? (
          <FocusActivity activity={activity} tickMs={tickMs} isPaused={isPaused} onTerminar={handleTerminar} />
        ) : (
          <p className="text-center text-lg text-white/40">Sin actividad en curso — inicia una desde /dia</p>
        )}
      </div>

      <FocusNextShadow next={next} nowHHMM={nowHHMM} />

      {modalNext && (
        <StartNextModal
          siguienteTitulo={modalNext.titulo}
          onIniciar={handleIniciarSiguiente}
          onEsperar={() => setModalNext(null)}
        />
      )}
    </div>
  )
}
