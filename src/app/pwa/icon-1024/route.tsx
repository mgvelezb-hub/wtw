import { iconoReckon } from '../icono'

// 1024 es el tamaño que pide el catálogo de assets de iOS (`AppIcon-512@2x.png`)
// y, más adelante, la ficha de la App Store. El icono del dispositivo NO sale de
// `/pwa/icon-192` —eso es la PWA— sino de ese asset compilado dentro del binario,
// que es la razón por la que el iPad siguió mostrando el icono viejo después de
// renombrar la app.
//
// Para regenerarlo: con el dev server arriba,
//   curl -s localhost:3010/pwa/icon-1024 > ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
export function GET() {
  return iconoReckon(1024)
}
