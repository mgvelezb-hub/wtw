'use client'

import { useState, useTransition } from 'react'
import type { Recordatorios } from '@/lib/push'
import { guardarRecordatoriosAction } from './actions'

// El permiso de notificaciones se pide con un gesto explícito y NUNCA al cargar
// la pantalla: en iOS un prompt de permiso sin contexto se niega, y una vez
// negado solo se recupera desde los ajustes del sistema. De ahí que el botón
// diga qué va a llegar antes de pedir nada.

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// La clave VAPID viaja en base64url y `subscribe` la quiere como bytes. Se
// construye sobre un ArrayBuffer explícito: el tipo de `applicationServerKey`
// no acepta un Uint8Array respaldado por SharedArrayBuffer.
function base64UrlABytes(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4)
  const normal = (base64 + relleno).replace(/-/g, '+').replace(/_/g, '/')
  const crudo = window.atob(normal)
  const bytes = new Uint8Array(new ArrayBuffer(crudo.length))
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i)
  return bytes
}

export function RecordatoriosPanel({
  inicial,
  configurado,
  clavePublica,
  dispositivos,
}: {
  inicial: Recordatorios
  configurado: boolean
  clavePublica: string | null
  dispositivos: number
}) {
  const [r, setR] = useState(inicial)
  const [estado, setEstado] = useState<string | null>(null)
  const [suscritos, setSuscritos] = useState(dispositivos)
  const [pending, startTransition] = useTransition()

  function guardar(next: Recordatorios) {
    setR(next)
    startTransition(async () => {
      await guardarRecordatoriosAction(next)
    })
  }

  async function activarEnEsteDispositivo() {
    setEstado(null)
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setEstado('Este navegador no soporta notificaciones push. En iPhone y iPad hay que agregar la app a la pantalla de inicio primero.')
      return
    }
    if (!clavePublica) {
      setEstado('Faltan las claves VAPID en el servidor.')
      return
    }
    const permiso = await Notification.requestPermission()
    if (permiso !== 'granted') {
      setEstado('Permiso negado. Se cambia en los ajustes del navegador.')
      return
    }
    try {
      // `/sw.js` lo sirve `src/app/sw.js/route.ts` (versionado por commit para
      // que su caché se invalide en cada deploy). Registrarlo aquí es idempotente:
      // si `register-sw.tsx` ya lo registró, devuelve el mismo registro.
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlABytes(clavePublica),
      })
      const res = await fetch('/api/v1/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...sub.toJSON(), etiqueta: navigator.userAgent.slice(0, 80) }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setSuscritos((n) => n + 1)
      setEstado('Listo: este dispositivo ya recibe los recordatorios.')
    } catch {
      setEstado('No se pudo suscribir este dispositivo. Vuelve a intentar.')
    }
  }

  async function apagarTodos() {
    await fetch('/api/v1/push', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{}' })
    setSuscritos(0)
    setEstado('Recordatorios apagados en todos los dispositivos.')
  }

  return (
    <section className="space-y-4 rounded-lg border border-edge bg-surface p-6">
      <div>
        <h2 className="text-sm font-semibold text-ink">Recordatorios</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Dos avisos, y ninguno llega si la cosa ya está hecha: el del ritual solo si la semana que entra sigue sin plan,
          el del cierre solo si quedan minutos del día sin explicar.
        </p>
      </div>

      {!configurado && (
        <p className="rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
          Push sin configurar en este despliegue: faltan <span className="num">VAPID_PUBLIC_KEY</span> y{' '}
          <span className="num">VAPID_PRIVATE_KEY</span>. Los horarios se pueden guardar, pero no llegará nada.
        </p>
      )}

      <label className="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={r.ritual !== null}
          onChange={(e) => guardar({ ...r, ritual: e.target.checked ? { dia: 0, hora: '18:00' } : null })}
        />
        <span className="text-muted">Ritual semanal</span>
        {r.ritual && (
          <>
            <select
              value={r.ritual.dia}
              aria-label="Día del recordatorio del ritual"
              onChange={(e) => guardar({ ...r, ritual: { ...r.ritual!, dia: Number(e.target.value) } })}
              className="rounded border border-hair bg-surface px-1.5 py-1 text-xs text-ink"
            >
              {DIAS.map((d, i) => (
                <option key={i} value={i}>
                  {d}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={r.ritual.hora}
              aria-label="Hora del recordatorio del ritual"
              onChange={(e) => guardar({ ...r, ritual: { ...r.ritual!, hora: e.target.value } })}
              className="num rounded border border-hair px-1.5 py-1 text-xs text-ink"
            />
          </>
        )}
      </label>

      <label className="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={r.cierre !== null}
          onChange={(e) => guardar({ ...r, cierre: e.target.checked ? { hora: '17:30' } : null })}
        />
        <span className="text-muted">Cierre del día (lunes a viernes)</span>
        {r.cierre && (
          <input
            type="time"
            value={r.cierre.hora}
            aria-label="Hora del recordatorio de cierre"
            onChange={(e) => guardar({ ...r, cierre: { hora: e.target.value } })}
            className="num rounded border border-hair px-1.5 py-1 text-xs text-ink"
          />
        )}
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={activarEnEsteDispositivo}
          disabled={pending}
          className="rounded-md bg-brand-deep px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
        >
          Activar en este dispositivo
        </button>
        {suscritos > 0 && (
          <>
            <span className="num text-xs text-muted">
              {suscritos} {suscritos === 1 ? 'dispositivo activo' : 'dispositivos activos'}
            </span>
            <button type="button" onClick={apagarTodos} className="text-xs font-medium text-faint hover:text-danger">
              Apagar en todos
            </button>
          </>
        )}
      </div>

      {estado && <p className="text-xs text-muted">{estado}</p>}
    </section>
  )
}
