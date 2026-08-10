# Planeador Semanal en la app — diseño

**Fecha:** 2026-08-05
**Problema:** el ritual de "Winning the Week" (recap, definir Wins, vaciar, bloquear, pre-emptar)
solo existe en la skill `/wtw-semana`, es decir fuera de la app. Cada lunes obliga a Mau a
abrir Claude Code y teclear la planeación completa en el chat. Impráctico.

## Decisiones (confirmadas por Mau, 2026-08-05)

| Decisión | Elegido | Descartado |
|---|---|---|
| Interacción | Wizard de 5 pasos con IA puntual | Chat libre con IA; wizard sin IA |
| Recap | Automático de los datos, IA lo redacta | Solo números; escrito a mano |
| Alcance | Reemplaza `/semana/nueva`; la skill `/wtw-semana` sobrevive | Convivir con el form viejo; retirar la skill |

**Por qué wizard y no chat:** el ritual es un procedimiento fijo de 5 pasos con dos cálculos
duros (capacidad real y factor de realismo). Un chat libre volvería a pedirle a Mau que teclee
cada lunes lo que la app ya sabe, y haría no determinista el único número que importa: si la
carga cabe en la semana. La IA entra donde sí aporta —redactar, sugerir, estimar, proponer
triage— y nunca donde hay que calcular.

## Los 5 pasos

| # | Paso (libro) | Qué hace la app | IA |
|---|---|---|---|
| 1 | Reflejar | Calcula plan vs. real de la semana anterior, factor de realismo logrado, estatus de cada Win | Redacta 3-4 frases de recap → editable → `Week.reflexion` |
| 2 | Definir Wins | Máx. 3, con DoD cada uno | Sugiere candidatos desde backlog, Wins fallidos de la semana pasada y entregables con deadline cerca |
| 3 | Vaciar y dimensionar | Lista el backlog (`Task.estatus = backlog`) + captura nueva; aplica el factor → `ajustadoMin` | Estima `estimadoMin` de las tareas que no lo traen, usando `herramienta` y títulos parecidos ya medidos |
| 4 | Bloquear | Compara carga ajustada vs. `capacityForWeek()`; asigna tareas a días | Si la carga excede la capacidad, propone qué sacar y por qué |
| 5 | Pre-emptar | Pre-mortem: qué puede descarrilar la semana; define el desbloqueador | Propone riesgos a partir de los Wins y de lo que se atoró la semana pasada |

## Arquitectura

Piezas que ya existen y NO se reescriben:

- `createWeekPayload(userId, payload)` — crea Week + Wins + Tasks + Blocks en una transacción
- `capacityForWeek(userId, isoWeek)` — capacidad real, ya descuenta comida, juntas bloqueantes y `bufferPct`
- `callModel()` en `src/lib/ai/client.ts` — único punto que toca el SDK, con telemetría en `AiCall`
- `GENERATE = 'claude-sonnet-5'` en `src/lib/ai/models.ts`

Archivos nuevos en `src/app/(app)/semana/nueva/`:

```
service.ts             contextoPlaneacion() — recap de la semana anterior, backlog, capacidad, proyectos
prompts.ts             los 4 system prompts, aislados para poder iterarlos sin tocar lógica
ai-actions.ts          4 server actions: recap, sugerirWins, estimar, triage+premortem
PlaneadorSemanal.tsx   el wizard (client)
page.tsx               carga el contexto y monta el wizard  (reemplaza el form viejo)
actions.ts             crearSemanaAction extendida con reflexion + desbloqueador
```

Cambio menor aguas arriba: `CreateWeekPayload` gana `desbloqueador?: string` — el campo ya
existe en `Week` pero `createWeekPayload` no lo escribía.

## Reglas de diseño

1. **La IA propone, Mau confirma.** Ninguna acción de IA escribe a la DB. Todo cae en el estado
   del wizard, editable, y se persiste hasta el paso final con `createWeekPayload` (una sola
   transacción). Un error de la IA nunca deja datos a medias.
2. **Sin IA la app sigue sirviendo.** Si `ANTHROPIC_API_KEY` falta o el modelo falla, cada paso
   se puede llenar a mano. El botón de IA muestra el error y no bloquea.
3. **Draft en localStorage.** El ritual son ~10 minutos; si se cae la conexión no se pierde.
   Se limpia al crear la semana.
4. **Cero diálogos nativos.** `window.confirm/prompt/alert` están prohibidos en este repo
   (ver `bd42560` y `de0122a`): el navegador puede silenciarlos y el control queda muerto.
5. **Los números los calcula el servidor, no el modelo.** Capacidad, carga, colchón y factor
   salen de TypeScript. Al prompt se le pasan ya calculados como contexto.

## Verificación

- Unit: `contextoPlaneacion()` con semana anterior cerrada, sin semana anterior, y con Wins fallidos
- Unit: cálculo de carga vs. capacidad (sobrecarga, cabe justo, holgura)
- Unit: los parsers de las respuestas de IA toleran JSON malformado sin tirar el paso
- Integración: crear semana completa desde el wizard → Week + Wins + Tasks + Blocks correctos
- Manual: el ritual completo de punta a punta con datos reales, en móvil
