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
2. **El hueco tiene dos causas y hay que separarlas.** Una es disciplina (no cronometrar), y esa
   se construye, no se rodea. La otra es la naturaleza del trabajo: bomberazos y cambios de
   prioridad del cliente que rompen el plan y hoy no se registran en ninguna parte. Tratarlas
   como una sola —que es lo que hizo el council— lleva a la conclusión equivocada de reemplazar
   el instrumento. Ver Fase 1.

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

## Fase 1 — Las dos mecánicas, no una

**Corrección al veredicto del council (Mau, 2026-08-10).** El council concluyó que el
cronómetro pelea contra el comportamiento y hay que reemplazarlo. Mau lo rechaza con un
argumento mejor: *no cronometrar es una disciplina que necesita construir, no una restricción a
la que haya que diseñarle un rodeo.* Diseñar el rodeo le resuelve el día de hoy y le quita el
crecimiento — y la disciplina de cronometrar es ella misma parte de la rúbrica que tiene que
demostrar ("Organiza sus prioridades para lograr el «cómo sí»", "Cumple lo que promete").

Las dos mecánicas se construyen y **conviven**:

**(a) El cronómetro se queda como el instrumento primario.** Es el dato honesto y es la
disciplina a desarrollar. No se le baja el rigor ni se le busca sustituto.

**(b) Reconciliación de cierre de día, 60 segundos.** Una pantalla con los bloques planeados y
las juntas del calendario ya precargados, donde se ajusta lo que pasó de verdad. Su propósito
NO es reemplazar al cronómetro: es capturar **por qué** el plan se rompió, que en este trabajo
es la mitad de la información y hoy se pierde completa.

Lo que la reconciliación tiene que clasificar, no solo registrar:

| Causa | Por qué importa |
|---|---|
| Bomberazo (urgencia no planeada) | Cuántas horas/semana se van a trabajo no comprometido, y de qué stakeholder vienen |
| Cambio de prioridad del cliente | Insumo directo para renegociar alcance — evidencia, no percepción |
| Junta que se alargó o apareció | Corrige la capacidad real, que hoy se calcula del calendario nominal |
| Se trabajó sin cronómetro | Distingue "no lo hice" de "lo hice y no lo medí" — sin esto el factor no se puede corregir |

La última fila es la que hace que las dos mecánicas se refuercen en vez de competir: la
reconciliación no perdona el cronómetro, lo audita. Si la causa dominante durante semanas es
"trabajé sin cronometrar", eso es un dato de disciplina y se ve. Si es "bomberazo", es un dato
de negociación con el cliente y también se ve.

**Compuerta (revisada):** dos semanas. Ya no se evalúa si el factor de realismo sobrevive —
sobrevive, es el objetivo. Se evalúa qué causa domina, porque cada una lleva a un trabajo
distinto: disciplina (Mau), renegociación de alcance (cliente), o corrección del cálculo de
capacidad (código).

## Fase 2 — Recortar superficie

Con la tabla de la Fase 0 en mano:

- **Matar** las fases B–D del PMO IA. No diferirlas: se podren y siguen apareciendo en cada
  planeación como deuda fantasma.
- **`/desarrollo` NO se archiva. Se completa.** Ver Fase 2b. Tres asesores lo llamaron disfraz,
  pero lo hicieron sobre una premisa falsa que yo introduje al enmarcar la pregunta del council
  ("consultor solo, sin comité de promoción"). Falso: Mau es `Consultor Sr` con objetivo
  `Gerente` dentro de VP, y la rúbrica de 48 reactivos en `prisma/seed-data/competencias-vp.ts`
  es un instrumento real de la firma. La conclusión del council sobre esta capa queda anulada.
- **Archivar `/roi`** detrás de un flag hasta que haya una decisión de precio que dependa de él.
- **`/equipo` se conserva sin construirle nada más.** Es la superficie que hará falta cuando Mau
  tenga reportes — y tener reportes es requisito de dos de las tres expectativas de Gerente.

## Fase 2b — Cerrar el ciclo de desarrollo profesional

El diseño de esta capa es correcto y está completo en el schema: `Level` (con expectativas),
`Competency` (individual + 10 roles VP), `Evidence` (liga competencia ↔ Task o Deliverable real),
y `Task.competencias` para etiquetar al planear. **Lo que falta es exactamente lo mismo que
falla en el cronómetro: nada la alimenta.** `Evidence` solo se puede crear vía
`POST /api/v1/evidence`; no hay captura en la UI. `getCoberturaCompetencias` son 15 líneas que
cuentan evidencias sin contrastarlas contra nada.

Cuatro piezas, en orden de valor:

1. **Captura de evidencia en el momento del trabajo, no como ritual aparte.** Al cerrar un
   `Deliverable` o una `Task` etiquetada con competencias, pedir una línea de evidencia. Un
   campo, en el flujo que ya existe. Sin esto, todo lo demás de esta fase es decorado.
2. **Cobertura contra el nivel OBJETIVO, no cobertura absoluta.** Hoy cuenta evidencias planas.
   Lo que sirve es el hueco contra `Gerente`: qué reactivos llevan 0 evidencias y cuánto tiempo,
   priorizados por lo que Gerente exige. Eso convierte un checklist en un plan de desarrollo.
3. **Etiquetado de competencias en el planeador semanal.** El paso 2 (Wins) y el 3 (vaciado) son
   el único momento del ciclo en que Mau ya está decidiendo en qué va a invertir la semana. Es
   ahí donde se elige qué competencia se va a ejercitar — no al final, cuando ya no hay margen.
4. **Mapa de stakeholders con cadencia de contacto.** Dos roles VP completos son sobre poder e
   influencia ("La mano del Rey", "La estrategia que renovará al Estado") y la tercera
   expectativa de Gerente es *proximidad con stakeholders*. Hoy los stakeholders de Liverpool
   viven como texto libre dentro de títulos de tareas. Modelarlos —quién, poder/interés, último
   contacto real, qué necesita— sirve al proyecto Y es la única forma de generar evidencia
   verificable para esos dos roles.

**El límite honesto de esta capa.** De las tres expectativas de Gerente, dos requieren personas
que Mau hoy no tiene: *asignar y dar orientación a equipos*, y buena parte de "Quien cuida al
equipo" y de las conductas sobre dar retroalimentación. Ninguna función genera esa evidencia.
La app puede hacer el hueco explícito y con eso forzar la conversación correcta —¿hay juniors
asignables en el engagement de Liverpool? ¿qué se puede delegar?— pero el trabajo es de Mau con
VP, no de software. Documentarlo aquí evita construir un simulador de liderazgo de equipo.
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
