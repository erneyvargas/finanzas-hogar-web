import { useRef, useState } from 'react'
import type { FuenteDeMovimientos, FuncionQueSeEjecuta } from '../movimientos/fuente'
import { ErrorDelServidor, MENSAJE_GENERICO } from '../movimientos/reglas'

const comoError = (e: unknown) =>
  e instanceof ErrorDelServidor ? e : new ErrorDelServidor(MENSAJE_GENERICO, null)

/**
 * Saves a reviewed receipt through one server function and closes on
 * success. A failure stays on screen as the server worded it. Only a
 * retry after an unknown outcome can meet its own earlier save
 * (`ya_existe`), and that counts as saved.
 */
export function useGuardarFactura(
  movimientos: FuenteDeMovimientos,
  setGuardando: (g: boolean) => void,
  alCerrar: (guardado: boolean) => void,
) {
  const [error, setError] = useState<ErrorDelServidor | null>(null)
  const yaIntento = useRef(false)

  async function guardar(funcion: FuncionQueSeEjecuta, params: Record<string, unknown>) {
    setGuardando(true)
    setError(null)
    try {
      await movimientos.ejecutar(funcion, params)
      setGuardando(false)
      alCerrar(true)
    } catch (e) {
      const fallo = comoError(e)
      if (fallo.codigo === 'ya_existe' && yaIntento.current) {
        setGuardando(false)
        alCerrar(true)
        return
      }
      if (fallo.codigo === null) yaIntento.current = true
      setError(fallo)
      setGuardando(false)
    }
  }

  return { error, guardar }
}
