'use client'

// Puente con el cascarón nativo (Capacitor). La web es la MISMA en Safari y en
// el WKWebView: lo único que cambia es qué canal hay para avisar. Todo lo que
// dependa del cascarón pasa por aquí para que el resto de la app no sepa que
// existe.
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

export function esNativo(): boolean {
  return Capacitor.isNativePlatform()
}

export function plataforma(): 'ios' | 'android' | 'web' {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web'
}

/**
 * Programa una notificación LOCAL —vive en el dispositivo, no depende del
 * servidor ni del cron— dentro de `enSegundos`. Pide permiso con el gesto que
 * la dispara (nunca al cargar: en iOS un prompt sin contexto se niega y ya no
 * vuelve). Devuelve el estado del permiso para que la UI lo diga.
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
