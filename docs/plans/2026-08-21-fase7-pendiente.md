# Fase 7 (plan "Siguiente Nivel") — PENDIENTE

Estado: **detenida a media ejecución por decisión de Mau (2026-08-20)**. Las fases 1–6
del plan están completas y en producción (commits `67b578f..22e6eb1`). El avance
parcial de esta fase vive en la rama **`fase7-wip`** (2 commits) — retomar desde ahí,
no rehacer.

## Alcance de la fase (del plan aprobado)

1. **Briefing matutino "Tu arranque"** en /dia — determinista, calculado server-side
   al cargar el día (sin cron, sin IA): primer bloque, causa dominante de ayer,
   arrastradas, hasta 2 stakeholders fríos con su siguiente acción, win en riesgo
   (sin bloques futuros y no logrado) con su si-entonces, y nivel del semáforo JD-R.
   Card colapsable, tono dato, solo visible si es hoy y hay algo que decir.
2. **One-pager del promotion case** en /desarrollo/caso — página print-first
   (Cmd+P → PDF): veredicto del gap dashboard, mejores 3 evidencias por reactivo
   (con testigo primero), impactos de cliente (baseline → delta → validó), y la
   línea honesta de huecos. Para armar al sponsor ante el comité.
3. **Log de propuestas desde literatura** — reactivo 11 de Gerente: registro
   insight → fuente → dónde propuse → qué pasó, sección colapsada en /desarrollo.

## Estado del avance en `fase7-wip`

- `0ba9132`: modelo `PropuestaLiteratura` en schema + `literatura-service.ts` /
  `literatura-actions.ts` + entradas en `cleanup.ts` / `global-teardown.ts`
  (regla 7 aplicada) + `src/lib/briefing.ts` (service del briefing, a medias).
- `5127a4d`: restos al detener — `dia/BriefingCard.tsx`, `desarrollo/caso/service.ts`
  y `BotonImprimir.tsx`, edición parcial de `DesarrolloBoard.tsx`.
- **Nada de esto está verificado**: sin tests corridos, sin tsc confirmado, sin
  revisión visual. Tratarlo como borrador.

## Avisos para quien retome

- **La tabla `PropuestaLiteratura` probablemente YA existe en Neon** (el agente
  alcanzó a hacer `db push` antes de detenerse). Es aditiva y vacía — inofensiva,
  pero al retomar verificar con `prisma migrate diff` antes de asumir estado.
- La base de tests local (5433) puede o no tener el modelo — mismo diff.
- Faltan por completo: tests de las 3 features, integración del BriefingCard en
  /dia, la página `caso/page.tsx` con su CSS print, la sección de literatura en
  DesarrolloBoard, y la pasada de verificación (tsc + suite + browser).
- Los 3 specs completos de los agentes quedaron en la sesión de Claude del
  2026-08-20 — el plan detallado por feature está en este archivo (arriba) y en
  el artifact "Plan de Desarrollo WTW".
