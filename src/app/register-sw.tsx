'use client'

import { useEffect } from 'react'
import { esNativo } from '@/lib/nativo'

// Dentro del cascarón nativo el service worker no aporta: la caché por commit
// existe para que la PWA arranque sin red, y el WKWebView ya tiene su propia
// página de error (`native/www/error.html`). Registrarlo ahí solo suma un
// segundo lugar donde una versión vieja puede quedarse pegada.
export function RegisterSW() {
  useEffect(() => {
    if (esNativo()) return
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  return null
}
