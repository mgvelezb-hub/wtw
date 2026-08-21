import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import { getPromotionCase, type ReactivoCaso, type ImpactoCaso } from './service'
import { BotonImprimir } from './BotonImprimir'

// One-pager print-first del promotion case (Fase 7). Print-only: no genera PDF
// programático — Cmd+P / Ctrl+P sobre esta página ES la exportación (ver
// BotonImprimir.tsx). Reusa getPromotionCase (./service.ts), que a su vez
// reusa getDesarrollo (../service.ts) para el cálculo del patrón: aquí solo
// vive la presentación.

const ESTILO_CHIP: Record<string, string> = {
  sin_evidencia: 'bg-danger text-white',
  anecdota: 'bg-warn-border text-warn',
  patron: 'bg-ok text-white',
}

const ETIQUETA_SEMAFORO: Record<string, string> = {
  sin_evidencia: 'sin evidencia',
  anecdota: 'anécdota',
  patron: 'patrón',
}

export default async function CasoPage(): Promise<React.ReactElement> {
  const session = await verifySession()
  if (!session) redirect('/login')

  const caso = await getPromotionCase(session.userId)

  return (
    <main className="promo-caso mx-auto max-w-3xl bg-white p-6 text-neutral-900 print:max-w-none print:p-0 print:text-[10.5px] print:leading-snug">
      {/* CSS de impresión, self-contenida en esta página: oculta la nav
          heredada del layout (app) por selector de atributo (no requiere
          tocar AppShell.tsx, que está fuera del scope de este cambio) y usa
          :has() para cancelar el padding del contenedor que la envuelve —
          progresivo: si el navegador no soporta :has(), el peor caso es un
          margen izquierdo de sobra, no contenido roto. */}
      <style>{`
        @media print {
          html, body { background: white !important; }
          nav[aria-label="Secciones"], nav[aria-label="Navegación principal"] { display: none !important; }
          :has(> .promo-caso), :has(.promo-caso) { padding: 0 !important; margin: 0 !important; }
          @page { margin: 1.2cm; }
        }
      `}</style>

      <header className="border-b border-neutral-200 pb-3 print:pb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-deep">Caso de promoción</p>
        <h1 className="mt-0.5 text-xl font-bold text-neutral-900 print:text-base">{caso.nombre}</h1>
        <p className="mt-0.5 text-sm text-neutral-600 print:text-xs">
          {caso.nivelActual ?? '—'} → <strong className="text-neutral-900">{caso.nivelObjetivo ?? '—'}</strong>
          <span className="ml-2 text-neutral-400">· {caso.fecha}</span>
        </p>
      </header>

      {caso.reactivos.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">
          No hay reactivos de nivel publicados para {caso.nivelObjetivo ?? 'el nivel objetivo'} — no hay caso que armar
          todavía.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm font-semibold text-neutral-900 print:mt-2 print:text-xs">{caso.veredicto}</p>

          <section className="mt-3 space-y-2.5 print:mt-2 print:space-y-1.5">
            {caso.reactivos.map((r) => (
              <ReactivoBloque key={r.orden} r={r} />
            ))}
          </section>

          {caso.impactos.length > 0 && (
            <section className="mt-4 print:mt-3">
              <h2 className="text-xs font-bold uppercase tracking-wide text-brand-deep">Impacto de cliente</h2>
              <ul className="mt-1.5 space-y-1.5 print:space-y-1">
                {caso.impactos.map((i) => (
                  <ImpactoLinea key={i.id} i={i} />
                ))}
              </ul>
            </section>
          )}

          {caso.huecos.length > 0 && (
            <p className="mt-4 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600 print:mt-3 print:rounded-none print:bg-transparent print:px-0 print:py-1">
              <strong className="text-neutral-800">Huecos honestos: </strong>
              reactivo{caso.huecos.length === 1 ? '' : 's'} {caso.huecos.map((h) => h.orden).join(', ')} sin patrón
              todavía.
            </p>
          )}
        </>
      )}

      <BotonImprimir />
    </main>
  )
}

function ReactivoBloque({ r }: { r: ReactivoCaso }): React.ReactElement {
  return (
    <div className="rounded-lg border border-neutral-200 p-2.5 print:break-inside-avoid print:rounded-none print:border-0 print:border-b print:border-neutral-200 print:p-0 print:pb-1.5">
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${ESTILO_CHIP[r.semaforo]} print:rounded-none print:bg-transparent print:px-0 print:text-neutral-900`}
        >
          {r.orden}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-neutral-800 print:text-[10.5px]">{r.texto}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-neutral-600 print:text-[9.5px]">
            {ETIQUETA_SEMAFORO[r.semaforo]} · {r.evidenciaCount} {r.evidenciaCount === 1 ? 'pieza' : 'piezas'}
          </p>

          {r.piezas.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-[11px] text-neutral-700 print:text-[9.5px]">
              {r.piezas.map((p, idx) => (
                <li key={idx}>
                  {p.nota}
                  {p.proyecto && <span className="text-neutral-500"> · {p.proyecto}</span>}
                  {p.testigo && <span className="text-neutral-500"> · testigo: {p.testigo}</span>}
                  <span className="text-neutral-400"> · hace {p.diasDesde}d</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function ImpactoLinea({ i }: { i: ImpactoCaso }): React.ReactElement {
  return (
    <li className="text-xs text-neutral-700 print:text-[9.5px]">
      <strong className="text-neutral-900">{i.entregable}</strong>
      <span className="text-neutral-500"> ({i.proyecto})</span>: {i.baseline} → <strong>{i.delta}</strong>
      {i.validadoPor && <span className="text-neutral-500"> · validado por {i.validadoPor}</span>}
    </li>
  )
}
