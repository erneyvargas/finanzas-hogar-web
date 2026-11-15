import { useEffect, useRef, useState } from 'react'
import type { EnlaceDeFactura } from './reglas'

/**
 * Shows the receipt attached to a movement (Ver factura in the row menu):
 * the photo or the PDF, plus a link to open it in another tab. Escape,
 * the ✕ or a click on the veil closes it.
 */
export function VisorDeFactura({
  titulo,
  cargar,
  alCerrar,
}: {
  /** The movement's title, to name the dialog. */
  titulo: string
  cargar: () => Promise<EnlaceDeFactura>
  alCerrar: () => void
}) {
  const [enlace, setEnlace] = useState<EnlaceDeFactura | null>(null)
  const [fallo, setFallo] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const cerrarRef = useRef(alCerrar)
  cerrarRef.current = alCerrar
  const cargarRef = useRef(cargar)

  useEffect(() => {
    let vivo = true
    cargarRef.current().then(
      (e) => vivo && setEnlace(e),
      () => vivo && setFallo(true),
    )
    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => {
    raiz.current?.focus()
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrarRef.current()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  const nombre = `Factura de ${titulo}`
  return (
    <div className="velo" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <div ref={raiz} className="factura visor-de-factura" role="dialog" aria-modal="true" aria-label={nombre} tabIndex={-1}>
        <div className="factura-cabeza">
          <h2>{nombre}</h2>
          <button className="flecha" aria-label="Cerrar" onClick={alCerrar}>
            ✕
          </button>
        </div>
        <div className="mesa">
          {fallo ? (
            <p role="alert" className="aviso-en-mesa">
              No se pudo abrir la factura. Intenta de nuevo.
            </p>
          ) : !enlace ? (
            <p role="status" className="aviso-en-mesa">
              Abriendo la factura…
            </p>
          ) : enlace.pdf ? (
            <object data={enlace.url} type="application/pdf" aria-label="La factura en PDF">
              <a href={enlace.url} target="_blank" rel="noreferrer">
                Abrir el PDF
              </a>
            </object>
          ) : (
            <img src={enlace.url} alt="La foto de la factura" />
          )}
        </div>
        {enlace && (
          <div className="factura-pie">
            <a className="empujar" href={enlace.url} target="_blank" rel="noreferrer">
              Abrir en otra pestaña
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
