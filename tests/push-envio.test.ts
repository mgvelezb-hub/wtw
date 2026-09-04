import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'

// `web-push` se mockea porque lo que hay que probar es la política, no la
// criptografía: a quién se le manda, y qué pasa con un endpoint muerto. Probarlo
// contra el servicio real haría que la suite dependiera de la red y de un
// dispositivo suscrito de verdad.
const enviados: string[] = []
const sendNotification = vi.fn()
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: (sub: { endpoint: string }, cuerpo: string) => sendNotification(sub, cuerpo),
  },
}))

const TEST_EMAIL = 'test-push@vp.mx'
const AVISO = { titulo: 'T', cuerpo: 'C', ruta: '/semana/nueva', tag: 'ritual-2026-W37' }

beforeEach(async () => {
  await deleteTestUser(TEST_EMAIL)
  enviados.length = 0
  sendNotification.mockReset()
  process.env.VAPID_PUBLIC_KEY = 'pub'
  process.env.VAPID_PRIVATE_KEY = 'priv'
})

async function conDispositivos(...endpoints: string[]) {
  const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
  for (const endpoint of endpoints) {
    await prisma.pushSub.create({ data: { userId: user.id, endpoint, p256dh: 'p', auth: 'a' } })
  }
  return user
}

describe('enviarAviso', () => {
  it('manda a todos los dispositivos de la persona con el sobre declarativo', async () => {
    const { enviarAviso } = await import('@/lib/push')
    const user = await conDispositivos('https://push.test/uno', 'https://push.test/dos')
    sendNotification.mockImplementation((sub: { endpoint: string }, cuerpo: string) => {
      enviados.push(`${sub.endpoint}|${cuerpo}`)
      return Promise.resolve({ statusCode: 201 })
    })

    const r = await enviarAviso(user.id, AVISO, 'https://wtw.test')

    expect(r).toEqual({ enviados: 2, caducados: 0 })
    // El payload es el formato declarativo: sin `web_push: 8030` iOS no pinta
    // nada sin service worker, que es justo el caso del iPad.
    const payload = JSON.parse(enviados[0].split('|')[1])
    expect(payload.web_push).toBe(8030)
    expect(payload.notification).toMatchObject({
      title: 'T',
      body: 'C',
      navigate: 'https://wtw.test/semana/nueva',
      tag: 'ritual-2026-W37',
    })
  })

  it('un endpoint caducado (410) se borra: reintentar contra un muerto acumula avisos', async () => {
    const { enviarAviso } = await import('@/lib/push')
    const user = await conDispositivos('https://push.test/vivo', 'https://push.test/muerto')
    sendNotification.mockImplementation((sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith('muerto')) return Promise.reject(Object.assign(new Error('gone'), { statusCode: 410 }))
      return Promise.resolve({ statusCode: 201 })
    })

    const r = await enviarAviso(user.id, AVISO, 'https://wtw.test')

    expect(r).toEqual({ enviados: 1, caducados: 1 })
    const quedan = await prisma.pushSub.findMany({ where: { userId: user.id }, select: { endpoint: true } })
    expect(quedan.map((s) => s.endpoint)).toEqual(['https://push.test/vivo'])
  })

  it('un error pasajero NO borra el dispositivo: el servicio de push se cae solo', async () => {
    const { enviarAviso } = await import('@/lib/push')
    const user = await conDispositivos('https://push.test/uno')
    sendNotification.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }))

    const r = await enviarAviso(user.id, AVISO, 'https://wtw.test')

    expect(r).toEqual({ enviados: 0, caducados: 0 })
    expect(await prisma.pushSub.count({ where: { userId: user.id } })).toBe(1)
  })

  it('sin claves VAPID no intenta nada en vez de tronar', async () => {
    delete process.env.VAPID_PUBLIC_KEY
    const { enviarAviso } = await import('@/lib/push')
    const user = await conDispositivos('https://push.test/uno')

    expect(await enviarAviso(user.id, AVISO, 'https://wtw.test')).toEqual({ enviados: 0, caducados: 0 })
    expect(sendNotification).not.toHaveBeenCalled()
  })
})
