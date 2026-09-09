import { describe, it, expect, afterEach } from 'vitest'
import { GET } from '@/app/sw.js/route'

const ORIGINAL_SHA = process.env.VERCEL_GIT_COMMIT_SHA

afterEach(() => {
  process.env.VERCEL_GIT_COMMIT_SHA = ORIGINAL_SHA
})

describe('GET /sw.js', () => {
  it('el nombre del cache cambia entre deploys distintos', async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = 'abc123'
    const bodyA = await (await GET()).text()

    process.env.VERCEL_GIT_COMMIT_SHA = 'def456'
    const bodyB = await (await GET()).text()

    expect(bodyA).toContain("const CACHE = 'wtw-shell-abc123'")
    expect(bodyB).toContain("const CACHE = 'wtw-shell-def456'")
    expect(bodyA).not.toBe(bodyB)
  })

  it('responde con Content-Type de JavaScript', async () => {
    const res = await GET()
    expect(res.headers.get('Content-Type')).toBe('application/javascript')
  })
})

describe('caché del service worker', () => {
  async function sw(): Promise<string> {
    return (await GET()).text()
  }

  it('no precachea /dia', async () => {
    // RegisterSW vive en el layout raíz, así que el SW también se registra desde
    // /login: el addAll pedía /dia sin sesión, recibía el 307 y guardaba el HTML
    // de LOGIN bajo la clave /dia. Ese objeto era además el fallback offline.
    const body = await sw()
    expect(body).toContain("const SHELL = ['/manifest.webmanifest']")
    expect(body).not.toContain("SHELL = ['/dia'")
  })

  it('no guarda respuestas redirigidas ni fallidas', async () => {
    // El navegador rechaza servir con respondWith una respuesta `redirected`
    // para una petición `navigate`: la navegación offline fallaba en duro.
    const body = await sw()
    expect(body).toContain('res.ok && res.type === \'basic\' && !res.redirected')
  })

  it('escribe en la caché dentro de waitUntil', async () => {
    // Un `put` suelto puede morir con el evento.
    expect(await sw()).toContain('event.waitUntil(caches.open(CACHE)')
  })

  it('borra toda la caché cuando el logout se lo pide', async () => {
    const body = await sw()
    expect(body).toContain("'wtw:limpiar-cache'")
    expect(body).toContain('keys.map((k) => caches.delete(k))')
  })

  it('sigue siendo JavaScript válido', async () => {
    const body = await sw()
    expect(() => new Function(body)).not.toThrow()
  })
})
