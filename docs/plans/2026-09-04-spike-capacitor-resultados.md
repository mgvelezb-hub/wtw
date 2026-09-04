# Spike Capacitor — resultados (2026-09-04, rama `spike/capacitor-ios`)

**Pregunta:** ¿la app web de WTW, tal cual está en Vercel, corre como app de iPad sin
duplicar código, con el mismo look & feel y recibiendo los upgrades del `git push`?
**Respuesta corta: sí.** Cascarón WKWebView (Capacitor 8) que carga la URL de prod.
Compiló, arrancó, se ve igual, y la notificación local llegó sin servidor.

Decisión de alcance de Mau que este spike ejecuta: **wrapper, no SwiftUI**. La razón
es el requisito de un solo código para web y nativo; SwiftUI significaba dos UIs y
dos releases. El repo tiene 25 archivos con Server Actions, así que no existe static
export: el wrapper carga `https://wtw-app-henna.vercel.app`, no un bundle local.

## Lo que se midió

| Qué | Resultado | Cómo |
|---|---|---|
| Compila | Sí, Xcode 26.5, simulador iPad Pro 11" | `xcodebuild -workspace App.xcworkspace -scheme App -sdk iphonesimulator` |
| Look & feel | Idéntico a Safari: `paper`, Plex, login, todo | Screenshot del simulador |
| Arranque en frío #1 (instalación nueva, Neon frío) | **8.8 s** proceso→primer paint | `log stream` del simulador: proceso 17:21:46.9 → DidFirstMeaningfulPaint 17:21:55.7 |
| Arranque en frío #2 (app terminada y relanzada) | **3.3 s** proceso→primer paint; 4.7 s desde el comando de launch | proceso 17:22:50.3 → provisional 17:22:52.7 → commit 17:22:53.2 → FMP 17:22:53.5 |
| Puente nativo desde la página remota | Funciona: `Capacitor.isNativePlatform()` da `ios` en la página servida por el dev server | Panel `/nativo` pintó "Estás en el cascarón de ios" |
| Notificación local sin servidor | **Llegó** a los 10 s con la app en el fondo, permiso pedido con el gesto | `@capacitor/local-notifications`, visto en el Centro de Notificaciones |
| Página sin red (`server.errorPath`) | **Funciona**: `native/www/error.html` con los tokens de la app; "Reintentar" vuelve a la URL del servidor vía `window.WEBVIEW_SERVER_URL` | Build apuntando a `127.0.0.1:59999` (puerto cerrado real) |

Lectura de los tiempos: son de un build Debug en simulador sobre Intel; de los 3.3 s,
**2.4 s son de que el WKWebView arranque a pedir** (proceso→provisional) y solo 0.8 s
son de red+render. En Release y en el iPad físico lo primero baja; lo segundo depende
de Neon. No se comparó contra Safari en el mismo dispositivo: eso solo tiene sentido
en el iPad real, con cronómetro.

## Lo que se aprendió (y no hay que volver a pagar)

1. **SPM con Capacitor 8 se cuelga en esta Mac.** `cap add ios` por default usa Swift
   Package Manager, y `xcodebuild` se queda 12+ minutos en 0 B bajando los
   `Capacitor.xcframework.zip` de GitHub Releases (la descarga directa con `curl` tarda
   1.7 s, así que no es la red: es el descargador de SPM dentro de xcodebuild). Solución:
   `npx cap add ios --packagemanager Cocoapods` — compila Capacitor desde
   `node_modules`, sin bajar binarios. CocoaPods 1.17 necesita `LC_ALL=en_US.UTF-8`.
2. **`server.url` admite ruta.** Para probar una página concreta sin barra de
   direcciones: `CAP_SERVER_URL=http://localhost:3010/nativo npx cap sync ios`. El
   simulador ve el `localhost` de la Mac directo; `cleartext` se enciende solo si la URL
   es `http://`.
3. **El puerto 9 no sirve para simular "sin red".** WebKit lo tiene en su lista de puertos
   bloqueados y devuelve un documento vacío como carga EXITOSA — nunca dispara
   `didFailProvisionalNavigation`, que es lo que carga `errorPath`. Usar un puerto alto
   cerrado (59999) o un host `.invalid`.
4. **El service worker se apaga dentro del cascarón** (`register-sw.tsx` revisa
   `esNativo()`): su caché por commit existía para arrancar sin red en la PWA; en el
   WebView solo es un segundo lugar donde una versión vieja se queda pegada.
5. **Los logs de Capacitor (`⚡️ …`) van a stdout, no a `os_log`**: `log stream` no los ve.
   Los hitos de WebKit (`didStartProvisionalLoadForMainFrame`, `didCommitLoadForFrame`,
   `DidFirstMeaningfulPaint`) sí salen con `--predicate 'process == "App"'` y bastan
   para medir arranque.

## Lo que sigue sin medir (necesita el iPad físico y a Mau)

- **Sesión**: que la cookie httpOnly sobreviva a cerrar la app y a reiniciar el iPad.
  Requiere iniciar sesión en el cascarón — yo no tecleo contraseñas; lo hace Mau.
- **Arranque en frío real** vs Safari en el mismo iPad, y batería.
- **Gesto táctil del DnD** (@dnd-kit) dentro del WKWebView.
- **Instalación en el iPad**: bloqueada por dos cosas que solo Mau puede hacer —
  activar Modo Desarrollador en el iPad (`developerModeStatus: disabled`) y volver a
  iniciar sesión en Xcode › Settings › Accounts (Xcode rechazó la sesión guardada de
  `mau_gf22@hotmail.com`). El proyecto ya trae `DEVELOPMENT_TEAM = Y2AN8V2K8H`
  (equipo personal "Mau Gonzalez") y firma automática: con la sesión viva, el botón Run
  de Xcode o el `xcodebuild` de abajo deberían bastar.

```bash
cd ~/projects/wtw-app/ios/App && xcodebuild -workspace App.xcworkspace -scheme App -sdk iphoneos -destination 'id=4D492B51-31C6-5D34-98F3-3EF5C91C813E' -derivedDataPath build -allowProvisioningUpdates build
```

## Límites de la cuenta gratuita (sin Apple Developer Program)

- La app instalada por cable **expira a los 7 días**; hay que reinstalar desde Xcode.
- Sin TestFlight: nadie más la instala.
- Sin App Groups: el widget de "bloque de ahora" no puede compartir datos con la app.
  Queda para después de pagar los 99 USD/año.

## Qué hay en la rama

- `capacitor.config.ts` — cascarón remoto; `CAP_SERVER_URL` para dev.
- `native/www/error.html` — página sin red, con los tokens de DESIGN.md.
- `ios/` — proyecto Xcode con CocoaPods (`Pods/`, `build/` y los generados van en
  `ios/.gitignore`; tras clonar: `npx cap sync ios`).
- `src/lib/nativo.ts` — único punto de contacto con el cascarón (`esNativo`,
  `probarNotificacionLocal`).
- `src/app/nativo/page.tsx` — diagnóstico público del cascarón (en Safari no pinta nada).
- `src/app/(app)/settings/Nativo.tsx` — el mismo panel dentro de Ajustes.
- `src/app/register-sw.tsx` — no registra el SW dentro del cascarón.
- `src/proxy.ts` — `/nativo` en `PUBLIC_ROUTES`.
