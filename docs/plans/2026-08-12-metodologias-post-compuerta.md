# Metodologías de apoyo — plan condicionado a la compuerta

**Fecha:** 2026-08-12
**Se abre:** 2026-08-26 (14 días de datos en `/cierre`)
**Ventana de ejecución:** 2026-08-26 → 2026-09-09
**Origen:** pregunta de Mau sobre qué metodologías externas (Pomodoro y otras) hacen sinergia con
los objetivos core de WTW.

Este documento **no se ejecuta el día que se escribe**. Se escribe hoy para que la decisión ya
esté tomada cuando haya datos, y no se improvise con la respuesta que resulte más cómoda ese día.
Depende de `docs/plans/2026-08-10-alineacion-council.md` §Fase 1, cuya compuerta es la entrada.

---

## 0. La dependencia que ordena todo el plan

Al proponer estas metodologías cometí un error que hay que dejar corregido aquí, porque si no el
plan se ejecuta en el orden equivocado:

**Dije que las clases de referencia (Track A) se podían hacer igual "porque no piden disciplina
nueva". Es falso.** No piden disciplina *adicional*, pero se calculan a partir de tareas
**medidas** — `Task.estimadoMin` contra `TimeEntry`. Si el cronómetro sigue sin usarse, no hay
muestras y el cálculo no existe.

Es la misma trampa que el council ya diagnosticó una vez: agregar cosas encima del hueco de
medición compone el error. Aquí aplica igual.

> **Regla que gobierna este plan:** todo Track cuyo insumo sea tiempo medido está bloqueado hasta
> que haya tiempo medido. La única intervención que ataca la causa raíz es la de disciplina
> (Track B1). Si la compuerta dice que domina "trabajé sin cronómetro", **esa se hace primero y
> sola**, y el resto del plan se recorre dos semanas.

---

## 1. Cómo se lee la compuerta (2026-08-26)

Entrar a `/cierre` y leer el panel **"Qué causa domina — últimos 14 días"**.

### Precondición de validez

| Condición | Lectura | Qué hacer |
|---|---|---|
| ≥ 8 días reconciliados de 14 | Muestra suficiente | Ejecutar la rama que corresponda |
| 4–7 días reconciliados | Señal débil | Ejecutar **solo Track B1**, extender la compuerta 2 semanas |
| < 4 días reconciliados | **Sin datos** | No ejecutar nada de este plan. Ver §5 |

El caso de < 4 días es el más informativo de los tres y por eso tiene su propia sección. No
reconciliar es en sí mismo el resultado del experimento, no una corrida fallida.

### La rama

| Causa dominante | Qué significa | Track |
|---|---|---|
| **Trabajé sin cronómetro** | Problema de disciplina. La medición no existe | **B1** — Pomodoro adaptado |
| **Bomberazo** | El trabajo no comprometido come la semana | **B2** — intenciones + WIP |
| **Cambio de prioridad del cliente** | Problema de alcance, no de método | **B3** — y es sobre todo conversación con Liverpool |
| **Junta que se alargó** | La capacidad nominal miente | **B4** — corrección de cálculo, no metodología |
| Empate (ninguna > 40%) | Sin señal | Track B1 por defecto: la medición es prerequisito de todo |

---

## 2. Track B1 — Pomodoro adaptado (si domina la falta de cronómetro)

**Hipótesis:** cronometrar no falla por olvido sino porque arrancar el cronómetro es un acto
voluntario separado del trabajo. Pomodoro lo vuelve la *unidad* de trabajo, no un trámite previo.

Lo que se toma de Cirillo **no es el 25/5** — es que (a) el pomodoro es indivisible y una
interrupción lo anula en vez de pausarlo, y (b) las interrupciones se registran distinguiendo
internas de externas.

### Qué se construye

`/focus` ya tiene `FocusClock`, `BreakAlert`, `useWakeLock` y pausa persistente. Esto es una
extensión, no una vista nueva.

1. **Duración por tipo de trabajo, no 25 fijo.** 50/10 para trabajo de modelo (AnyLogic, Python,
   Power BI), 25/5 para vaciar pendientes. El default sale de `Task.herramienta`, que ya existe.
   *No inventar un campo nuevo para esto.*
2. **Contador de pomodoros completos por tarea**, visible en `/dia`. Es el marcador que hace que
   la disciplina se vea sin abrir un reporte.
3. **Registro de interrupción en un tap**, con las dos categorías de Cirillo (interna / externa).
   **Escribe directo a un `Desvio` del día** con causa `bomberazo` si es externa. Esto es lo
   importante del track: cierra el ciclo entre el momento del trabajo y `/cierre`, y hace que
   reconciliar en la noche tome 20 segundos en vez de 60 porque ya está medio lleno.

### Criterio de éxito, medido en la compuerta siguiente (2026-09-09)

Cobertura de medición (`tareasConTiempo / tareasHechas`, ya calculado en
`src/app/(app)/semana/nueva/service.ts`) **sube de <0.6 a ≥0.8 sostenido dos semanas**.
Si no sube, Pomodoro no es la respuesta y el problema no era el método — hay que volver a la
pregunta abierta del council (¿la carga excede la capacidad?), que no se arregla con software.

---

## 3. Track A — Clases de referencia (desbloqueado solo con medición)

**Solo se ejecuta si la cobertura de medición ≥ 0.6.** Antes de eso no hay muestras.

**Hipótesis:** un factor global de 1.4 no puede ser correcto a la vez para "armar un PowerPoint"
y "correr un gemelo en AnyLogic". Es la corrección de Flyvbjerg a la falacia de planeación:
estimar desde la distribución de casos parecidos (vista externa) y no desde la descomposición de
la tarea (vista interna).

### Qué se construye

Hoy `src/lib/factor-realismo.ts` calcula **un solo número** para todo: promedia `real/estimado`
sobre todas las tareas `done` y lo mezcla 0.6 manual / 0.4 observado tras ≥3 semanas cerradas.

1. `factoresPorClase(userId)` — mismo cálculo, agrupado por `Task.herramienta`.
2. **Mínimo de muestras por clase (sugerido: 5).** Bajo ese umbral la clase **cae al factor
   global**, no a un promedio de dos tareas. Un factor de 2.1× calculado sobre dos casos es peor
   que 1.4, porque parece preciso.
3. `contextoPlaneacion` expone los factores por clase; `crearSemanaAction` aplica el de la tarea
   en `ajustado()` en vez del global.
4. El paso 3 del planeador muestra cuál factor está aplicando y sobre cuántas muestras. Un factor
   sin su n es una afirmación sin respaldo.

### Criterio de éxito

El error absoluto medio de estimación baja contra la línea base del factor global. Si no baja,
la clase de referencia correcta no es la herramienta — puede ser el proyecto o el tipo de
entregable, y eso se prueba después, no se asume.

---

## 4. Tracks B2, B3, B4 — según la causa

### B2 — Intenciones de implementación + límite de WIP (si dominan los bomberazos)

**Intenciones de implementación** es la intervención más barata de todo el plan. El hallazgo de
Gollwitzer: un plan en forma "**si** [situación] **entonces** [acción]" se ejecuta mucho más que
una intención genérica (metaanálisis Gollwitzer & Sheeran 2006, efecto medio-grande — es de los
resultados más replicados del área).

Tu campo `WeekRisk.defensa` ya es el lugar correcto, pero hoy produce texto tipo *"cuidar el
alcance"*, que no se ejecuta nunca.

- Cambiar el prompt de pre-mortem en `src/app/(app)/semana/nueva/prompts.ts` para que la defensa
  salga siempre como condicional con disparador observable.
- **Hacer editable la defensa en `PasoPreemptar`.** Hoy los riesgos se renderizan de solo
  lectura: vienen de la IA y no hay forma de escribir uno a mano ni de corregir una defensa. Eso
  hay que arreglarlo aunque no se haga nada más de este track.

**Límite de WIP:** tope de 3 tareas de fondo por día en `/dia`, como advertencia, no como bloqueo.
Conecta con la pregunta abierta del council: vuelve visible cada día si la carga excede la
capacidad, en vez de dejarlo como sensación.

### B3 — Cambio de prioridad del cliente

**No es un track de software.** Si esto domina, el entregable es una conversación con Liverpool
con el panel de `/cierre` como evidencia — que para eso se construyó `origenUrgencias`. Lo único
que se construye: exportar el desglose por stakeholder a algo pegable en un correo.

Registrarlo aquí para que no se convierta en una función que sustituya la conversación.

### B4 — Junta que se alargó

Tampoco es metodología: es que `capacityForWeek` calcula sobre el calendario **nominal**. La
corrección es aplicar un factor de desbordamiento medido de los `Desvio` con esa causa. Es el
track más pequeño y el más mecánico.

---

## 5. Si la compuerta llega vacía (< 4 días reconciliados)

Éste es el resultado que más hay que tomar en serio, y por eso no se trata como un fallo de
la corrida.

Si en dos semanas no se reconciliaron ni 4 días, la conclusión no es "hay que hacer `/cierre` más
fácil". Es que **el ciclo de captura no está compitiendo bien contra el día real**, y agregar
Pomodoro encima sería exactamente el error contra el que advierte §0.

En ese caso, la acción es la **Fase 0 del plan del council** — la tabla de "última decisión real
que cambió" por ruta — que sigue pendiente y no es trabajo de software. Y la pregunta abierta que
ningún asesor pudo contestar: si la carga de Liverpool excede la capacidad real, ninguna función
lo arregla; lo arregla renegociar alcance u horas.

---

## 6. Calendario de las dos semanas de ejecución

Asume que la compuerta abrió con muestra suficiente. Un solo track a la vez: correr dos en
paralelo hace imposible atribuir el efecto, que es justo lo que este plan existe para evitar.

| Días | Actividad | Salida |
|---|---|---|
| 1 | Leer la compuerta, escribir la lectura en este doc | Rama elegida, con su porcentaje |
| 2–4 | Construir el track (service + tests primero) | Suite verde |
| 5 | Verificar en navegador + desplegar | En producción |
| 6–12 | **Uso real, sin tocar código** | Datos nuevos |
| 13 | Segunda lectura de la compuerta | Comparación contra la línea base |
| 14 | Decidir: se queda, se ajusta o se revierte | Anotado aquí mismo |

Los días 6–12 son la parte que se salta siempre y es la única que produce evidencia. **Un track
sin siete días de uso real no se puede evaluar**, y en ese caso se deja correr en vez de
construir el siguiente.

---

## 7. Lo que NO se construye

- **GTD** — `/inbox` ya es captura y clarificación. Ponerle el nombre no agrega nada.
- **Deep Work / time-blocking como función nueva** — ya está: bloques + `/focus`, y el *shutdown
  ritual* de Newport es literalmente `/cierre`.
- **Ritmos ultradianos / bloques de 90 min** — la evidencia es bastante más débil que su
  popularidad. No se construye encima de eso.
- **Eat the Frog, matriz de Eisenhower** — los Wins y `Task.alcance` ya priorizan, con más
  contexto del que daría una matriz genérica.
- **Calibración con Brier sobre el pre-mortem** — buena idea, prematura. Necesita muchas semanas
  de riesgos cerrados para significar algo, y hoy `getHistorialRiesgos` apenas tiene con qué.
  Se reevalúa cuando haya ≥20 riesgos cerrados, no antes.

---

## 8. Cómo sabremos que este plan falló

- Se construyeron dos o más tracks antes de tener siete días de uso real de alguno.
- Se ejecutó un track cuyo insumo es tiempo medido sin que la cobertura de medición pasara 0.6
  (§0).
- La compuerta llegó vacía y la respuesta fue construir algo en vez de §5.
- Algún factor por clase se está aplicando con menos de 5 muestras.

---

## 9. Nivel de confianza de lo que se cita

Honestidad sobre las fuentes, porque el plan pide decisiones basadas en ellas:

- **Gollwitzer & Sheeran (intenciones de implementación)** y **Flyvbjerg (clases de referencia /
  falacia de planeación)** — sólidos y bien replicados. Se puede construir sobre ellos.
- **Pomodoro (Cirillo)** — método práctico, no cuerpo experimental. Su valor aquí es mecánico
  (vuelve la medición un subproducto del trabajo), no un efecto demostrado en la literatura.
- **"23 minutos para retomar tras una interrupción" (Gloria Mark)** — el estudio existe, pero la
  cifra se simplifica mucho al repetirse. Usarla como orden de magnitud, nunca como constante en
  un cálculo del código.
