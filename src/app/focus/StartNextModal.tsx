'use client'

export function StartNextModal({
  siguienteTitulo,
  onIniciar,
  onEsperar,
}: {
  siguienteTitulo: string
  onIniciar: () => void
  onEsperar: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#141414] p-6 text-center">
        <p className="text-sm text-[#8a8578]">Terminaste antes de tiempo</p>
        <p className="mt-2 text-lg font-medium text-[#ededed]">¿Iniciar "{siguienteTitulo}" ahora?</p>
        <div className="mt-5 flex justify-center gap-3">
          <button
            onClick={onEsperar}
            className="rounded-md px-4 py-2 text-sm font-medium text-white/60 hover:text-white"
          >
            Esperar su horario
          </button>
          <button
            onClick={onIniciar}
            className="rounded-md bg-[#c9a24b] px-4 py-2 text-sm font-bold text-[#1a1a1a] hover:bg-[#b8923f]"
          >
            Iniciar ahora
          </button>
        </div>
      </div>
    </div>
  )
}
