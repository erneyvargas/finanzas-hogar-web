// Ported from Gastos (Moxen, moxen.cl/recursos/gastos), used under the Moxen resource licence.
import { useEffect, useState } from 'react'

/**
 * A figure that rolls like an odometer: each digit is a column with a
 * 0–9 strip that slides to its digit, the rightmost first. Screen readers
 * read the plain text. Under reduced motion the strips jump (CSS).
 */
export function Cifra({ texto, className = '' }: { texto: string; className?: string }) {
  // The first paint starts at zero so the digits roll in.
  const [listo, setListo] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setListo(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const [, prefijo, resto] = /^(\D*)([\s\S]*)$/.exec(texto) ?? ['', '', texto]
  const caracteres = Array.from(resto)
  return (
    <span className={`cifra ${className}`}>
      <span className="sk-sr">{texto}</span>
      <span className="cifra-dibujo" aria-hidden="true">
        {prefijo && <span className="cifra-pre">{prefijo}</span>}
        {caracteres.map((ch, i) => {
          // Keyed from the right, so a column keeps its place when the figure grows.
          const desdeLaDerecha = caracteres.length - 1 - i
          return /\d/.test(ch) ? (
            <span key={`d${desdeLaDerecha}`} className="cifra-col">
              <span
                className="cifra-tira"
                style={{ ['--d' as string]: listo ? ch : '0', ['--i' as string]: desdeLaDerecha }}
              >
                0<br />1<br />2<br />3<br />4<br />5<br />6<br />7<br />8<br />9
              </span>
            </span>
          ) : (
            <span key={`s${desdeLaDerecha}`} className="cifra-sep">
              {ch}
            </span>
          )
        })}
      </span>
    </span>
  )
}
