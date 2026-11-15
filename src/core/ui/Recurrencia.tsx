// Ported from Recurrencia (Moxen, moxen.cl/recursos/recurrencia), used under the Moxen resource licence.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent } from 'react'
import { Cifra } from './Cifra'
import { RelojDeAviso } from './RelojDeAviso'
import {
  ATAJOS,
  DIAS,
  MESES_LARGOS,
  ORDINALES,
  cronDe,
  fraseDe,
  relativo,
  textoAmPm,
  textoDeFrase,
  textoDeHora,
  type FrecuenciaDeRecurrencia,
  type Frase,
  type Recurrencia as Valor,
} from './recurrencia'

const quieto = () => typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches
const FRECUENCIAS: { id: FrecuenciaDeRecurrencia; nombre: string }[] = [
  { id: 'diaria', nombre: 'Diaria' },
  { id: 'semanal', nombre: 'Semanal' },
  { id: 'mensual', nombre: 'Mensual' },
  { id: 'anual', nombre: 'Anual' },
]
const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const ETIQUETAS_CRON = ['min', 'hora', 'día', 'mes', 'sem']
const conMayuscula = (t: string) => `${t[0].toUpperCase()}${t.slice(1)}`
/** Days of a month (0-based), counted in a leap year so «29 de febrero» can be chosen. */
const diasDelMes = (m: number) => new Date(Date.UTC(2028, m + 1, 0)).getUTCDate()

/**
 * Edits how something repeats (Moxen «Recurrencia»): a frequency switch,
 * each frequency's own controls (day pills and shortcuts, «el primer
 * lunes» wheels, day steppers, months), the reminder clock, a sentence
 * that rewrites itself letter by letter, the cron chip, and a calendar
 * that lights [fechas] in a wave beside the next five. Controlled:
 * [alCambiar] gets every change; the page computes [fechas] (`YYYY-MM-DD`,
 * in order) for its own rule. Every animation has an instant path under
 * reduced motion.
 */
export function Recurrencia({
  valor,
  alCambiar,
  fechas,
  hoy,
}: {
  valor: Valor
  alCambiar: (v: Valor) => void
  fechas: string[]
  /** `YYYY-MM-DD`. */
  hoy: string
}) {
  const cambia = (p: Partial<Valor>) => alCambiar({ ...valor, ...p })
  return (
    <div className="recurrencia">
      <div className="rc-izq">
        <Conmutador valor={valor.freq} alElegir={(freq) => freq !== valor.freq && cambia({ freq })} />
        <div className="rc-panel">
          {valor.freq === 'diaria' && <Diaria valor={valor} cambia={cambia} />}
          {valor.freq === 'semanal' && <Semanal valor={valor} cambia={cambia} />}
          {valor.freq === 'mensual' && <Mensual valor={valor} cambia={cambia} />}
          {valor.freq === 'anual' && <Anual valor={valor} cambia={cambia} />}
        </div>
        <RelojDeAviso valor={valor} alCambiar={({ h, min, pm }) => cambia({ h, min, pm })} />
      </div>
      <div className="rc-der">
        <FraseQueSeEscribe frase={fraseDe(valor)} />
        <div className="rc-dos">
          <Calendario fechas={fechas} hoy={hoy} />
          <Proximas fechas={fechas.slice(0, 5)} hoy={hoy} hora={`${textoDeHora(valor)}`} ampm={textoAmPm(valor.pm)} />
        </div>
      </div>
      <FichaCron campos={cronDe(valor)} />
    </div>
  )
}

/* ── 1 · the frequency switch: a bubble slides to the chosen one ── */
function Conmutador({ valor, alElegir }: { valor: FrecuenciaDeRecurrencia; alElegir: (f: FrecuenciaDeRecurrencia) => void }) {
  const botones = useRef<(HTMLButtonElement | null)[]>([])
  const i = FRECUENCIAS.findIndex((f) => f.id === valor)
  const tecla = (e: KeyboardEvent) => {
    if (!/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return
    e.preventDefault()
    const j = (i + (/Right|Down/.test(e.key) ? 1 : -1) + FRECUENCIAS.length) % FRECUENCIAS.length
    alElegir(FRECUENCIAS[j].id)
    botones.current[j]?.focus()
  }
  return (
    <div className="rc-seg" role="radiogroup" aria-label="Frecuencia" style={{ ['--i' as string]: i }} onKeyDown={tecla}>
      <i className="rc-bub" aria-hidden="true" />
      {FRECUENCIAS.map((f, k) => (
        <button
          key={f.id}
          ref={(b) => {
            botones.current[k] = b
          }}
          type="button"
          role="radio"
          aria-checked={f.id === valor}
          tabIndex={f.id === valor ? 0 : -1}
          onClick={() => alElegir(f.id)}
        >
          {f.nombre}
        </button>
      ))}
    </div>
  )
}

type Controles = { valor: Valor; cambia: (p: Partial<Valor>) => void }

function Diaria({ valor, cambia }: Controles) {
  return (
    <div className="rc-ctl" role="group" aria-label="Opciones de la repetición diaria">
      <p className="rc-cap">Se avisa estos días</p>
      <div className={`rc-pildoras rc-fija ${valor.sinFin ? 'sin-fin' : ''}`} aria-hidden="true">
        {LETRAS.map((l, w) => (
          <span key={w} className="rc-pil" data-w={w}>
            {l}
          </span>
        ))}
      </div>
      <button type="button" className="rc-sw" role="switch" aria-checked={valor.sinFin} onClick={() => cambia({ sinFin: !valor.sinFin })}>
        <span className="rc-sw-pista" aria-hidden="true">
          <i />
        </span>
        <span>Omitir fines de semana</span>
      </button>
    </div>
  )
}

/* ── 2 · day pills and shortcuts ── */
function Semanal({ valor, cambia }: Controles) {
  const [tope, setTope] = useState<number | null>(null)
  useEffect(() => {
    if (tope === null) return
    const t = window.setTimeout(() => setTope(null), 1800)
    return () => window.clearTimeout(t)
  }, [tope])
  const clave = valor.dias.map(Number).join('')
  const pulsa = (w: number) => {
    if (valor.dias[w] && valor.dias.filter(Boolean).length === 1) {
      setTope((n) => (n === null ? w : n + 7))
      return
    }
    cambia({ dias: valor.dias.map((v, k) => (k === w ? !v : v)) })
  }
  return (
    <div className="rc-ctl" role="group" aria-label="Opciones de la repetición semanal">
      <p className={`rc-cap ${tope !== null ? 'error' : ''}`}>{tope !== null ? 'Deja al menos un día' : 'Días de la semana'}</p>
      <div className="rc-pildoras" role="group" aria-label="Días de la semana">
        {LETRAS.map((l, w) => (
          <button
            key={tope !== null && tope % 7 === w ? `${w}-${tope}` : w}
            type="button"
            className={`rc-pil ${tope !== null && tope % 7 === w ? 'tope' : ''}`}
            aria-pressed={valor.dias[w]}
            aria-label={DIAS[w]}
            onClick={() => pulsa(w)}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="rc-atajos">
        {(
          [
            ['habiles', 'Entre semana'],
            ['finde', 'Fines de semana'],
            ['todos', 'Todos los días'],
          ] as const
        ).map(([k, t]) => (
          <button
            key={k}
            type="button"
            className="rc-atajo"
            aria-pressed={ATAJOS[k].map(Number).join('') === clave}
            onClick={() => cambia({ dias: [...ATAJOS[k]] })}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── 3 · «el primer lunes» wheels and the day steppers ── */
function Rueda({
  etiqueta,
  valores,
  valor,
  texto,
  alCambiar,
}: {
  etiqueta: string
  valores: number[]
  valor: number
  texto: (v: number) => string
  alCambiar: (v: number, dir: number) => void
}) {
  const [dir, setDir] = useState(1)
  const mueve = (d: number) => {
    const i = valores.indexOf(valor)
    setDir(d)
    alCambiar(valores[(((i + d) % valores.length) + valores.length) % valores.length], d)
  }
  return (
    <div
      className="rc-rueda"
      role="spinbutton"
      tabIndex={0}
      aria-label={etiqueta}
      aria-valuenow={valor}
      aria-valuemin={valores[0]}
      aria-valuemax={valores[valores.length - 1]}
      aria-valuetext={texto(valor)}
      onClick={() => mueve(1)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') mueve(-1)
        else if (e.key === 'ArrowDown' || e.key === ' ' || e.key === 'Enter') mueve(1)
        else if (e.key === 'Home') {
          setDir(-1)
          alCambiar(valores[0], -1)
        } else if (e.key === 'End') {
          setDir(1)
          alCambiar(valores[valores.length - 1], 1)
        } else return
        e.preventDefault()
      }}
    >
      <span className="rc-rueda-t" key={valor} data-dir={dir > 0 ? 'abajo' : 'arriba'}>
        {texto(valor)}
      </span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 10l4-3.5 4 3.5M8 14l4 3.5 4-3.5" />
      </svg>
    </div>
  )
}

function Pasos({ valor, maximo, alCambiar }: { valor: number; maximo: number; alCambiar: (v: number) => void }) {
  const boton = (d: number, etiqueta: string, trazo: string) => {
    const fuera = valor + d < 1 || valor + d > maximo
    return (
      <button type="button" aria-label={etiqueta} aria-disabled={fuera} onClick={() => !fuera && alCambiar(valor + d)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={trazo} />
        </svg>
      </button>
    )
  }
  return (
    <div className="rc-paso" role="group" aria-label="Día del mes">
      {boton(-1, 'Un día antes', 'M6 12h12')}
      <span className="rc-n num">
        <Cifra texto={String(valor)} />
      </span>
      {boton(1, 'Un día después', 'M6 12h12M12 6v12')}
    </div>
  )
}

function Mensual({ valor, cambia }: Controles) {
  const nombre = useId()
  return (
    <div className="rc-ctl" role="group" aria-label="Opciones de la repetición mensual">
      <div className="rc-modos" role="radiogroup" aria-label="Qué día del mes">
        <div className={`rc-opcion ${valor.modoMes === 'dia' ? 'elegida' : ''}`}>
          <input type="radio" id={`${nombre}-dia`} name={nombre} checked={valor.modoMes === 'dia'} onChange={() => cambia({ modoMes: 'dia' })} />
          <label htmlFor={`${nombre}-dia`}>El día</label>
          <Pasos valor={valor.diaMes} maximo={31} alCambiar={(diaMes) => cambia({ diaMes, modoMes: 'dia' })} />
        </div>
        <div className={`rc-opcion ${valor.modoMes === 'nth' ? 'elegida' : ''}`}>
          <input type="radio" id={`${nombre}-nth`} name={nombre} checked={valor.modoMes === 'nth'} onChange={() => cambia({ modoMes: 'nth' })} />
          <label htmlFor={`${nombre}-nth`}>El</label>
          <Rueda
            etiqueta="Qué semana del mes"
            valores={[0, 1, 2, 3, 4]}
            valor={valor.ord}
            texto={(v) => ORDINALES[v]}
            alCambiar={(ord) => cambia({ ord, modoMes: 'nth' })}
          />
          <Rueda
            etiqueta="Qué día de la semana"
            valores={[0, 1, 2, 3, 4, 5, 6]}
            valor={valor.diaSem}
            texto={(v) => DIAS[v]}
            alCambiar={(diaSem) => cambia({ diaSem, modoMes: 'nth' })}
          />
        </div>
      </div>
    </div>
  )
}

function Anual({ valor, cambia }: Controles) {
  const botones = useRef<(HTMLButtonElement | null)[]>([])
  const elige = (mes: number) => cambia({ mes, diaAnual: Math.min(valor.diaAnual, diasDelMes(mes)) })
  return (
    <div className="rc-ctl" role="group" aria-label="Opciones de la repetición anual">
      <p className="rc-cap">Mes del año</p>
      <div
        className="rc-meses"
        role="radiogroup"
        aria-label="Mes del año"
        onKeyDown={(e) => {
          const d = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 6, ArrowUp: -6 } as Record<string, number>)[e.key]
          if (!d) return
          e.preventDefault()
          const m = (valor.mes + d + 12) % 12
          elige(m)
          botones.current[m]?.focus()
        }}
      >
        {MESES_LARGOS.map((m, i) => (
          <button
            key={m}
            ref={(b) => {
              botones.current[i] = b
            }}
            type="button"
            role="radio"
            aria-checked={i === valor.mes}
            aria-label={m}
            tabIndex={i === valor.mes ? 0 : -1}
            onClick={() => elige(i)}
          >
            {m.slice(0, 3)}
          </button>
        ))}
      </div>
      <div className="rc-fila">
        <span className="rc-et">El día</span>
        <Pasos valor={valor.diaAnual} maximo={diasDelMes(valor.mes)} alCambiar={(diaAnual) => cambia({ diaAnual })} />
      </div>
    </div>
  )
}

/* ── 5 · the sentence that writes itself: deletes what no longer matches, types the rest ── */
type Letra = { c: string; e: boolean; t: boolean }
const letrasDe = (f: Frase): Letra[] => {
  const cola = f.length - 2
  return f.flatMap(([texto, e], i) => Array.from(texto, (c) => ({ c, e, t: i >= cola })))
}
const igual = (a: Letra, b: Letra) => a.c === b.c && a.e === b.e && a.t === b.t

function FraseQueSeEscribe({ frase }: { frase: Frase }) {
  const objetivo = letrasDe(frase)
  const clave = objetivo.map((l) => `${l.c}${l.e ? 1 : 0}`).join('')
  const [mostradas, setMostradas] = useState<Letra[]>(objetivo)
  const meta = useRef(objetivo)
  meta.current = objetivo
  const vistas = useRef(mostradas)
  vistas.current = mostradas
  const escribiendo = mostradas.length !== objetivo.length || mostradas.some((l, i) => !igual(l, objetivo[i]))

  useEffect(() => {
    const nuevo = meta.current
    // Only the hour changed (the clock): it changes in place, no typing.
    const cuerpo = (ls: Letra[]) => ls.filter((l) => !l.t)
    const antes = vistas.current
    const mismoCuerpo = cuerpo(antes).length === cuerpo(nuevo).length && cuerpo(nuevo).every((l, i) => igual(l, cuerpo(antes)[i]))
    if (quieto() || mismoCuerpo) {
      setMostradas(nuevo)
      return
    }
    let id = 0
    let ultimo = 0
    let borra = 0
    let teclea = 0
    const paso = (ts: number) => {
      const dt = ultimo ? Math.min(60, ts - ultimo) : 16
      ultimo = ts
      const m = vistas.current
      const obj = meta.current
      let p = 0
      while (p < m.length && p < obj.length && igual(m[p], obj[p])) p++
      let siguiente = m
      if (m.length > p) {
        borra += dt * 0.24
        const q = Math.floor(borra)
        borra -= q
        siguiente = m.slice(0, Math.max(p, m.length - q))
      } else if (m.length < obj.length) {
        teclea += dt * 0.062
        const q = Math.floor(teclea)
        teclea -= q
        if (q) siguiente = [...m, ...obj.slice(m.length, m.length + q)]
      } else return
      vistas.current = siguiente
      setMostradas(siguiente)
      id = requestAnimationFrame(paso)
    }
    id = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(id)
  }, [clave])

  // Pieces of the same kind go together: a <b> for each highlighted run.
  const trozos: { texto: string; e: boolean; t: boolean }[] = []
  for (const l of mostradas) {
    const ult = trozos[trozos.length - 1]
    if (ult && ult.e === l.e && ult.t === l.t) ult.texto += l.c
    else trozos.push({ texto: l.c, e: l.e, t: l.t })
  }
  return (
    <p className={`rc-frase ${escribiendo ? 'escribe' : ''}`} data-frase>
      <span className="sk-sr">{textoDeFrase(frase)}</span>
      <span aria-hidden="true">
        {trozos.map((t, i) => (t.e ? <b key={i}>{t.texto}</b> : <span key={i}>{t.texto}</span>))}
        <i className="rc-caret" />
      </span>
    </p>
  )
}

/* ── 6 · the cron chip: five fields, the changed one flashes ── */
function FichaCron({ campos }: { campos: string[] }) {
  return (
    <div className="rc-expr">
      <span className="rc-cap">Expresión</span>
      <div className="rc-cron" role="img" aria-label={`Expresión de repetición: ${campos.join(' ')}`}>
        {campos.map((c, i) => (
          <span key={`${i}-${c}`} className="rc-cf">
            <span className="rc-cf-v">{c}</span>
            <small>{ETIQUETAS_CRON[i]}</small>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ── 7 · the calendar: six weeks always, the dates light up in a wave ── */
const DIA_MS = 86_400_000
const aMs = (f: string) => Date.parse(`${f}T00:00:00Z`)
const aFecha = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const mesMas = (mes: string, n: number) => {
  const t = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
const nombreDeMes = (mes: string) => `${conMayuscula(MESES_LARGOS[Number(mes.slice(5, 7)) - 1])} ${mes.slice(0, 4)}`

function Calendario({ fechas, hoy }: { fechas: string[]; hoy: string }) {
  const base = (fechas[0] ?? hoy).slice(0, 7)
  const [vista, setVista] = useState({ base, mes: base, dir: 0 })
  // A new first date takes the calendar to its month.
  if (vista.base !== base) setVista({ base, mes: base, dir: base > vista.mes ? 1 : base < vista.mes ? -1 : 0 })
  const mes = vista.mes
  const primero = `${mes}-01`
  const desde = aMs(primero) - ((new Date(aMs(primero)).getUTCDay() + 6) % 7) * DIA_MS
  const fuertes = new Set(fechas.slice(0, 5))
  const todas = new Set(fechas)
  let ola = 0
  const celdas = Array.from({ length: 42 }, (_, i) => {
    const dn = aFecha(desde + i * DIA_MS)
    const o = fuertes.has(dn) ? '1' : todas.has(dn) ? '2' : undefined
    return { dn, o, k: o ? ola++ : 0 }
  })
  const mueve = (d: number) => setVista((v) => ({ ...v, mes: mesMas(v.mes, d), dir: d }))

  return (
    <section className="rc-cal" aria-label="Calendario de las próximas repeticiones">
      <header className="rc-cal-cab">
        <button type="button" className="rc-flecha" aria-label="Mes anterior" onClick={() => mueve(-1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.5 6.5L9 12l5.5 5.5" />
          </svg>
        </button>
        <h3 className="rc-mes">
          <span key={mes} data-dir={vista.dir > 0 ? 'adelante' : vista.dir < 0 ? 'atras' : undefined}>
            {nombreDeMes(mes)}
          </span>
        </h3>
        <button type="button" className="rc-flecha" aria-label="Mes siguiente" onClick={() => mueve(1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9.5 6.5L15 12l-5.5 5.5" />
          </svg>
        </button>
      </header>
      <div className="rc-semana" aria-hidden="true">
        {LETRAS.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
      <div className="rc-rejilla" aria-hidden="true" key={mes} data-dir={vista.dir > 0 ? 'adelante' : vista.dir < 0 ? 'atras' : undefined}>
        {celdas.map((c) => (
          <span
            key={`${c.dn}:${c.o ?? ''}`}
            className="rc-dia"
            data-dn={c.dn}
            data-o={c.o}
            data-otro={c.dn.slice(0, 7) !== mes ? '' : undefined}
            data-hoy={c.dn === hoy ? '' : undefined}
            style={{ ['--k' as string]: c.k }}
          >
            <i className="rc-punto" />
            <b>{Number(c.dn.slice(8))}</b>
          </span>
        ))}
      </div>
    </section>
  )
}

/* ── 7 · the next five, reordered with FLIP: the ones that stay slide, new ones come in ── */
function Proximas({ fechas, hoy, hora, ampm }: { fechas: string[]; hoy: string; hora: string; ampm: string }) {
  const filas = useRef(new Map<string, HTMLLIElement>())
  const antes = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    const animar = !quieto()
    for (const [dn, li] of filas.current) {
      const top = li.getBoundingClientRect().top
      const previo = antes.current.get(dn)
      if (animar && previo !== undefined && Math.abs(previo - top) > 0.5 && typeof li.animate === 'function') {
        li.animate([{ transform: `translateY(${previo - top}px)` }, { transform: 'none' }], {
          duration: 700,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        })
      }
    }
    antes.current = new Map([...filas.current].map(([dn, li]) => [dn, li.getBoundingClientRect().top]))
  }, [fechas])

  return (
    <section className="rc-prox" aria-labelledby="rc-prox-t">
      <h3 className="rc-cap" id="rc-prox-t">
        Próximas cinco
      </h3>
      {fechas.length === 0 ? (
        <p className="rc-vacio">No hay fechas en adelante.</p>
      ) : (
        <ol className="rc-lista" aria-label="Próximas cinco">
          {fechas.map((dn, i) => {
            const w = (new Date(aMs(dn)).getUTCDay() + 6) % 7
            return (
              <li
                key={dn}
                ref={(li) => {
                  if (li) filas.current.set(dn, li)
                  else filas.current.delete(dn)
                }}
                className={`rc-fecha ${i === 0 ? 'primera' : ''}`}
                style={{ ['--k' as string]: i }}
              >
                <span className="rc-f-dia num">{Number(dn.slice(8))}</span>
                <span className="rc-f-txt">
                  <b>{conMayuscula(DIAS[w])}</b>
                  <small>
                    {MESES_LARGOS[Number(dn.slice(5, 7)) - 1].slice(0, 3)} · {relativo(dn, hoy)}
                  </small>
                </span>
                <span className="rc-f-hora num">
                  <Cifra texto={hora} />
                  <small>{ampm}</small>
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

/* ── 8 · Guardar → Guardando… → a drawn ✓ ── */
export type EstadoDeGuardar = 'reposo' | 'guardando' | 'guardado'

export function BotonDeGuardar({
  estado,
  texto,
  className = '',
  ...resto
}: { estado: EstadoDeGuardar; texto: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  const textos: Record<EstadoDeGuardar, string> = { reposo: texto, guardando: 'Guardando…', guardado: 'Guardado' }
  return (
    <button
      type="submit"
      {...resto}
      className={`rc-guardar ${className}`}
      data-estado={estado}
      aria-busy={estado === 'guardando'}
      disabled={resto.disabled || estado === 'guardando'}
    >
      {(Object.keys(textos) as EstadoDeGuardar[]).map((e) => (
        <span key={e} className={`rc-g-txt rc-g-${e}`} aria-hidden={e !== estado}>
          {textos[e]}
        </span>
      ))}
      <svg className="rc-g-giro" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
      </svg>
      <svg className="rc-g-ok" viewBox="0 0 24 24" aria-hidden="true">
        <path pathLength={1} d="M5.5 12.8l4.3 4.3 8.7-9.4" />
      </svg>
    </button>
  )
}
