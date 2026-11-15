// Ported from Recurrencia (Moxen, moxen.cl/recursos/recurrencia), used under the Moxen resource licence.
import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { Cifra } from './Cifra'
import { textoAmPm } from './recurrencia'

export interface Hora {
  /** 1..12 on the dial. */
  h: number
  min: number
  pm: boolean
}

const quieto = () => typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches
const dos = (n: number) => String(n).padStart(2, '0')
/** A firm spring, so the hands keep up with the finger. */
const RIGIDEZ = 420
const AMORTIGUA = 30
const R = 80
const marcas = Array.from({ length: 60 }, (_, i) => {
  const a = (i * 6 * Math.PI) / 180
  const r1 = i % 5 === 0 ? 70 : 74
  return { i, x1: Math.sin(a) * r1, y1: -Math.cos(a) * r1, x2: Math.sin(a) * R, y2: -Math.cos(a) * R }
})

/** The shortest way from [desde] to [deg], never a full turn. */
const corto = (desde: number, deg: number) => desde + ((((deg - desde) % 360) + 540) % 360) - 180

function cunaDe(angulo: number): string {
  const a = ((angulo % 360) + 360) % 360
  if (a < 0.6) return ''
  const rad = (a * Math.PI) / 180
  return `M0 0 L0 ${-R} A${R} ${R} 0 ${a > 180 ? 1 : 0} 1 ${(Math.sin(rad) * R).toFixed(2)} ${(-Math.cos(rad) * R).toFixed(2)} Z`
}

/**
 * The reminder time on a two-hand clock: drag the hand nearest the
 * pointer (hours snap to the hour, minutes to five), or use the keyboard,
 * where each hand is a slider. The minute hand paints a wedge. The hands
 * move on a spring; under reduced motion they jump.
 */
export function RelojDeAviso({ valor, alCambiar }: { valor: Hora; alCambiar: (h: Hora) => void }) {
  const dial = useRef<SVGSVGElement>(null)
  const manH = useRef<SVGGElement>(null)
  const manM = useRef<SVGGElement>(null)
  const cuna = useRef<SVGPathElement>(null)
  const angH = (valor.h % 12) * 30 + valor.min * 0.5
  const angM = valor.min * 6
  const resorte = useRef({ h: { x: angH, v: 0, meta: angH }, m: { x: angM, v: 0, meta: angM } })
  const animacion = useRef(0)
  const agarra = useRef<'h' | 'm' | null>(null)
  const actual = useRef(valor)
  actual.current = valor

  useEffect(() => {
    const s = resorte.current
    const pinta = () => {
      manH.current?.setAttribute('transform', `rotate(${s.h.x.toFixed(2)})`)
      manM.current?.setAttribute('transform', `rotate(${s.m.x.toFixed(2)})`)
      cuna.current?.setAttribute('d', cunaDe(s.m.x))
    }
    s.h.meta = corto(s.h.x, angH)
    s.m.meta = corto(s.m.x, angM)
    if (quieto()) {
      s.h.x = s.h.meta
      s.m.x = s.m.meta
      pinta()
      return
    }
    let ultimo = 0
    const paso = (ts: number) => {
      const dt = ultimo ? Math.min(0.05, (ts - ultimo) / 1000) : 1 / 60
      ultimo = ts
      let quietos = true
      for (const r of [s.h, s.m]) {
        r.v += (RIGIDEZ * (r.meta - r.x) - AMORTIGUA * r.v) * dt
        r.x += r.v * dt
        if (Math.abs(r.v) > 0.02 || Math.abs(r.meta - r.x) > 0.02) quietos = false
      }
      if (quietos) {
        s.h.x = s.h.meta
        s.m.x = s.m.meta
        s.h.v = s.m.v = 0
        pinta()
        animacion.current = 0
        return
      }
      pinta()
      animacion.current = requestAnimationFrame(paso)
    }
    cancelAnimationFrame(animacion.current)
    animacion.current = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(animacion.current)
  }, [angH, angM])

  const cambia = (p: Partial<Hora>) => {
    const n = { ...actual.current, ...p }
    if (n.h !== actual.current.h || n.min !== actual.current.min || n.pm !== actual.current.pm) alCambiar(n)
  }
  const enDial = (e: PointerEvent) => {
    const r = dial.current!.getBoundingClientRect()
    const k = 180 / (r.width || 180)
    return { x: (e.clientX - r.left - r.width / 2) * k, y: (e.clientY - r.top - r.height / 2) * k }
  }
  const sigue = (e: PointerEvent) => {
    const p = enDial(e)
    let ang = (Math.atan2(p.x, -p.y) * 180) / Math.PI
    if (ang < 0) ang += 360
    if (agarra.current === 'h') cambia({ h: Math.round(ang / 30) % 12 || 12 })
    else cambia({ min: (Math.round(ang / 30) * 5) % 60 })
  }
  const punta = (a: number, r: number) => ({ x: Math.sin((a * Math.PI) / 180) * r, y: -Math.cos((a * Math.PI) / 180) * r })
  const alApretar = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button) return
    const p = enDial(e)
    const th = punta(resorte.current.h.meta, 42)
    const tm = punta(resorte.current.m.meta, 64)
    const dh = Math.hypot(p.x - th.x, p.y - th.y)
    const dm = Math.hypot(p.x - tm.x, p.y - tm.y)
    agarra.current = Math.hypot(p.x, p.y) < 30 || dh < dm * 0.9 ? 'h' : 'm'
    dial.current?.setPointerCapture?.(e.pointerId)
    dial.current?.classList.add('arrastrando')
    sigue(e)
    e.preventDefault()
  }
  const suelta = () => {
    agarra.current = null
    dial.current?.classList.remove('arrastrando')
  }

  const teclaHora = (e: KeyboardEvent) => {
    const d = ({ ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 3, PageDown: -3 } as Record<string, number>)[e.key]
    let h: number
    if (d) h = ((((valor.h - 1 + d) % 12) + 12) % 12) + 1
    else if (e.key === 'Home') h = 1
    else if (e.key === 'End') h = 12
    else return
    e.preventDefault()
    cambia({ h })
  }
  const teclaMin = (e: KeyboardEvent) => {
    const d = ({ ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5, PageUp: 15, PageDown: -15 } as Record<string, number>)[e.key]
    let min: number
    if (d) min = (((valor.min + d) % 60) + 60) % 60
    else if (e.key === 'Home') min = 0
    else if (e.key === 'End') min = 55
    else return
    e.preventDefault()
    cambia({ min })
  }

  const ampm = textoAmPm(valor.pm)
  return (
    <div className="rc-hora">
      <svg
        ref={dial}
        className="rc-dial"
        viewBox="-90 -90 180 180"
        aria-label="Reloj de la hora del aviso"
        onPointerDown={alApretar}
        onPointerMove={(e) => agarra.current && sigue(e)}
        onPointerUp={suelta}
        onPointerCancel={suelta}
      >
        <circle className="rc-cara" r="86" />
        <g className="rc-marcas" aria-hidden="true">
          {marcas.map((m) => (
            <line
              key={m.i}
              x1={m.x1.toFixed(2)}
              y1={m.y1.toFixed(2)}
              x2={m.x2.toFixed(2)}
              y2={m.y2.toFixed(2)}
              className={`${m.i % 5 === 0 ? 'es-hora' : ''} ${m.i === (valor.h % 12) * 5 || m.i === valor.min ? 'es-tic' : ''}`}
            />
          ))}
        </g>
        <path ref={cuna} className="rc-cuna" />
        <g
          ref={manH}
          className="rc-man rc-man-h"
          tabIndex={0}
          role="slider"
          aria-label="Hora"
          aria-valuemin={1}
          aria-valuemax={12}
          aria-valuenow={valor.h}
          aria-valuetext={`${valor.h} ${ampm}`}
          onKeyDown={teclaHora}
        >
          <line y1="6" y2="-42" />
          <circle className="rc-asa" cy="-42" r="10" />
        </g>
        <g
          ref={manM}
          className="rc-man rc-man-m"
          tabIndex={0}
          role="slider"
          aria-label="Minutos"
          aria-valuemin={0}
          aria-valuemax={59}
          aria-valuenow={valor.min}
          aria-valuetext={`${valor.min} minutos`}
          onKeyDown={teclaMin}
        >
          <line y1="8" y2="-64" />
          <circle className="rc-asa" cy="-64" r="8" />
        </g>
        <circle className="rc-eje" r="5.5" />
      </svg>
      <div className="rc-lectura">
        <p className="rc-cap">Hora del aviso</p>
        <p className="rc-digital num" aria-label={`Hora del aviso: ${valor.h}:${dos(valor.min)} ${ampm}`}>
          <Cifra texto={`${valor.h}:${dos(valor.min)}`} />
        </p>
        <div
          className="rc-ampm"
          role="radiogroup"
          aria-label="Mañana o tarde"
          style={{ ['--i' as string]: valor.pm ? 1 : 0 }}
          onKeyDown={(e) => {
            if (!/^Arrow/.test(e.key)) return
            e.preventDefault()
            const botones = e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')
            cambia({ pm: !valor.pm })
            botones[valor.pm ? 0 : 1]?.focus()
          }}
        >
          <i className="rc-bub" aria-hidden="true" />
          {[false, true].map((pm) => (
            <button
              key={String(pm)}
              type="button"
              role="radio"
              aria-checked={valor.pm === pm}
              tabIndex={valor.pm === pm ? 0 : -1}
              onClick={() => cambia({ pm })}
            >
              {textoAmPm(pm)}
            </button>
          ))}
        </div>
        <p className="rc-pista">Arrastra las manecillas</p>
      </div>
    </div>
  )
}
