'use client'

import dynamic from 'next/dynamic'

// El planeador se monta solo en cliente. Su estado inicial sale del draft en
// localStorage —que el servidor no puede conocer— así que renderizarlo en el
// servidor solo produciría un primer paint con el paso 1 vacío y luego un salto.
// Sin SSR, el inicializador de useState lee el draft directo y no hace falta
// setState dentro de un efecto.
export const PlaneadorSemanal = dynamic(() => import('./PlaneadorSemanal').then((m) => m.PlaneadorSemanal), {
  ssr: false,
  loading: () => <p className="text-sm text-muted">Cargando el planeador…</p>,
})
