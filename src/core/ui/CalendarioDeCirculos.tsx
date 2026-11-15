// Ported from Vencimientos (Moxen, moxen.cl/recursos/vencimientos), used under the Moxen resource licence.
import { diasDelMes, huecoInicial } from './rejillaDelMes'

/** A circle on a day: its size and color come from the page. */
export interface Circulo {
  /** Unique; [encendido] names it. */
  id: string
  /** Day of the month, 1–31; ignored in [sinFecha]. */
  dia: number
  /** Diameter in pixels. */
  tamano: number
  /** Any CSS color, ideally a project token. */
  color: string
  /** Filled, outlined (done) or dashed (date unknown). */
  estilo: 'lleno' | 'hueco' | 'rayado'
  /** What a screen reader and the tooltip say. */
  etiqueta: string
}

const DIAS_DE_LA_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/**
 * A month as a Monday-first grid with one circle per item on its day.
 * Hovering or focusing a circle calls [alEncender] with its id, and the
 * page lights its own row. Under reduced motion circles do not scale (CSS).
 */
export function CalendarioDeCirculos({
  mes,
  hoy,
  festivos,
  circulos,
  sinFecha = [],
  textoSinFecha = 'Sin fecha',
  encendido,
  alEncender,
  etiqueta,
}: {
  /** `YYYY-MM`. */
  mes: string
  /** Today's day in this month, outlined; none for other months. */
  hoy?: number
  /** Day → name, marked and titled. */
  festivos?: Map<number, string>
  circulos: Circulo[]
  /** Circles with no day, shown in a row below the grid. */
  sinFecha?: Circulo[]
  textoSinFecha?: string
  encendido?: string | null
  alEncender?: (id: string | null) => void
  etiqueta: string
}) {
  const bola = (c: Circulo) => (
    <button
      key={c.id}
      type="button"
      className={`bola bola-${c.estilo} ${encendido === c.id ? 'encendida' : ''}`}
      style={{ ['--s' as string]: `${c.tamano}px`, ['--c' as string]: c.color }}
      aria-label={c.etiqueta}
      title={c.etiqueta}
      onMouseEnter={() => alEncender?.(c.id)}
      onMouseLeave={() => alEncender?.(null)}
      onFocus={() => alEncender?.(c.id)}
      onBlur={() => alEncender?.(null)}
    />
  )
  const porDia = new Map<number, Circulo[]>()
  for (const c of circulos) porDia.set(c.dia, [...(porDia.get(c.dia) ?? []), c])

  return (
    <div className="calendario-circulos">
      <div className="cal-rejilla" role="group" aria-label={etiqueta}>
        {DIAS_DE_LA_SEMANA.map((d, i) => (
          <span key={i} className="cal-dsem" aria-hidden="true">
            {d}
          </span>
        ))}
        {Array.from({ length: huecoInicial(mes) }, (_, i) => (
          <span key={`v${i}`} className="cal-dia vacio" aria-hidden="true" />
        ))}
        {Array.from({ length: diasDelMes(mes) }, (_, i) => {
          const dia = i + 1
          const festivo = festivos?.get(dia)
          const clases = ['cal-dia', dia === hoy && 'hoy', hoy !== undefined && dia < hoy && 'pasado', festivo && 'festivo']
          return (
            <div key={dia} className={clases.filter(Boolean).join(' ')} data-dia={dia} title={festivo}>
              <span className="cal-num">{dia}</span>
              <span className="cal-bolas">{(porDia.get(dia) ?? []).map(bola)}</span>
            </div>
          )
        })}
      </div>
      {sinFecha.length > 0 && (
        <div className="cal-sin-fecha" data-sin-fecha>
          <span className="apagado">{textoSinFecha}</span>
          {sinFecha.map(bola)}
        </div>
      )}
    </div>
  )
}

/**
 * How much falls in each week of the month, as bars; the heaviest one is
 * dark. A small floor keeps an empty week visible, as in Vencimientos.
 */
export function BarraDeSemanas({ totales, mayor, pie }: { totales: number[]; mayor: number; pie: string }) {
  const suma = totales.reduce((a, b) => a + b, 0)
  return (
    <div className="cal-semanas-caja">
      <div className="cal-semanas" aria-hidden="true">
        {totales.map((t, i) => (
          <span
            key={i}
            className={i === mayor ? 'cargada' : undefined}
            style={{ height: `${suma > 0 ? Math.max(8, Math.round((100 * t) / Math.max(...totales))) : 8}%` }}
          />
        ))}
      </div>
      <p className="cal-semanas-pie">{pie}</p>
    </div>
  )
}
