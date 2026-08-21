'use client'

import type { UpcomingMeeting, FocusBlock } from '@/lib/focus-selectors'

export function FocusMeeting({ meeting }: { meeting: UpcomingMeeting<FocusBlock> | null }) {
  if (!meeting) return null
  const { block, minutesUntil, highlight } = meeting

  return (
    <div
      className={`rounded-lg border px-4 py-2 text-right transition-colors ${
        highlight ? 'border-warn-strong bg-warn-strong/10 animate-pulse' : 'border-white/10'
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-[#8a8578]">Próxima junta</p>
      <p className="text-base font-medium text-[#ededed]">{block.titulo}</p>
      <p className={`text-sm ${highlight ? 'text-warn-strong' : 'text-[#8a8578]'}`}>
        {block.inicio} · en {minutesUntil} min
      </p>
    </div>
  )
}
