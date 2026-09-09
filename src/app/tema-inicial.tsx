import { CLAVE_TEMA_RESUELTO } from '@/lib/tema'

// El tema resuelto se cachea en localStorage y se estampa ANTES del primer
// pintado. Sin esto, la app arranca en claro y salta al tema real cuando React
// hidrata: en el iPad, a las once de la noche, ese destello blanco es lo peor
// que puede hacer una pantalla.
//
// El script solo lee la caché — no calcula nada. La jornada del usuario vive en
// la base y este layout está por encima de la sesión (lo comparte /login), así
// que quien decide es `TemaCliente`, que sí tiene los datos, y deja aquí el
// resultado para el siguiente arranque.
//
// `dangerouslySetInnerHTML` con una constante nuestra: no hay entrada de
// usuario en esta cadena.
export function TemaInicial() {
  const script = `try{var t=localStorage.getItem(${JSON.stringify(CLAVE_TEMA_RESUELTO)});if(t==='oscuro'||t==='fuera'||t==='claro'){document.documentElement.setAttribute('data-tema',t)}}catch(e){}`
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
