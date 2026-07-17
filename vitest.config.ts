import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    // Fase 1: solo tests de servidor. Tests de componentes usarán
    // `// @vitest-environment jsdom` por archivo.
    environment: 'node',
    globals: true,
    setupFiles: [],
    globalSetup: ['./tests/global-teardown.ts'], // solo exporta teardown() — corre al final de toda la suite
    fileParallelism: false, // tests comparten la DB dev — sin paralelismo entre archivos
    // La latencia de Neon es variable (0.2s-2s por roundtrip según hora): con 20s la
    // suite completa tiraba decenas de "Hook timed out" en horas malas sin ningún test
    // realmente roto. 60s absorbe la varianza; los tests siguen fallando rápido cuando
    // la aserción es la que falla.
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
