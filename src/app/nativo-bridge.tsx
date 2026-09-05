'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { escucharTapDeAviso, escucharVueltaAlFrente, esNativo, sincronizarAvisosLocales } from '@/lib/nativo'

// Vive en el layout raíz, junto al service worker. En Safari no hace nada. En
// el cascarón: al montar, al volver al frente y al cambiar de pantalla vuelve
// a pedir qué avisos hacen falta y deja el dispositivo igual — así, planear la
// semana o cerrar el día desde el iPad cancela el aviso correspondiente sin
// que ninguna pantalla tenga que saber de notificaciones.
export function NativoBridge() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!esNativo()) return
    const quitarTap = escucharTapDeAviso((ruta) => router.push(ruta))
    const quitarFrente = escucharVueltaAlFrente(() => {
      sincronizarAvisosLocales({ forzar: true }).catch(() => {})
    })
    return () => {
      quitarTap()
      quitarFrente()
    }
  }, [router])

  useEffect(() => {
    if (!esNativo()) return
    sincronizarAvisosLocales().catch(() => {})
  }, [pathname])

  return null
}
