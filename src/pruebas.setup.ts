import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs without globals, so Testing Library cannot unmount on its own.
afterEach(cleanup)

// Node 26 has its own `localStorage`, undefined without --localstorage-file,
// and it hides jsdom's. Tests get an in-memory one instead.
if (typeof globalThis.localStorage?.setItem !== 'function') {
  const datos = new Map<string, string>()
  const memoria: Storage = {
    get length() {
      return datos.size
    },
    clear: () => datos.clear(),
    getItem: (k) => datos.get(k) ?? null,
    key: (i) => [...datos.keys()][i] ?? null,
    removeItem: (k) => void datos.delete(k),
    setItem: (k, v) => void datos.set(k, String(v)),
  }
  Object.defineProperty(globalThis, 'localStorage', { value: memoria, configurable: true })
}
