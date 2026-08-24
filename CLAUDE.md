# CLAUDE.md

@AGENTS.md

## Proyecto

WTW App v2 — evolución del tablero personal WTW (Winning the Week) a web app multi-usuario
para consultoría boutique (VP Consulting). 4 capas: ejecución personal, engagement tipo
top-tier, economía de firma, desarrollo profesional. Diseño completo en
`docs/plans/2026-07-06-wtw-app-design.md` — leerlo antes de cualquier cambio de fondo.

## Stack

Next.js 16.2.10 (App Router, Turbopack) + Prisma 6 + PostgreSQL (Neon) + Tailwind v4 + TypeScript.
Sin next-pwa (compatibilidad incierta con Next 16) — manifest nativo `app/manifest.ts` + service
worker escrito a mano en `public/sw.js`.

## Arquitectura de auth — dos capas, una lógica

- `/api/v1/*` — Bearer PAT (`~/.wtw-token`), para los skills de Claude (`/wtw-semana`, `/wtw-dia`,
  `/wtw-comprometer`). Ver `src/lib/api-auth.ts`.
- UI web — cookie de sesión (Jose JWT httpOnly), Server Actions. Ver `src/lib/session.ts`.
- Ambas capas llaman los MISMOS `service.ts` — nunca dupliques lógica de negocio entre ellas.

## Comandos

```bash
npm run dev              # dev server (Turbopack)
npm run build             # build de producción
npx vitest run             # suite completa contra POSTGRES LOCAL — ~22 s, 34 archivos
USE_NEON=1 npx vitest run  # contra Neon (~15 min, frágil) — solo antes de un release
npx prisma db push --accept-data-loss   # aplicar cambios de schema (migrate dev NO funciona
                                          # sin TTY interactivo en este entorno — usar siempre db push)
npx prisma generate
npx tsx scripts/generate-token.ts <email>   # generar un PAT nuevo
```

## Base de datos: producción vs. tests

- **Producción** (lo que usan el iPad, el teléfono y la web): Vercel + **Neon**. No cambió.
- **Tests**: Postgres LOCAL de Homebrew, puerto **5433** (el 5432 lo ocupa la instalación EDB).
  Autenticación `trust`, usuario `vpconsulting` — sin contraseñas. Config en `.env.test`
  (gitignoreado), cargada por `vitest.config.ts`.

Arrancar el Postgres de tests (si la Mac se reinició):

```bash
LC_ALL=en_US.UTF-8 /usr/local/opt/postgresql@17/bin/pg_ctl \
  -D /usr/local/var/postgresql@17 -o "-p 5433" start
```

`LC_ALL` no es opcional: sin él, Postgres 17 en macOS falla con
"postmaster became multithreaded during startup".

**Por qué se movió:** contra Neon la suite tardaba ~15 min (0.2-2 s por roundtrip a
us-east-1), se caía por cold starts —Neon Free suspende el compute a los 5 min— y
agotaba el pooler de 17 conexiones cuando el dev server estaba encendido. Peor: los
tests compartían base con los DATOS REALES, y lo único que los separaba era que cada
`deleteMany` estuviera scopeado por `userId` (regla 4 abajo). Local: 22 s y aislado.

**Cómo distinguir un rojo de infraestructura de uno real** (aplica al correr con
`USE_NEON=1`): fallas en milisegundos = "Can't reach database server"; fallas en
10 s exactos = pool agotado. Un fallo de aserción real falla en el tiempo normal
del test.

## Credenciales de desarrollo

- Usuario seed: `mgonzalez@vpconsulting.mx` / password `cambiar-ya` (via `SEED_PASSWORD` env,
  **cambiar antes de cualquier uso real más allá de dev**)
- DB: Neon, proyecto compartido con restaurant-os, database separada `wtw_app_dev`
- Preview server: `.claude/launch.json` vive en la RAÍZ del workspace (`Coding/.claude/launch.json`,
  no aquí) — entrada `wtw-app-dev`, puerto 3010. Siempre usar `preview_start` con
  `name: "wtw-app-dev"` explícito (el workspace comparte launch.json con otros proyectos).

## Reglas aprendidas (no repetir estos bugs)

1. **Nunca `useState(() => Date.now())` / `Math.random()` / `new Date()` como valor inicial**
   en un componente que se renderiza en servidor — causa hydration mismatch. Arrancar en `null`,
   llenar en `useEffect` tras montar.
2. **Nunca pasar un modelo de Prisma completo a un Client Component** — puede tener campos
   `Decimal` (no serializables por el límite RSC) y expone columnas sensibles (`passwordHash`,
   `apiTokenHash`) innecesariamente. Construir siempre un objeto plano con solo lo que la UI usa.
3. **Cualquier asset verdaderamente público** (manifest, íconos PWA, sw.js, portal cliente con
   su propio token) debe excluirse del matcher de `src/proxy.ts`, no solo de `PUBLIC_ROUTES`
   (que redirige lejos si hay sesión — incorrecto para el portal, donde Mau sí puede querer
   previsualizar estando logueado).
4. **Tests contra la DB compartida de Neon**: cualquier `deleteMany()` debe escopar por
   `userId` — nunca invocarlo sin `where`. Ver `tests/helpers/cleanup.ts` (`deleteTestUser`).
5. **`preview_click`/`preview_fill` (las herramientas MCP)** no disparan confiablemente el
   `<form action={fn}>` de React 19 ni siempre los `<Link>` de Next — usar `preview_eval` con
   setters nativos de `HTMLInputElement`/`HTMLTextAreaElement` + `dispatchEvent('input')` +
   `form.requestSubmit()` para formularios, y `window.location.href = ...` (no `.click()` en
   un `<a>`) para navegación confiable entre páginas.
6. **`preview_console_logs` cachea errores viejos entre reloads** — para confirmar que un error
   ya no ocurre, reiniciar el server completo (`preview_stop` + `rm -rf .next` + `preview_start`).
7. **Todo modelo nuevo que cuelgue de `User` sin cascada va a `tests/helpers/cleanup.ts`**, y en
   el orden correcto. Si se olvida, la FK bloquea el `user.delete` y truena CUALQUIER test que
   cree un usuario, no solo los del módulo nuevo. `DayReconciliation` se borra ANTES que `Task`
   porque sus `Desvio` apuntan a `Task` y a `Stakeholder` sin cascada.
8. **`updateMany` no escribe relaciones de Prisma.** Para conectar una relación tras validar
   propiedad con `updateMany`, hace falta un `update` aparte por id — el `count` previo ya probó
   que la fila es del usuario, así que el segundo query no necesita repetir el filtro.
9. **Antes de tocar el schema de Neon, correr `prisma migrate diff --script` y leer el SQL.**
   Si es puramente aditivo (`CREATE TABLE`/`CREATE TYPE`), `prisma db push` va SIN
   `--accept-data-loss`. Ese flag solo debe aparecer contra la base de tests.
10. **Un `@updatedAt` nuevo sobre una tabla que YA tiene filas necesita `@default(now())`.**
    Sin él el SQL sale `ADD COLUMN ... NOT NULL` sin default y no puede rellenar lo existente.
    Verificarlo leyendo el diff, no probándolo contra la base de tests: esa suele estar vacía y
    da un falso verde.
11. **Nunca mutar `Block.fecha` antes de haber leído lo que dependa de esa fecha.** Mover un
    bloque cambia el MISMO registro, y todo lo que calcula "lo planeado del día X" lee por fecha.
    Ese era el bug que dejó al 13-ago-2026 irrecuperable. Regla general: en un cierre, primero se
    registra y al final se mueve.
12. **`preview_console_logs` puede seguir sirviendo errores del proceso ANTERIOR** incluso tras
    `preview_stop` + `rm -rf .next` + `preview_start` — el buffer es del tab, no del server. Para
    descartar un error de compilación: `grep` el import en el fuente y `curl` la ruta (un 307/200
    prueba que compila; un 500 no). No asumir "es caché" sin esas dos pruebas.

13. **El razonamiento del modelo sale del MISMO `max_tokens` que el texto.** Los modelos
    actuales razonan por default: una llamada con `max_tokens: 2000` gastó 1446 tokens en
    razonar y dejó 554 para el JSON, que llegó cortado a media entrada — y el planeador lo
    reportó como "la IA respondió en un formato que no pude leer", culpando al modelo de un
    techo nuestro. Nunca pedir menos de los 8000 del default de `callModel`, y nunca creerle
    a un banner de "formato ilegible" sin revisar antes `stop_reason` y `thinking_tokens`. Un
    JSON truncado se delata al parsear; una PROSA truncada no —se guardaba como borrador
    bueno— así que `callModel` lanza en vez de devolver texto a medias.

## Rutas archivadas

`/roi` está archivada detrás de un flag (`src/lib/flags.ts`): responde 404 y no aparece en la
navegación. El service y sus tests siguen vivos. Revivirla es `WTW_RUTAS_ACTIVAS=roi`, y la
condición para hacerlo es que exista una decisión de precio que dependa de ella.

## Estado del roadmap

**Fase 7 (PMO con IA) — Fase A implementada 2026-07-16** (diseño:
`docs/plans/2026-07-16-fase7-pmo-ia-design.md`): minutas por junta con promoción a
Task/Issue (drawer en /dia), generador de status de equipo en la voz de Mau
(/proyectos/[id]), capa IA (`src/lib/ai/` — `callModel` es el ÚNICO punto que toca el SDK
de Anthropic y registra AiCall), ensamblador determinista de insumos, Artifact con par
borrador/final (flywheel de aprendizaje), evals gated (`EVAL=1` + `ANTHROPIC_API_KEY`,
`tests/ai/status-eval.test.ts`). Requiere `ANTHROPIC_API_KEY` en `.env`/Vercel para
generar en vivo (sin ella la UI muestra banner ámbar, no crashea). Fases B–D pendientes
(§8 del doc de diseño).

**Plan del council (2026-08-10) — Fases 1, 2 y 2b cerradas el 2026-08-12.** Reconciliación de
cierre de día en `/cierre` (clasifica POR QUÉ se rompió el plan en 4 causas, cada una con un
dueño distinto: cliente, código o disciplina; el panel de 14 días es la salida de la compuerta),
mapa de stakeholders con cadencia en `/stakeholders`, etiquetado de competencias en el paso 3
del planeador, y `/roi` archivada. **Pendiente: la Fase 0** —la tabla de "última decisión real
que cambió" por ruta— que es trabajo de Mau, no de software, y la Fase 3 (consolidar las dos
fuentes de verdad del PMO de Liverpool: app vs. skills sobre Obsidian/Excel).

Las 6 fases del diseño original están completas (Fundación, Mi Día+PWA, Semana+Skills+Calendario,
Proyectos+Desarrollo, Cliente+Economía, Equipo). Detalle de cada una en la memoria de Claude
(`project_wtw_app.md`) y en los commits de este repo. Diferido conscientemente (documentado
en cada plan de fase, no olvidado): invitación por email, cambio de contraseña propio, roles
granulares más allá de manager/report, notificaciones push, generación automática de PPTX,
digest automático, expansión RRULE de calendario.
