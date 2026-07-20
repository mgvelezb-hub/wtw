'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { DayBlockView } from '@/app/(app)/dia/service'
import { startTimerAction, markTaskDoneAction } from '@/app/(app)/dia/actions'
import { getActiveBlock, getNextTaskBlock, getUpcomingMeeting } from '@/lib/focus-selectors'
import { useClock } from './useClock'
import { useWakeLock } from './useWakeLock'
import { FocusClock } from './FocusClock'
import { FocusMeeting } from './FocusMeeting'
import { FocusNextShadow } from './FocusNextShadow'
import { FocusActivity } from './FocusActivity'
import { StartNextModal } from './StartNextModal'

const MEETING_THRESHOLD_MIN = 5

export function FocusView({ blocks }: { blocks: DayBlockView[] }) {
  const router = useRouter()
  const { tickMs, nowHHMM } = useClock()
  const [, startTransition] = useTransition()
  const [modalNext, setModalNext] = useState<DayBlockView | null>(null)

  const activity = getActiveBlock(blocks)
  useWakeLock(activity !== null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') router.push('/dia')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [router])

  const next = nowHHMM ? getNextTaskBlock(blocks, activity?.inicio ?? nowHHMM) : null
  const meeting = nowHHMM ? getUpcomingMeeting(blocks, nowHHMM, MEETING_THRESHOLD_MIN) : null

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

      <div className="flex-1 flex items-center justify-center">
        {activity ? (
          <FocusActivity activity={activity} tickMs={tickMs} onTerminar={handleTerminar} />
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
