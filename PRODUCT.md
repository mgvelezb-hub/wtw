# PRODUCT.md — WTW App

> Redactado el 2026-09-04 a partir de lo que ya estaba documentado en este repo
> (CLAUDE.md, `docs/plans/`) y de las decisiones registradas de Mau. **No es una
> entrevista de marca**: si algo aquí no describe la intención real, corregirlo
> aquí es más barato que discutirlo en cada revisión.

register: product

## Product Purpose

Automatizar la disciplina PMO que su dueño detesta hacer a mano (visibilidad de
tareas y de tiempo) e **instrumentar las métricas con las que lo evalúan**:
demostrar en automático el rol que ya ejerce y crear a propósito oportunidades
del siguiente.

No es una app de productividad genérica. Existe contra una brecha nombrada: el
360 "Alto desempeño 2025" marcó, con 4 de 4 evaluadores de acuerdo, que no
cumple lo que promete — sobre-optimismo al estimar, sobre-compromiso de alcance.
Tres proyectos (Cuervo 2023, NADRO 2024-25, el 360 de 2025) repiten las mismas
tres causas: dimensionamiento de desarrollo, mano levantada tarde, alcance sin
MVP. El factor de realismo, el buffer obligatorio y el cierre por causas atacan
esa brecha directamente.

## Users

Un usuario real, diario, experto: Mauricio González, consultor de VP Consulting.
Usa la app desde el iPad en la pantalla de inicio y desde un monitor de
escritorio. Conoce cada pantalla de memoria. No necesita que se le explique qué
es una tarea; necesita que la app no le cobre trabajo administrativo por
registrar lo que ya hizo.

Segundo anillo, todavía no probado: 2 o 3 externos en una prueba pendiente, y
más adelante el equipo (la capa de manager/report ya existe en el schema).

## Tone

El vocabulario del dueño, no el del software. "Ingredientes", no "COGS";
"Personal", no "Nómina" (regla heredada del proyecto hermano y aplicada igual
aquí). Nombrar el trabajo como él lo nombra: "Wins", "el ritual", "el lienzo",
"fuera de jornada".

Honesto antes que amable. La app le dice que el 64% de sus minutos cayeron fuera
de su jornada, y no lo suaviza. Pero nunca sentencia: un Win que no se logró se
muestra como "no logrado", no como "fallido" — el mismo dato sin el tono de
condena.

## Strategic Principles

1. **Instrumento, no dashboard.** Nav por momentos (Hoy · Semana · Cierre ·
   Proyectos · Carrera). Una pregunta por pantalla. Barra de estado en vez de
   banners. Números tabulares y líneas de 1px en vez de tarjetas con sombra.
2. **La IA propone, el humano dispone.** Nada se auto-aplica: ni el factor, ni
   las clases de trabajo sugeridas, ni la evidencia inferida de minutas. Un
   ajuste a la vez.
3. **Un aviso que llega cuando la cosa ya está hecha educa a ignorarlo.** Todo
   recordatorio se comprueba contra el estado real antes de salir.
4. **Honestidad de datos sobre completitud.** Un tiempo no medido se queda en
   null antes que inventarse; `TimeEntry.manual` marca lo corregido a mano.
5. **El cierre de caja del día cabe en un minuto.** Si un ritual se vuelve
   formulario, deja de hacerse.

## Anti-references

- El dashboard de KPIs con tarjetas iguales en rejilla: es lo que esta app dejó
  de ser en el rediseño de agosto.
- El template de la métrica heroica (número enorme, etiqueta chica, acento en
  degradado).
- La app de hábitos que premia con confeti. Aquí el premio es que el plan salga.
- Excel y Obsidian, de donde vino todo esto: ganaron en flexibilidad y perdieron
  en que nadie los mira el jueves a las 6.
