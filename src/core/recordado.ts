/**
 * What the page remembers for this browser tab, so F5 keeps it: it lives
 * in sessionStorage and goes away when the tab closes. Blocked storage
 * (private window, previews) just means nothing is remembered.
 */
export function leerDeLaPestana<T>(clave: string): T | null {
  try {
    const texto = sessionStorage.getItem(clave)
    return texto ? (JSON.parse(texto) as T) : null
  } catch {
    return null
  }
}

export function guardarEnLaPestana(clave: string, valor: unknown) {
  try {
    sessionStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    // Not remembered; the page keeps working.
  }
}
