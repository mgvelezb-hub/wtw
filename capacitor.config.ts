import type { CapacitorConfig } from '@capacitor/cli'

// Spike (2026-09-04): la app nativa es un cascarón WKWebView que carga la MISMA
// web desplegada en Vercel. No hay bundle local de la UI —el repo usa Server
// Actions, así que no existe static export— y por eso un `git push` a main
// actualiza también el iPad. `native/www` solo trae la página de error sin red.
//
// Dev: CAP_SERVER_URL=http://localhost:3010 npx cap sync ios  (el simulador ve
// el localhost de la Mac; `cleartext` permite http).
//
// SOLO EL ORIGEN, nunca una ruta. Capacitor decide "esto es la app" con
// `absoluteString.starts(with: serverURL)`: con `…:3010/dia` el redirect a
// `/login` no empieza con `/dia`, cuenta como sitio externo y se abre en
// Safari (8-sep-2026: el simulador "perdía" la app al arrancar sin sesión).
// `allowNavigation` con el host cierra ese hueco por si algún día la URL
// vuelve a traer ruta.
const serverUrl = process.env.CAP_SERVER_URL ?? 'https://wtw-app-henna.vercel.app'
const serverHost = new URL(serverUrl).hostname

const config: CapacitorConfig = {
  appId: 'mx.vpconsulting.wtw',
  appName: 'Reckon',
  webDir: 'native/www',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
    errorPath: 'error.html',
    allowNavigation: [serverHost],
  },
  ios: {
    contentInset: 'automatic',
    // Sin esto, el WebView arranca con fondo blanco antes del primer paint y
    // desentona con `paper`.
    backgroundColor: '#eef2f2',
    scrollEnabled: true,
  },
}

export default config
