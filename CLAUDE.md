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
npx vitest run             # suite completa — ~26 archivos, puede tardar 5-15 min contra Neon
                            # (latencia de red, no bug — usa run_in_background + espera notificación)
npx prisma db push --accept-data-loss   # aplicar cambios de schema (migrate dev NO funciona
                                          # sin TTY interactivo en este entorno — usar siempre db push)
npx prisma generate
npx tsx scripts/generate-token.ts <email>   # generar un PAT nuevo
```

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

## Estado del roadmap

Las 6 fases del diseño están completas (Fundación, Mi Día+PWA, Semana+Skills+Calendario,
Proyectos+Desarrollo, Cliente+Economía, Equipo). Detalle de cada una en la memoria de Claude
(`project_wtw_app.md`) y en los commits de este repo. Diferido conscientemente (documentado
en cada plan de fase, no olvidado): invitación por email, cambio de contraseña propio, roles
granulares más allá de manager/report, notificaciones push, generación automática de PPTX,
digest automático, expansión RRULE de calendario.
