import type { CapacitorConfig } from '@capacitor/cli'

// Spike (2026-09-04): la app nativa es un cascarón WKWebView que carga la MISMA
// web desplegada en Vercel. No hay bundle local de la UI —el repo usa Server
// Actions, así que no existe static export— y por eso un `git push` a main
// actualiza también el iPad. `native/www` solo trae la página de error sin red.
//
// Dev: CAP_SERVER_URL=http://localhost:3010 npx cap sync ios  (el simulador ve
// el localhost de la Mac; `cleartext` permite http).
const serverUrl = process.env.CAP_SERVER_URL ?? 'https://wtw-app-henna.vercel.app'

const config: CapacitorConfig = {
  appId: 'mx.vpconsulting.wtw',
  appName: 'WTW',
  webDir: 'native/www',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
    errorPath: 'error.html',
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
