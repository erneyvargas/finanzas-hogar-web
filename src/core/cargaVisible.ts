import { useEffect, useRef, useState } from 'react'

/**
 * Minimum-visible flag for a skeleton.
 *
 * - A load that ends before [retrasoMs] never showed the skeleton (its CSS
 *   delay), so the flag turns off at once: fast content is never slowed down.
 * - A skeleton that appeared stays until [retrasoMs] + [minimoMs] from the
 *   load start, so it reads as "loading" and not as a flicker.
 */
export function useCargaVisible(cargando: boolean, retrasoMs = 200, minimoMs = 400): boolean {
  const [visible, setVisible] = useState(cargando)
  const inicio = useRef(cargando ? Date.now() : 0)

  useEffect(() => {
    if (cargando) {
      inicio.current = Date.now()
      setVisible(true)
      return
    }
    const pasado = Date.now() - inicio.current
    const falta = retrasoMs + minimoMs - pasado
    if (pasado < retrasoMs || falta <= 0) {
      setVisible(false)
      return
    }
    const t = setTimeout(() => setVisible(false), falta)
    return () => clearTimeout(t)
  }, [cargando, retrasoMs, minimoMs])

  return visible
}
