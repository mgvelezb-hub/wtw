# Fase 7 (plan "Siguiente Nivel") — COMPLETADA

Estado: **terminada y en producción el 2026-08-21** (commit `dbed4ea`). Se detuvo a
media ejecución el 2026-08-20, se retomó desde la rama `fase7-wip` (ya eliminada)
y se completó con auditoría del borrador.

Con esto el plan "Siguiente Nivel" queda **7 de 7 fases en producción**
(`67b578f..dbed4ea`).

## Lo entregado

1. **Briefing matutino "Tu arranque"** en /dia — determinista, al cargar el día:
   primer bloque, causa dominante de ayer, arrastradas, stakeholders fríos con su
   siguiente acción, win en riesgo con su si-entonces, semáforo JD-R.
   `src/lib/briefing.ts`, `dia/BriefingCard.tsx`, `tests/briefing.test.ts`.
2. **One-pager del promotion case** en /desarrollo/caso — print-first (Cmd+P → PDF):
   veredicto del patrón, hasta 3 evidencias por reactivo (testigo primero), impacto
   de cliente, huecos honestos. `desarrollo/caso/**`, `tests/promotion-case.test.ts`.
3. **Log de propuestas desde literatura** (reactivo 11) — sección colapsada en
   /desarrollo, modelo `PropuestaLiteratura`. `desarrollo/literatura-*`,
   `tests/literatura.test.ts`.

## Lo que el borrador tenía mal (para la memoria del repo)

- `briefing.ts` importaba de `dia/service.ts` y éste lo necesitaba a su vez:
  ciclo de módulos + consulta de arrastradas duplicada. Fix: el conteo se pasa
  como parámetro y `getDiaView` comparte una sola promesa.
- `PropuestasLiteraturaSection` estaba definida pero nunca renderizada.
- `tests/global-teardown.ts` no borraba `DayReconciliation` antes de `Task`/
  `Stakeholder` (regla 7) — preexistente, el barrido final fallaba con FK.

## Primera lectura con datos reales

Al primer render, el briefing mostró **52% de los minutos cronometrados de los
últimos 14 días fuera de jornada o en fin de semana** (señal de erosión de
frontera del semáforo JD-R). Ese es el dato que la pregunta abierta del council
necesitaba.
