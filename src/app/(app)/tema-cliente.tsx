'use client'

import { useEffect } from 'react'
import { useReloj } from '@/lib/reloj'
import { useSistemaOscuro } from '@/lib/media-oscura'
import { useLocalStorage, escribirLocal } from '@/lib/local-store'
import { diaSemanaMx, nowMinutesMx } from '@/lib/dates'
import {
  CLAVE_AVISO_JORNADA,
  CLAVE_PREFERENCIA,
  CLAVE_TEMA_RESUELTO,
  colorScheme,
  esPreferencia,
  resolverTema,
  type Jornada,
} from '@/lib/tema'

// Decide y aplica el tema. La aritmética vive en `lib/tema.ts`, sin DOM y con
// tests; aquí solo se conectan las tres fuentes que cambian solas —el reloj, el
// tema del sistema y las preferencias guardadas— y se escribe el atributo.
//
// Las tres son stores externos (regla 20), y el reloj es el MISMO intervalo de
// toda la app: el cambio al salir de la jornada cae en el mismo frame que el
// resto de la pantalla, no en uno propio desfasado.
export function TemaCliente({ jornada }: { jornada: Jornada }) {
  const ahora = useReloj()
  const sistemaOscuro = useSistemaOscuro()
  const prefCruda = useLocalStorage(CLAVE_PREFERENCIA)
  const avisoCrudo = useLocalStorage(CLAVE_AVISO_JORNADA)

  const preferencia = esPreferencia(prefCruda) ? prefCruda : 'auto'
  // Viene encendida: es la razón por la que existe el tercer tema.
  const avisarFueraDeJornada = avisoCrudo !== '0'

  // `ahora` es null hasta el primer tick. Mientras tanto no se decide nada: el
  // script en línea ya dejó pintado el tema del arranque anterior.
  const tema =
    ahora === null
      ? null
      : resolverTema({
          preferencia,
          sistemaOscuro,
          minutosAhora: nowMinutesMx(new Date(ahora)),
          diaSemana: diaSemanaMx(new Date(ahora)),
          jornada,
          avisarFueraDeJornada,
        })

  useEffect(() => {
    if (tema === null) return
    const raiz = document.documentElement
    if (raiz.getAttribute('data-tema') !== tema) raiz.setAttribute('data-tema', tema)
    raiz.style.colorScheme = colorScheme(tema)
    // Se cachea para que el próximo arranque pinte el tema correcto antes del
    // primer frame — ver `TemaInicial`.
    escribirLocal(CLAVE_TEMA_RESUELTO, tema)
  }, [tema])

  return null
}
