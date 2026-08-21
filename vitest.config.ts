import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { config as loadEnv } from 'dotenv'

// La suite corre contra Postgres LOCAL (.env.test), no contra Neon. Producción
// —lo que usa el iPad— sigue en Neon y no se toca. Dos razones:
//
// 1. Velocidad: un roundtrip a Neon en us-east-1 son 0.2-2 s; local son <5 ms.
//    La suite pasó de ~15 min a menos de 1.
// 2. Seguridad: contra Neon los tests comparten base con los datos REALES, y lo
//    único que los separa es que cada deleteMany esté scopeado por userId
//    (regla 4 del CLAUDE.md). Un `where` mal puesto borraba datos de verdad.
//
// Para correr contra Neon a propósito (antes de un release): USE_NEON=1 npx vitest run
if (!process.env.USE_NEON) loadEnv({ path: '.env.test', override: true })

export default defineConfig({
  plugins: [react()],
  test: {
    // Fase 1: solo tests de servidor. Tests de componentes usarán
    // `// @vitest-environment jsdom` por archivo.
    environment: 'node',
    globals: true,
    // Los worktrees de Claude viven DENTRO del repo: sin este exclude, vitest
    // corre también sus copias (viejas) de tests/ contra el src actual.
    exclude: ['**/node_modules/**', '**/.claude/worktrees/**'],
    setupFiles: [],
    globalSetup: ['./tests/global-teardown.ts'], // solo exporta teardown() — corre al final de toda la suite
    fileParallelism: false, // los tests comparten una sola base — sin paralelismo entre archivos
    // 60 s se calibró para absorber la varianza de Neon. Contra local sobra, pero
    // se conserva para que USE_NEON=1 siga funcionando sin reconfigurar.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      'server-only': path.resolve(__dirname, './tests/stubs/server-only.ts'),
      '@': path.resolve(__dirname, './src'),
    },
  },
})
