'use client'

import type { UpcomingMeeting, FocusBlock } from '@/lib/focus-selectors'

export function FocusMeeting({ meeting }: { meeting: UpcomingMeeting<FocusBlock> | null }) {
  if (!meeting) return null
  const { block, minutesUntil, highlight } = meeting

  return (
    <div
      className={`rounded-lg border px-4 py-2 text-right transition-colors ${
        highlight ? 'border-[#c9a24b] bg-[#c9a24b]/10 animate-pulse' : 'border-white/10'
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-[#8a8578]">Próxima junta</p>
      <p className="text-sm font-medium text-[#ededed]">{block.titulo}</p>
      <p className={`text-xs ${highlight ? 'text-[#c9a24b]' : 'text-[#8a8578]'}`}>
        {block.inicio} · en {minutesUntil} min
      </p>
    </div>
  )
}
