# Alineación del roadmap con el veredicto del council

**Fecha:** 2026-08-10
**Origen:** council de 5 asesores (Contrarian, Primeros Principios, Expansionista, Outsider,
Ejecutor) + ronda de revisión cruzada, sobre la pregunta "¿qué construir, cambiar o matar para
que WTW App sea una herramienta de vanguardia de planeación y tracking de proyectos de
consultoría?". Veredicto completo en la conversación del 2026-08-10.

Este documento **reemplaza como prioridad** a las fases B–D del PMO IA
(`2026-07-16-fase7-pmo-ia-design.md` §8) y a lo que quedaba diferido del diseño original.

## El diagnóstico que hay que aceptar antes de escribir código

El factor de realismo (1.4) es el número que sostiene el ritual semanal completo: capacidad,
carga, triage, colchón. **No se puede calibrar porque el dato no existe.** La semana W32
registró 826 min planeados contra 32 medidos, y de 4 tareas terminadas solo 1 traía cronómetro.

Los cinco asesores llegaron a eso por caminos distintos. Dos consecuencias que sí cambian el
plan:

1. **Agregar IA encima de ese hueco compone el error.** El planeador semanal recién construido
   estima duraciones a partir de tareas ya cronometradas — hay una. La función es correcta y la
   guarda de `medicionIncompleta` evita que mienta, pero su valor real está limitado por el dato.
2. **Bajar la fricción del cronómetro no basta.** El comportamiento observado (marcar "hecho"
   sin tocar la tarea, no cronometrar) no es indisciplina que se corrija con un tap menos: es
   señal de que el instrumento pide algo que no embona con el día real. Prescribir más de la
   misma disciplina mide obediencia a la herramienta, no la semana.

## Pregunta abierta que ningún asesor pudo contestar

**¿La carga de Liverpool excede la capacidad real de Mau?** Si la respuesta es sí, marcar
"hecho" es un mecanismo de supervivencia ante sobrecarga, y entonces **ninguna función arregla
el problema** — lo arregla renegociar alcance u horas con el cliente. Esto se resuelve antes de
la Fase 1, y no es trabajo de software.

## Fase 0 — Auditoría del lado del resultado (sin código)

El council auditó el lado del insumo ("¿el dato es real?") y nadie auditó el del resultado.

Por cada una de las 13 rutas, escribir **la última decisión real que cambió**: un precio, un
entregable, un compromiso con el cliente, un cambio de plan. No "la abrí" — una decisión.

| Ruta | Última decisión que cambió | Veredicto |
|---|---|---|
| /dia | | |
| /semana | | |
| /semana/nueva | | |
| /inbox | | |
| /proyectos | | |
| /proyectos/[id] | | |
| /aliado | | |
| /historico | | |
| /desarrollo | | |
| /equipo | | |
| /equipo/[reportId] | | |
| /roi | | |
| /settings | | |

Regla: **celda vacía = se archiva detrás de un flag, no se itera.** Archivar cuesta solo ego;
el council señaló que todos tratamos "matar" como la opción difícil cuando es la gratis.

Salida esperada: la tabla llena. Nada más. Sin esto, la Fase 1 es adivinanza.

## Fase 1 — Medir sin pedir disciplina

Sustituir la dependencia del cronómetro por-tarea por una **reconciliación de cierre de día de
60 segundos**: una pantalla con los bloques que se planearon y las juntas del calendario ya
precargados, donde solo se ajusta lo que pasó de verdad.

Diferencias que importan respecto al cronómetro:

- Una vez al día, no una vez por tarea.
- Parte de lo que ya se sabe (plan + calendario) en vez de partir de cero.
- No requiere acordarse en el momento — que es exactamente lo que falla.

**Compuerta:** dos semanas de uso. Si la cobertura de días reconciliados no llega a 70%, el
ritual del factor de realismo **se declara muerto**, no diferido: el planeador cambia su
matemática de coeficiente por una entrada directa de "horas que realmente tengo esta semana".
No se intenta una tercera versión del mismo instrumento.

## Fase 2 — Recortar superficie

Con la tabla de la Fase 0 en mano:

- **Matar** las fases B–D del PMO IA. No diferirlas: se podren y siguen apareciendo en cada
  planeación como deuda fantasma.
- **Archivar `/desarrollo`** (competencias, niveles, evidencia) detrás de un flag. Tres asesores
  lo llamaron disfraz por separado: no hay comité de promoción, nadie evalúa esos niveles.
  Prueba aplicada: si desapareciera mañana, ninguna decisión cambia.
- **Archivar `/roi` y `/equipo`** detrás de un flag hasta que exista una segunda persona real.
- **No tocar** la frontera de las dos capas de auth sobre un mismo service layer. El Ejecutor la
  llamó "el producto real" y es correcto: es lo que permite que Claude maneje la app.

## Fase 3 — Consolidar las dos fuentes de verdad

El PMO de Liverpool vive partido en dos: la app (`Minuta`, `Deliverable`, `Issue`, `Artifact`,
portal cliente en `/portal/[token]`) y skills que hacen lo mismo leyendo Obsidian y Excel
(`avances-cliente`, `carta-entregable`, `status-liverpool-et`, `pendientes-liverpool-et`).

Dos fuentes de verdad para el mismo proyecto es más caro que cualquier función que falte.
Decidir cuál gana por cada flujo y retirar la otra.

## Fase 4 — Integraciones, en este orden

| Integración | Por qué | Costo |
|---|---|---|
| Servidor MCP de la app | La API y los PAT ya existen; un MCP la vuelve manejable desde cualquier superficie de Claude sin escribir una skill por flujo | Bajo |
| `carta-entregable` dentro de la app | Cerrar un `Deliverable` debería generar la carta de aceptación con un clic | Bajo |
| Outlook bidireccional + RRULE | Las juntas recurrentes son el mayor consumidor de capacidad y el menos visible | Medio |
| Captura por WhatsApp | Los clientes escriben por ahí; un compromiso que no llega al `/inbox` no existe | Medio |

## Lo que NO se construye

- **PPTX automático, notificaciones push, digest automático.** Se llevan difiriendo desde el
  diseño original, y eso es la respuesta: ninguna cierra un ciclo hoy abierto.
- **Nada de monetización ni de "PMO-as-a-service".** El Expansionista tiene razón en que la
  cadencia de firma grande producida por un consultor solo es un diferenciador real; 4 de 5
  revisores señalaron por qué no todavía: no se vende una cadencia sostenida por datos que no
  se midieron. El orden importa, no la idea.
- **Multi-cliente.** Los modelos hoy son de facto de un cliente. Se resuelve cuando exista el
  segundo cliente, no antes — pero se decide de manera consciente: cabina privada o producto,
  porque son builds distintos.

## Riesgo que este plan no cubre

El council planteó, y nadie pudo descartar, que construir la app funcione como estructura de
procrastinación: construir trackers es concreto y gratificante, facturar y vender es ambiguo e
incómodo. La Fase 0 es la prueba más barata contra eso: si las 13 rutas no cambiaron
decisiones, el tiempo de construcción no está comprando lo que parece.
