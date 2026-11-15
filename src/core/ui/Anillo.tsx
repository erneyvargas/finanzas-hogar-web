// Ported from Gastos (Moxen, moxen.cl/recursos/gastos), used under the Moxen resource licence.
import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface ParteDelAnillo {
  id: string
  valor: number
  /** Any CSS color; the page passes its own tokens. */
  color: string
  nombre: string
}

/** Sizes in units of the 340 drawing. */
const R = 128
const GROSOR = 30
const HUECO = 13
const SEPARA = 15
const RESALTA = 7
const TAU = Math.PI * 2

interface Resorte {
  x: number
  v: number
  meta: number
  k: number
  c: number
}
const resorte = (x: number, k: number, c: number): Resorte => ({ x, v: 0, meta: x, k, c })
const avanza = (r: Resorte, h: number) => {
  r.v += (r.k * (r.meta - r.x) - r.c * r.v) * h
  r.x += r.v * h
}
const quieto = (r: Resorte) => Math.abs(r.v) < 0.0008 && Math.abs(r.meta - r.x) < 0.0008

interface Arco {
  ini: Resorte
  lar: Resorte
  sep: Resorte
  gro: Resorte
  op: Resorte
  /** When its length may start growing (ms, rAF clock); 0 = now. */
  desde: number
  meta: number
}
const nuevoArco = (): Arco => ({
  ini: resorte(0, 90, 14),
  lar: resorte(0, 90, 14),
  sep: resorte(0, 320, 17),
  gro: resorte(0, 280, 19),
  op: resorte(1, 170, 24),
  desde: 0,
  meta: 0,
})

const sinMovimiento = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A ring of rounded segments with a gap between them. Each segment's
 * start, length, offset, thickness and opacity run on springs; the chosen
 * one moves out and the rest dim. When [clave] changes (a new month) the
 * segments grow one after another. Under reduced motion it just jumps.
 * The ring is a picture: the page offers the same choices as real controls.
 */
export function Anillo({
  partes,
  elegido,
  alElegir,
  etiqueta,
  clave,
  children,
}: {
  partes: ParteDelAnillo[]
  elegido: string | null
  alElegir: (id: string) => void
  etiqueta: string
  clave?: string
  /** What sits in the middle of the ring. */
  children?: ReactNode
}) {
  const caminos = useRef<(SVGPathElement | null)[]>([])
  const arcos = useRef<Arco[]>([])
  const raf = useRef(0)
  const previo = useRef(0)
  const claveVista = useRef<string | undefined>(undefined)
  const [sobre, setSobre] = useState<string | null>(null)

  const dibujar = () => {
    arcos.current.forEach((a, i) => {
      const p = caminos.current[i]
      if (!p) return
      const largo = a.lar.x
      if (largo < 0.0015) {
        p.setAttribute('d', '')
        return
      }
      const t0 = a.ini.x * TAU - Math.PI / 2
      const t1 = (a.ini.x + largo) * TAU - Math.PI / 2
      const sw = GROSOR + a.gro.x
      const cap = sw / 2 / R
      const s = t0 + HUECO / R / 2 + cap
      const e = Math.max(s, t1 - HUECO / R / 2 - cap)
      const mid = (t0 + t1) / 2
      const dx = Math.cos(mid) * a.sep.x
      const dy = Math.sin(mid) * a.sep.x
      const punto = (t: number) => `${(Math.cos(t) * R + dx).toFixed(2)} ${(Math.sin(t) * R + dy).toFixed(2)}`
      p.setAttribute('d', `M${punto(s)}A${R} ${R} 0 ${e - s > Math.PI ? 1 : 0} 1 ${punto(e)}`)
      p.style.strokeWidth = sw.toFixed(2)
      p.style.opacity = Math.max(0, Math.min(1, a.op.x)).toFixed(3)
    })
  }

  const resortes = () => arcos.current.flatMap((a) => [a.ini, a.lar, a.sep, a.gro, a.op])
  const saltar = () => {
    arcos.current.forEach((a) => {
      a.lar.meta = a.meta
      a.desde = 0
    })
    resortes().forEach((r) => {
      r.x = r.meta
      r.v = 0
    })
    dibujar()
  }
  const cuadro = (ms: number) => {
    raf.current = 0
    const dt = previo.current ? Math.min(0.1, (ms - previo.current) / 1000) : 0
    previo.current = ms
    let esperan = false
    for (const a of arcos.current) {
      if (a.desde && ms < a.desde) esperan = true
      else a.lar.meta = a.meta
    }
    const paso = 1 / 120
    for (let t = 0; t < dt; t += paso) resortes().forEach((r) => avanza(r, paso))
    dibujar()
    if (esperan || !resortes().every(quieto)) raf.current = requestAnimationFrame(cuadro)
  }
  const despertar = () => {
    if (sinMovimiento()) return saltar()
    if (!raf.current) {
      previo.current = 0
      raf.current = requestAnimationFrame(cuadro)
    }
  }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  // New sizes: each segment springs to them; a new [clave] grows them in turn.
  const total = partes.reduce((s, p) => s + p.valor, 0) || 1
  const firma = partes.map((p) => `${p.id}:${p.valor}`).join('|')
  useEffect(() => {
    const crecer = claveVista.current !== clave
    claveVista.current = clave
    while (arcos.current.length < partes.length) arcos.current.push(nuevoArco())
    arcos.current.length = partes.length
    const ahora = performance.now()
    let acumulado = 0
    partes.forEach((p, i) => {
      const a = arcos.current[i]
      a.ini.meta = acumulado
      a.meta = p.valor / total
      acumulado += a.meta
      if (crecer) {
        a.ini.x = a.ini.meta
        a.lar.x = 0
        a.lar.v = 0
        a.desde = ahora + 90 + i * 75
      } else {
        a.desde = 0
      }
    })
    despertar()
    // The signature stands for the parts; the functions only read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, clave])

  // Chosen and hovered segments move out; the rest dim while one is chosen.
  useEffect(() => {
    partes.forEach((p, i) => {
      const a = arcos.current[i]
      if (!a) return
      a.sep.meta = p.id === elegido ? SEPARA : p.id === sobre ? 5 : 0
      a.gro.meta = p.id === elegido ? RESALTA : p.id === sobre ? 2.5 : 0
      a.op.meta = elegido !== null && p.id !== elegido ? 0.26 : 1
    })
    despertar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegido, sobre, firma])

  return (
    <div className="anillo">
      <svg viewBox="-170 -170 340 340" role="img" aria-label={etiqueta}>
        <circle className="anillo-pista" r={R} />
        <g className="anillo-segmentos">
          {partes.map((p, i) => (
            <path
              key={p.id}
              ref={(el) => {
                caminos.current[i] = el
              }}
              className="anillo-seg"
              style={{ stroke: p.color }}
              data-elegido={p.id === elegido || undefined}
              onClick={() => alElegir(p.id)}
              onPointerEnter={() => setSobre(p.id)}
              onPointerLeave={() => setSobre((s) => (s === p.id ? null : s))}
            >
              <title>{p.nombre}</title>
            </path>
          ))}
        </g>
      </svg>
      <div className="anillo-centro">{children}</div>
    </div>
  )
}
