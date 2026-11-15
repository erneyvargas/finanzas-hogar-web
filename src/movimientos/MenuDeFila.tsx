import { useEffect, useRef, useState } from 'react'

/**
 * The ⋮ button at the end of a movement row and its small menu:
 * Duplicar, and Borrar with a confirmation inside the menu. Escape or a
 * click outside closes it; a rejected delete shows its reason and stays.
 */
export function MenuDeFila({
  titulo,
  alDuplicar,
  alBorrar,
}: {
  /** The row's title, to name the button for screen readers. */
  titulo: string
  alDuplicar: () => void
  alBorrar: () => Promise<void>
}) {
  const [abierto, setAbierto] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)

  const cerrar = (devolverFoco: boolean) => {
    setAbierto(false)
    setConfirmando(false)
    setError(null)
    if (devolverFoco) boton.current?.focus()
  }

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) cerrar(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !borrando) cerrar(true)
    }
    document.addEventListener('mousedown', fuera)
    window.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera)
      window.removeEventListener('keydown', tecla)
    }
  }, [abierto, borrando])

  // The first item takes the focus when the menu opens.
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (abierto) menu.current?.querySelector<HTMLElement>('button')?.focus()
  }, [abierto, confirmando])

  const borrar = async () => {
    setBorrando(true)
    setError(null)
    try {
      await alBorrar()
      cerrar(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar.')
    } finally {
      setBorrando(false)
    }
  }

  return (
    <div ref={raiz} className="menu-de-fila">
      <button
        ref={boton}
        type="button"
        className="mas-acciones"
        aria-label={`Más acciones de ${titulo}`}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => (abierto ? cerrar(false) : setAbierto(true))}
      >
        <span aria-hidden="true">⋮</span>
      </button>
      {abierto && (
        <div ref={menu} role="menu" aria-label={`Acciones de ${titulo}`} className="menu-flotante">
          {confirmando ? (
            <div className="menu-confirmar">
              <p>¿Borrar este movimiento?</p>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <div className="menu-botones">
                <button type="button" className="peligro" disabled={borrando} onClick={() => void borrar()}>
                  Sí, borrar
                </button>
                <button type="button" className="secundario" disabled={borrando} onClick={() => cerrar(true)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  cerrar(false)
                  alDuplicar()
                }}
              >
                Duplicar
              </button>
              <button type="button" role="menuitem" className="borrar" onClick={() => setConfirmando(true)}>
                Borrar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
