/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The site is served from https://erneyvargas.github.io/finanzas-hogar-web/,
// so assets need that prefix in production.
export default defineConfig({
  base: '/finanzas-hogar-web/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/pruebas.setup.ts'],
  },
})
