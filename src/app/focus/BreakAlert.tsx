'use client'

export function BreakAlert({
  breakMin,
  actividad,
  onPosponer,
}: {
  breakMin: number
  actividad: string
  onPosponer: () => void
}) {
  return (
    <div className="fixed left-1/2 top-8 z-40 flex -translate-x-1/2 items-center gap-4 rounded-lg border border-warn-strong/40 bg-[#141414] px-5 py-3 shadow-lg">
      <span className="text-2xl">🧘</span>
      <div>
        <p className="text-base font-medium text-[#ededed]">Llevas rato enfocado — tómate {breakMin} min</p>
        <p className="text-sm text-[#8a8578]">{actividad}</p>
      </div>
      <button
        onClick={onPosponer}
        className="ml-2 rounded-md px-3 py-1.5 text-sm font-medium text-white/50 hover:text-white"
      >
        Posponer
      </button>
    </div>
  )
}
