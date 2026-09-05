'use client'

// Puente con el cascarón nativo (Capacitor). La web es la MISMA en Safari y en
// el WKWebView: lo único que cambia es qué canal hay para avisar. Todo lo que
// dependa del cascarón pasa por aquí para que el resto de la app no sepa que
// existe.
import { useSyncExternalStore } from 'react'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { LocalNotifications } from '@capacitor/local-notifications'
import { ID_CIERRE, ID_RITUAL, type AvisoLocal } from './avisos-locales'
import { escribirLocal, useLocalStorage } from './local-store'

export function esNativo(): boolean {
  return Capacitor.isNativePlatform()
}

export function plataforma(): 'ios' | 'android' | 'web' {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web'
}

// Si estamos dentro del cascarón es un hecho del entorno, no estado de React:
// se lee como store externo con snapshot de servidor `false`, así el SSR y la
// hidratación coinciden y el cliente se repinta una sola vez con el valor real.
const sinSuscripcion = () => () => {}
export function useEsNativo(): boolean {
  return useSyncExternalStore(sinSuscripcion, esNativo, () => false)
}

/**
 * Programa una notificación LOCAL de prueba dentro de `enSegundos`. Pide
 * permiso con el gesto que la dispara (nunca al cargar: en iOS un prompt sin
 * contexto se niega y ya no vuelve).
 */
export async function probarNotificacionLocal(enSegundos: number): Promise<'granted' | 'denied' | 'prompt'> {
  const { display } = await LocalNotifications.requestPermissions()
  if (display !== 'granted') return display === 'denied' ? 'denied' : 'prompt'
  await LocalNotifications.schedule({
    notifications: [
      {
        id: 9001,
        title: 'WTW — prueba',
        body: `Notificación local programada hace ${enSegundos} s. Llegó sin servidor.`,
        schedule: { at: new Date(Date.now() + enSegundos * 1000) },
      },
    ],
  })
  return 'granted'
}

// ---- Avisos del ritual y del cierre, programados en el dispositivo ----------
//
// El interruptor vive en localStorage del cascarón: es una decisión POR
// DISPOSITIVO ("en este iPad sí"), igual que la suscripción del push web era
// por dispositivo. Sin el interruptor encendido el puente no toca las
// notificaciones, ni siquiera para leer.

export const AVISOS_CLAVE = 'wtw.avisos-locales'
const IDS_PROPIOS = [ID_RITUAL, ID_CIERRE]

export function useAvisosLocalesActivos(): boolean {
  return useLocalStorage(AVISOS_CLAVE) === '1'
}

function activos(): boolean {
  try {
    return window.localStorage.getItem(AVISOS_CLAVE) === '1'
  } catch {
    return false
  }
}

export type ResultadoSync = { programados: AvisoLocal[]; calculadoEn: string }

let ultimaSync = 0
const MIN_ENTRE_SYNCS_MS = 60_000

/**
 * Pide al servidor qué avisos hacen falta AHORA y deja el dispositivo igual:
 * cancela los nuestros que ya no aplican y programa los que sí. Se llama al
 * volver al frente y al cambiar de pantalla; el freno de 60 s evita pegarle
 * al servidor en cada navegación.
 */
export async function sincronizarAvisosLocales(opciones: { forzar?: boolean } = {}): Promise<ResultadoSync | null> {
  if (!esNativo() || !activos()) return null
  const ahora = Date.now()
  if (!opciones.forzar && ahora - ultimaSync < MIN_ENTRE_SYNCS_MS) return null
  ultimaSync = ahora

  const res = await fetch('/api/nativo/avisos', { cache: 'no-store' })
  if (!res.ok) return null
  const { avisos, calculadoEn } = (await res.json()) as { avisos: AvisoLocal[]; calculadoEn: string }

  const { notifications: pendientes } = await LocalNotifications.getPending()
  const nuestras = pendientes.filter((n) => IDS_PROPIOS.includes(n.id))
  if (nuestras.length > 0) await LocalNotifications.cancel({ notifications: nuestras.map((n) => ({ id: n.id })) })

  if (avisos.length > 0) {
    await LocalNotifications.schedule({
      notifications: avisos.map((a) => ({
        id: a.id,
        title: a.titulo,
        body: a.cuerpo,
        schedule: { at: new Date(a.at) },
        extra: { ruta: a.ruta, tipo: a.tipo },
      })),
    })
  }
  return { programados: avisos, calculadoEn }
}

/** Enciende los avisos en este dispositivo: permiso con el gesto, interruptor y primera sincronización. */
export async function activarAvisosLocales(): Promise<'granted' | 'denied' | 'prompt'> {
  const { display } = await LocalNotifications.requestPermissions()
  if (display !== 'granted') return display === 'denied' ? 'denied' : 'prompt'
  escribirLocal(AVISOS_CLAVE, '1')
  await sincronizarAvisosLocales({ forzar: true })
  return 'granted'
}

export async function desactivarAvisosLocales(): Promise<void> {
  escribirLocal(AVISOS_CLAVE, null)
  const { notifications } = await LocalNotifications.getPending()
  const nuestras = notifications.filter((n) => IDS_PROPIOS.includes(n.id))
  if (nuestras.length > 0) await LocalNotifications.cancel({ notifications: nuestras.map((n) => ({ id: n.id })) })
}

export type Pendiente = { id: number; titulo: string; at: Date | null }

export async function avisosPendientes(): Promise<Pendiente[]> {
  if (!esNativo()) return []
  const { notifications } = await LocalNotifications.getPending()
  return notifications
    .filter((n) => IDS_PROPIOS.includes(n.id))
    .map((n) => ({ id: n.id, titulo: n.title, at: n.schedule?.at ? new Date(n.schedule.at) : null }))
}

/** Tap en un aviso: navegar a su ruta. Devuelve la función para dejar de escuchar. */
export function escucharTapDeAviso(navegar: (ruta: string) => void): () => void {
  const handle = LocalNotifications.addListener('localNotificationActionPerformed', (accion) => {
    const ruta = (accion.notification.extra as { ruta?: string } | undefined)?.ruta
    if (ruta) navegar(ruta)
  })
  return () => {
    handle.then((h) => h.remove())
  }
}

/** La app volvió al frente. Devuelve la función para dejar de escuchar. */
export function escucharVueltaAlFrente(fn: () => void): () => void {
  const handle = App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) fn()
  })
  return () => {
    handle.then((h) => h.remove())
  }
}
