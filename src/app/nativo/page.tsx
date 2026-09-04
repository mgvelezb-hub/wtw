import { NativoPanel } from '@/app/(app)/settings/Nativo'

// Diagnóstico del cascarón nativo. Pública a propósito: sirve para probar el
// puente (notificaciones locales, plataforma) ANTES de tener sesión, que es
// justo el estado en que arranca una instalación nueva. En Safari no pinta
// nada más que el aviso.
export default function NativoPage() {
  return (
    <main className="min-h-dvh bg-paper">
      <div className="mx-auto max-w-md space-y-4 px-4 py-8">
        <h1 className="text-lg font-semibold text-ink">WTW en el dispositivo</h1>
        <p className="text-xs leading-relaxed text-muted">
          Esta página solo tiene contenido dentro de la app instalada. Si la ves en un navegador, no hay nada que
          probar aquí.
        </p>
        <NativoPanel />
      </div>
    </main>
  )
}
