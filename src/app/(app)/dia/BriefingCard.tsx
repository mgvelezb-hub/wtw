'use client'

import type { ReactNode } from 'react'
import { AyudaContextual } from '@/components/ayuda-contextual'
import { useLocalStorage, escribirLocal } from '@/lib/local-store'
import type { Briefing } from '@/lib/briefing'

// "Tu arranque" — la card del briefing matutino.
//
// Es el único momento proactivo del día y por eso vive donde el día empieza:
// arriba de todo, antes del header, en la ruta que ya se abre cada mañana. No
// hay notificación, no hay badge, no hay nada que perseguir.
//
// Reglas de tono, que son la mitad del diseño:
//   - Una línea por sección, en modo dato. "2 arrastradas por decidir", no
//     "¡Ojo! Llevas 2 tareas sin terminar 😬".
//   - Cero color de alarma salvo donde el semáforo de carga ya lo justifica —
//     la gramática de color de la app reserva ámbar y rojo para advertencia y
//     atraso reales, no para llamar la atención.
//   - Colapsable, y el colapso se recuerda POR DÍA: cerrarlo hoy no lo cierra
//     para siempre. Mañana vuelve, porque mañana es otro arranque.

const CLAVE_COLAPSO = 'wtw-briefing-colapsado'

const DIA_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

// "2026-08-19" se parsea como medianoche UTC, así que getUTCDay es el día real.
function diaSemanaDe(fecha: string): string {
  return DIA_SEMANA[new Date(fecha).getUTCDay()]
}

function duracion(min: number): string {
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

function Linea({ icono, children, tono = 'calma' }: { icono: string; children: ReactNode; tono?: 'calma' | 'ambar' | 'rojo' }) {
  const color = tono === 'rojo' ? 'text-danger' : tono === 'ambar' ? 'text-warn' : 'text-muted'
  return (
    <li className="flex gap-2 leading-relaxed">
      <span aria-hidden className={`mt-px shrink-0 ${tono === 'calma' ? 'text-faint' : color}`}>
        {icono}
      </span>
      <span className={color}>{children}</span>
    </li>
  )
}

export function BriefingCard({ briefing }: { briefing: Briefing }) {
  // Se guarda la FECHA, no un booleano: así el colapso caduca solo al cambiar
  // el día, sin necesidad de limpiarlo en ninguna parte. En el servidor el
  // store responde `null` y la card se muestra abierta, que es el estado útil
  // por defecto (regla 1: nada de localStorage durante el render).
  const guardada = useLocalStorage(CLAVE_COLAPSO)
  const colapsado = guardada === null ? null : guardada === briefing.fecha

  function alternar() {
    escribirLocal(CLAVE_COLAPSO, colapsado ?? false ? null : briefing.fecha)
  }

  // Guarda propia además de la del tablero: una card de arranque vacía —marco,
  // título y nada adentro— es peor que no tenerla. El hook va ANTES del return
  // para no romper el orden de hooks entre renders.
  if (!briefing.hayContenido) return null

  const abierto = colapsado !== true
  const b = briefing

  return (
    // Sin card: el arranque es una sección más del instrumento — etiqueta,
    // renglones y una línea que la cierra. La caja blanca con sombra la hacía
    // parecer una notificación, que es justo lo que NO es.
    <section aria-labelledby="briefing-titulo">
      <div className="flex items-center gap-1.5">
        <h2 id="briefing-titulo" className="lbl flex items-center gap-1.5">
          Tu arranque
          <AyudaContextual
            titulo="Tu arranque"
            ejemplo="Si algo de aquí ya lo tenías claro, colápsalo — vuelve mañana solo."
          >
            Lo que vale la pena saber antes de empezar el día, calculado de lo que ya está registrado: con qué bloque
            arrancas, qué rompió el plan en el último cierre, qué viene arrastrado, con quién se está enfriando la
            relación y qué Win se quedó sin tiempo reservado. Solo aparece lo que aplica — si un renglón no está, es que
            no hay nada que decir de eso.
          </AyudaContextual>
        </h2>
        <button
          type="button"
          onClick={alternar}
          aria-expanded={abierto}
          aria-controls="briefing-lineas"
          className="ml-auto text-xs font-semibold text-faint hover:text-brand-deep"
        >
          {abierto ? '▾ ocultar' : '▸ ver'}
        </button>
      </div>

      {abierto && (
        <ul id="briefing-lineas" className="mt-2 space-y-1.5 text-[13px]">
          {b.primerBloque && (
            <Linea icono="→">
              Primer bloque {b.primerBloque.hora === 'flex' ? 'sin hora fija' : b.primerBloque.hora} —{' '}
              <strong className="font-semibold text-brand-deep">{b.primerBloque.titulo}</strong>
            </Linea>
          )}

          {b.seMovioAyer && (
            <Linea icono="↺">
              {b.seMovioAyer.esAyer ? 'Ayer' : `El ${diaSemanaDe(b.seMovioAyer.fecha)}`} dominó{' '}
              <strong className="font-semibold text-brand-deep">{b.seMovioAyer.label}</strong> (
              {duracion(b.seMovioAyer.minutos)})
            </Linea>
          )}

          {b.arrastradas !== null && (
            <Linea icono="↷">
              {b.arrastradas} arrastrada{b.arrastradas > 1 ? 's' : ''} por decidir
            </Linea>
          )}

          {b.stakeholdersFrios?.map((s) => (
            <Linea key={s.id} icono="◇">
              <span title={s.siguienteAccion}>
                <strong className="font-semibold text-brand-deep">{s.nombre}</strong>{' '}
                {s.diasSinContacto === null
                  ? `sin contacto registrado (${s.etiquetaLabel})`
                  : `lleva ${s.diasSinContacto} días ${s.etiquetaLabel}`}{' '}
                — toca contacto de {s.tocaContactoDe}
              </span>
            </Linea>
          ))}

          {b.winEnRiesgo && (
            <Linea icono="◎">
              Win {b.winEnRiesgo.posicion} sin bloques restantes —{' '}
              {b.winEnRiesgo.siEntonces ? (
                <>
                  repasa su si-entonces: <em className="text-faint">{b.winEnRiesgo.siEntonces}</em>
                </>
              ) : (
                <>agéndale un bloque o suéltalo</>
              )}
            </Linea>
          )}

          {b.sobrecarga && (
            <Linea icono="▲" tono={b.sobrecarga.nivel === 'rojo' ? 'rojo' : 'ambar'}>
              {b.sobrecarga.nivel === 'rojo' ? 'Carga en espiral' : 'Carga al límite'}
              <span className="ml-1 text-xs text-faint">{b.sobrecarga.detalle}</span>
            </Linea>
          )}
        </ul>
      )}
      <div className="hair mt-3" />
    </section>
  )
}
