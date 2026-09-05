'use client'

import { useEffect, useState } from 'react'
import {
  activarAvisosLocales,
  avisosPendientes,
  desactivarAvisosLocales,
  plataforma,
  probarNotificacionLocal,
  useAvisosLocalesActivos,
  useEsNativo,
  type Pendiente,
} from '@/lib/nativo'
import { ID_RITUAL } from '@/lib/avisos-locales'

function cuando(d: Date | null): string {
  if (!d) return ''
  return new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d)
}

/**
 * Interruptor de los avisos en ESTE dispositivo. Sustituye al bloque de push
 * web dentro del cascarón: el permiso se pide con el gesto, y lo que queda
 * programado se lista tal cual lo tiene iOS, para que "activo" no sea una
 * promesa sino algo verificable.
 */
export function AvisosNativos({ sello }: { sello: number }) {
  const activos = useAvisosLocalesActivos()
  const [estado, setEstado] = useState<string | null>(null)
  const [pendientes, setPendientes] = useState<Pendiente[]>([])

  // `sello` cambia cuando el panel guarda horarios: la lista se relee después
  // de que el puente reprogramó.
  useEffect(() => {
    if (!activos) return
    const t = setTimeout(() => {
      avisosPendientes().then(setPendientes).catch(() => {})
    }, 400)
    return () => clearTimeout(t)
  }, [activos, sello])

  async function activar() {
    setEstado('Pidiendo permiso…')
    try {
      const permiso = await activarAvisosLocales()
      setEstado(
        permiso === 'granted'
          ? null
          : permiso === 'denied'
            ? 'Permiso negado. Se recupera solo desde Ajustes del sistema › Notificaciones › WTW.'
            : 'Sin respuesta al permiso.',
      )
      if (permiso === 'granted') setPendientes(await avisosPendientes())
    } catch (e) {
      setEstado(`Falló: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function desactivar() {
    await desactivarAvisosLocales()
    setPendientes([])
    setEstado(null)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs leading-relaxed text-muted">
        En este {plataforma() === 'ios' ? 'iPad' : 'dispositivo'} los avisos se programan aquí mismo, no pasan por el
        servidor: llegan aunque no haya red. Se recalculan cada vez que abres la app, así que planear la semana o
        cerrar el día desde aquí cancela el aviso. Si lo haces desde otra computadora y no abres la app antes, el
        aviso llega de más.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {activos ? (
          <>
            <span className="text-xs text-muted">Avisos activos en este dispositivo</span>
            <button type="button" onClick={desactivar} className="text-xs font-medium text-faint hover:text-danger">
              Apagar aquí
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={activar}
            className="rounded-md bg-brand-deep px-3 py-1.5 text-xs font-bold text-white"
          >
            Activar en este dispositivo
          </button>
        )}
      </div>
      {activos && (
        <ul className="space-y-0.5 text-xs text-muted">
          {pendientes.length === 0 && <li>Nada programado: la semana ya tiene plan y el día no tiene nada que cerrar.</li>}
          {pendientes.map((p) => (
            <li key={p.id}>
              <span className="num">{cuando(p.at)}</span> · {p.id === ID_RITUAL ? 'ritual' : 'cierre'}
            </li>
          ))}
        </ul>
      )}
      {estado && <p className="text-xs text-muted">{estado}</p>}
    </div>
  )
}

// Diagnóstico del cascarón: plataforma y una notificación de prueba. Solo
// existe dentro del cascarón; en Safari no se pinta nada.
export function NativoPanel() {
  const nativo = useEsNativo()
  const [estado, setEstado] = useState<string | null>(null)

  if (!nativo) return null

  async function probar() {
    setEstado('Programando…')
    try {
      const permiso = await probarNotificacionLocal(10)
      setEstado(
        permiso === 'granted'
          ? 'Programada. Manda la app al fondo: llega en 10 s.'
          : permiso === 'denied'
            ? 'Permiso negado. Se recupera solo desde Ajustes del sistema.'
            : 'Sin respuesta al permiso.',
      )
    } catch (e) {
      setEstado(`Falló: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-edge bg-surface p-6">
      <div>
        <h2 className="text-sm font-semibold text-ink">App nativa</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Estás en el cascarón de <span className="num">{plataforma()}</span>. Los avisos del ritual y del cierre se
          configuran arriba, en Recordatorios.
        </p>
      </div>
      <button
        type="button"
        onClick={probar}
        className="rounded-md border border-hair bg-surface px-3 py-1.5 text-xs text-ink"
      >
        Probar notificación local (10 s)
      </button>
      {estado && <p className="text-xs text-muted">{estado}</p>}
    </section>
  )
}
