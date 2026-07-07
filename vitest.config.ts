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
    fileParallelism: false, // tests comparten la DB dev — sin paralelismo entre archivos
    testTimeout: 20_000, // cada roundtrip a Neon tarda ~1-2s; tests con varias escrituras superan el default de 5s
    hookTimeout: 20_000,
  },
  resolve: {
    alias: {
      'server-only': path.resolve(__dirname, './tests/stubs/server-only.ts'),
      '@': path.resolve(__dirname, './src'),
    },
  },
})
