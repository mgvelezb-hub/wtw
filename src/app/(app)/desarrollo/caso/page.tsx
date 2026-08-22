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
  sin_evidencia: 'bg-danger-soft text-danger',
  anecdota: 'bg-warn-soft text-warn',
  patron: 'bg-ok-soft text-ok',
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
    <main className="promo-caso mx-auto max-w-3xl bg-paper p-6 text-ink print:max-w-none print:bg-white print:p-0 print:text-[10.5px] print:leading-snug">
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

      <header className="border-b border-hair pb-3 print:pb-2">
        <p className="lbl">Caso de promoción</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-[1.15] text-ink print:text-base">{caso.nombre}</h1>
        <p className="mt-1 text-sm text-muted print:text-xs">
          {caso.nivelActual ?? '—'} → <strong className="font-semibold text-ink">{caso.nivelObjetivo ?? '—'}</strong>
          <span className="num ml-2 text-faint">· {caso.fecha}</span>
        </p>
      </header>

      {caso.reactivos.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          No hay reactivos de nivel publicados para {caso.nivelObjetivo ?? 'el nivel objetivo'} — no hay caso que armar
          todavía.
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm font-semibold text-ink print:mt-2 print:text-xs">{caso.veredicto}</p>

          <section className="mt-4 print:mt-2">
            {caso.reactivos.map((r) => (
              <ReactivoBloque key={r.orden} r={r} />
            ))}
          </section>

          {caso.impactos.length > 0 && (
            <section className="mt-4 print:mt-3">
              <h2 className="lbl">Impacto de cliente</h2>
              <ul className="mt-1.5 space-y-1.5 print:space-y-1">
                {caso.impactos.map((i) => (
                  <ImpactoLinea key={i.id} i={i} />
                ))}
              </ul>
            </section>
          )}

          {caso.huecos.length > 0 && (
            <p className="mt-5 border-t border-hair pt-2.5 text-xs text-muted print:mt-3 print:py-1">
              <strong className="font-semibold text-ink">Huecos honestos: </strong>
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
    <div className="border-b border-hair py-2.5 print:break-inside-avoid print:py-1.5">
      <div className="flex items-start gap-2">
        <span
          className={`num mt-0.5 inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ${ESTILO_CHIP[r.semaforo]} print:h-auto print:w-auto print:rounded-none print:bg-transparent print:pr-1 print:text-ink`}
        >
          {r.orden}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink print:text-[10.5px]">{r.texto}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-muted print:text-[9.5px]">
            {ETIQUETA_SEMAFORO[r.semaforo]} · {r.evidenciaCount} {r.evidenciaCount === 1 ? 'pieza' : 'piezas'}
          </p>

          {r.piezas.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-[11px] text-muted print:text-[9.5px]">
              {r.piezas.map((p, idx) => (
                <li key={idx}>
                  {p.nota}
                  {p.proyecto && <span> · {p.proyecto}</span>}
                  {p.testigo && <span> · testigo: {p.testigo}</span>}
                  <span className="num text-faint print:text-muted"> · hace {p.diasDesde}d</span>
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
    <li className="text-xs text-muted print:text-[9.5px]">
      <strong className="font-semibold text-ink">{i.entregable}</strong>
      <span> ({i.proyecto})</span>: {i.baseline} → <strong className="text-ink">{i.delta}</strong>
      {i.validadoPor && <span> · validado por {i.validadoPor}</span>}
    </li>
  )
}
