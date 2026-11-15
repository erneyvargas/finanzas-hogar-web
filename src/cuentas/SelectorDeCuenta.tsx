import { useId, useRef, useState } from 'react'
import { Cara } from '../movimientos/ListaDeMovimientos'
import { plano } from '../movimientos/filtros'

export interface OpcionDeCuenta {
  id: string
  nombre: string
  foto?: string | null
  /** Shown on the right, such as the balance. */
  detalle: string
  /** Why it cannot be chosen; the option shows it disabled. */
  motivo?: string
}

/**
 * An account picker: a button with the chosen account (photo or
 * initials, name, balance) that opens a searchable list. The search
 * ignores case and accents; ↑/↓ move, Enter picks, Escape closes.
 */
export function SelectorDeCuenta({
  etiqueta,
  opciones,
  valor,
  alElegir,
  vacio = 'Elige una cuenta',
}: {
  etiqueta: string
  opciones: OpcionDeCuenta[]
  valor: string
  alElegir: (id: string) => void
  vacio?: string
}) {
  const base = useId()
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [activa, setActiva] = useState(-1)
  const boton = useRef<HTMLButtonElement>(null)
  const elegida = opciones.find((o) => o.id === valor)
  const q = plano(busqueda.trim())
  const visibles = q ? opciones.filter((o) => plano(o.nombre).includes(q)) : opciones
  const idDe = (o: OpcionDeCuenta) => `${base}-op-${o.id}`

  const abrir = () => {
    setBusqueda('')
    setActiva(opciones.findIndex((o) => o.id === valor))
    setAbierto(true)
  }
  const cerrar = () => {
    setAbierto(false)
    boton.current?.focus()
  }
  const elegir = (o: OpcionDeCuenta | undefined) => {
    if (!o || o.motivo) return
    alElegir(o.id)
    cerrar()
  }
  /** The next choosable option from [desde] going [paso]; stays put at the ends. */
  const mover = (paso: 1 | -1) => {
    for (let i = activa + paso; i >= 0 && i < visibles.length; i += paso) {
      if (!visibles[i].motivo) return setActiva(i)
    }
  }

  return (
    <div className="selector-cuenta">
      <span id={`${base}-etq`} className="etiqueta">
        {etiqueta}
      </span>
      <button
        ref={boton}
        id={`${base}-boton`}
        type="button"
        className="selector-cuenta-boton"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-labelledby={`${base}-etq ${base}-boton`}
        onClick={() => (abierto ? cerrar() : abrir())}
      >
        {elegida ? (
          <>
            <Cara nombre={elegida.nombre} foto={elegida.foto} />
            <span className="nombre">{elegida.nombre}</span>
            <span className="detalle num">{elegida.detalle}</span>
          </>
        ) : (
          <span className="apagado">{vacio}</span>
        )}
      </button>
      {abierto && (
        <div className="selector-cuenta-lista">
          <input
            role="combobox"
            aria-label="Buscar cuenta"
            aria-expanded="true"
            aria-controls={`${base}-lista`}
            aria-activedescendant={visibles[activa] ? idDe(visibles[activa]) : undefined}
            autoFocus
            autoComplete="off"
            placeholder="Buscar…"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value)
              setActiva(-1)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                mover(e.key === 'ArrowDown' ? 1 : -1)
              } else if (e.key === 'Enter') {
                e.preventDefault()
                elegir(visibles[activa])
              } else if (e.key === 'Escape') {
                // The panel closes on Escape too; this one only closes the list.
                e.stopPropagation()
                e.nativeEvent.stopImmediatePropagation()
                cerrar()
              }
            }}
          />
          <ul id={`${base}-lista`} role="listbox" aria-label={etiqueta}>
            {visibles.map((o, i) => (
              <li
                key={o.id}
                id={idDe(o)}
                role="option"
                aria-selected={o.id === valor}
                aria-disabled={o.motivo ? true : undefined}
                className={i === activa ? 'activa' : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(o)}
              >
                <Cara nombre={o.nombre} foto={o.foto} />
                <span className="nombre">{o.nombre}</span>
                <span className="detalle num">{o.motivo ?? o.detalle}</span>
              </li>
            ))}
            {visibles.length === 0 && <li className="apagado">Ninguna cuenta coincide.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
