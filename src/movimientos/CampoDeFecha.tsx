import { useEffect, useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { es } from 'react-day-picker/locale'
import 'react-day-picker/style.css'
import { MESES } from '../core/formato'

/** `YYYY-MM-DD` as a local date, and back. */
const aFecha = (dia: string) => {
  const [a, m, d] = dia.split('-').map(Number)
  return new Date(a, m - 1, d)
}
const aDia = (f: Date) =>
  `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`

/** `25 oct 2026`, and `Hoy, 28 oct 2026` for today. */
function textoDeLaFecha(dia: string, hoy: string) {
  const [a, m, d] = dia.split('-').map(Number)
  const texto = `${d} ${MESES[m - 1].slice(0, 3)} ${a}`
  return dia === hoy ? `Hoy, ${texto}` : texto
}

/**
 * The movement's date: a button with the day that opens a month calendar
 * (react-day-picker, in Spanish, Monday first) right under it. Picking a
 * day closes it; Escape or a click outside closes it without changing it.
 */
export function CampoDeFecha({
  id,
  dia,
  hoy,
  alCambiar,
}: {
  id: string
  dia: string
  hoy: string
  alCambiar: (dia: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const cerrar = () => {
    setAbierto(false)
    boton.current?.focus()
  }

  return (
    <div
      ref={raiz}
      className="campo-de-fecha"
      onKeyDown={(e) => {
        // Escape closes the calendar, not the whole panel.
        if (e.key === 'Escape' && abierto) {
          e.stopPropagation()
          cerrar()
        }
      }}
    >
      <button
        id={id}
        ref={boton}
        type="button"
        className="fecha-elegida"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => setAbierto(!abierto)}
      >
        <span>{textoDeLaFecha(dia, hoy)}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {abierto && (
        <div className="calendario-flotante">
          <DayPicker
            mode="single"
            locale={es}
            weekStartsOn={1}
            required
            selected={aFecha(dia)}
            defaultMonth={aFecha(dia)}
            today={aFecha(hoy)}
            autoFocus
            onSelect={(f) => {
              if (f) alCambiar(aDia(f))
              cerrar()
            }}
          />
        </div>
      )}
    </div>
  )
}
