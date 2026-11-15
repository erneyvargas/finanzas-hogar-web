import { useState } from 'react'

/**
 * A text field that offers what the household already wrote: the list
 * shows under it while typing; ↓/↑ move, Enter or a click takes one,
 * Escape hides the list without leaving the field (or closing the panel).
 */
export function CampoConSugerencias({
  id,
  valor,
  alCambiar,
  sugerencias,
  nombreDeLista,
  placeholder,
  disabled,
  title,
}: {
  id: string
  valor: string
  alCambiar: (v: string) => void
  /** Already filtered for what is typed. */
  sugerencias: string[]
  nombreDeLista: string
  placeholder?: string
  disabled?: boolean
  title?: string
}) {
  const [abierta, setAbierta] = useState(false)
  const [activa, setActiva] = useState(-1)
  const visibles = abierta && !disabled ? sugerencias : []
  const lista = `${id}-sugerencias`
  const elegir = (texto: string) => {
    alCambiar(texto)
    setAbierta(false)
    setActiva(-1)
  }

  return (
    <div className="con-sugerencias">
      <input
        id={id}
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        title={title}
        role="combobox"
        aria-expanded={visibles.length > 0}
        aria-controls={lista}
        aria-autocomplete="list"
        aria-activedescendant={activa >= 0 && visibles[activa] ? `${lista}-${activa}` : undefined}
        value={valor}
        onChange={(e) => {
          alCambiar(e.target.value)
          setAbierta(true)
          setActiva(-1)
        }}
        onBlur={() => setAbierta(false)}
        onKeyDown={(e) => {
          if (visibles.length === 0) return
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            const paso = e.key === 'ArrowDown' ? 1 : -1
            setActiva((a) => (a + paso + visibles.length) % visibles.length)
          } else if (e.key === 'Enter' && activa >= 0) {
            e.preventDefault()
            elegir(visibles[activa])
          } else if (e.key === 'Escape') {
            e.stopPropagation()
            setAbierta(false)
          }
        }}
      />
      {visibles.length > 0 && (
        <ul id={lista} className="sugerencias" role="listbox" aria-label={nombreDeLista}>
          {visibles.map((s, i) => (
            <li
              key={s}
              id={`${lista}-${i}`}
              role="option"
              aria-selected={i === activa}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(s)}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
