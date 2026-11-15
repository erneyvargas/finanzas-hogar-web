import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs without globals, so Testing Library cannot unmount on its own.
afterEach(cleanup)

// Node 26 has its own `localStorage`/`sessionStorage`, undefined without
// --localstorage-file, and they hide jsdom's. Tests get in-memory ones.
function enMemoria(nombre: 'localStorage' | 'sessionStorage') {
  if (typeof globalThis[nombre]?.setItem === 'function') return
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
  Object.defineProperty(globalThis, nombre, { value: memoria, configurable: true })
}
enMemoria('localStorage')
enMemoria('sessionStorage')

// What a page remembers for the tab must not leak from one test to the next.
afterEach(() => sessionStorage.clear())
