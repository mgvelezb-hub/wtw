import 'server-only'
import webpush from 'web-push'
import { prisma } from './prisma'

// Web Push del ritual. El problema que resuelve no es técnico: el ritual
// semanal y el cierre del día son los dos momentos que sostienen todo lo demás,
// y los dos dependen de que Mau se acuerde. Un recordatorio que llega al iPad
// cuesta menos que la disciplina de acordarse.
//
// Se manda en formato DECLARATIVO (Declarative Web Push, iOS 18.4+ y Safari
// 18.4+): el payload trae `web_push: 8030` y el navegador pinta la notificación
// SIN ejecutar JavaScript. Eso importa aquí porque el destino principal es el
// iPad, donde un service worker dormido es la razón habitual de que las
// notificaciones lleguen tarde o en montón. Los navegadores que no lo entienden
// caen al `push` de `sw.js`, que lee el mismo JSON — un solo payload para los
// dos caminos.

export type Recordatorios = {
  /** Día de la semana (0=domingo) y hora local del recordatorio del ritual. null = apagado. */
  ritual: { dia: number; hora: string } | null
  /** Hora local del recordatorio de cierre, de lunes a viernes. null = apagado. */
  cierre: { hora: string } | null
}

export const RECORDATORIOS_DEFAULT: Recordatorios = {
  ritual: { dia: 0, hora: '18:00' },
  cierre: { hora: '17:30' },
}

// Las claves VAPID identifican al servidor ante el servicio de push. Sin ellas
// no se puede ni suscribir: la UI lo dice y no se rompe (mismo trato que
// ANTHROPIC_API_KEY en la capa de IA).
export function pushConfigurado(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

export function clavePublica(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null
}

function configurar(): void {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:mgonzalez@vpconsulting.mx',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
}

export type Aviso = {
  titulo: string
  cuerpo: string
  /** Ruta a la que lleva el tap. Relativa: el service worker la resuelve contra el origen. */
  ruta: string
  /** Agrupa/reemplaza: dos avisos del mismo tipo no se apilan, el nuevo sustituye al viejo. */
  tag: string
}

// El sobre declarativo. `notification.navigate` es lo que hace que el tap abra
// la app en la ruta correcta sin JavaScript de por medio.
function payload(aviso: Aviso, origen: string): string {
  return JSON.stringify({
    web_push: 8030,
    notification: {
      title: aviso.titulo,
      body: aviso.cuerpo,
      navigate: `${origen}${aviso.ruta}`,
      lang: 'es-MX',
      tag: aviso.tag,
      // El icono lo resuelve el manifest en iOS; en escritorio ayuda tenerlo.
      icon: `${origen}/pwa/icon-192`,
    },
  })
}

export type ResultadoEnvio = { enviados: number; caducados: number }

// Manda un aviso a TODOS los dispositivos de una persona y limpia los que ya no
// existen. 404 y 410 son definitivos: el endpoint murió (app borrada, permiso
// revocado) y hay que borrar la fila. Cualquier otro error se traga — un
// servicio de push caído no debe tirar el cron y dejar sin aviso a los demás.
export async function enviarAviso(userId: string, aviso: Aviso, origen: string): Promise<ResultadoEnvio> {
  if (!pushConfigurado()) return { enviados: 0, caducados: 0 }
  configurar()

  const subs = await prisma.pushSub.findMany({ where: { userId } })
  const cuerpo = payload(aviso, origen)
  let enviados = 0
  const muertos: string[] = []

  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        cuerpo,
        { urgency: 'normal', TTL: 3600 }
      )
      enviados += 1
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) muertos.push(s.id)
    }
  }

  if (muertos.length > 0) await prisma.pushSub.deleteMany({ where: { id: { in: muertos } } })
  if (enviados > 0) {
    await prisma.pushSub.updateMany({
      where: { userId, id: { notIn: muertos } },
      data: { usadoEn: new Date() },
    })
  }

  return { enviados, caducados: muertos.length }
}

export function leerRecordatorios(valor: unknown): Recordatorios {
  if (!valor || typeof valor !== 'object') return RECORDATORIOS_DEFAULT
  const v = valor as Partial<Recordatorios>
  return {
    ritual: v.ritual ?? null,
    cierre: v.cierre ?? null,
  }
}
