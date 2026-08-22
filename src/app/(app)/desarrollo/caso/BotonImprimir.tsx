'use client'

// Excepción deliberada a "cero diálogos nativos": aquí el diálogo del SISTEMA
// (Cmd+P / Ctrl+P → guardar como PDF) ES la función que este botón ofrece, no
// un atajo alrededor de ella. print:hidden lo saca de la hoja impresa.
export function BotonImprimir(): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden fixed bottom-4 right-4 z-10 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-strong"
    >
      Imprimir / guardar PDF
    </button>
  )
}
