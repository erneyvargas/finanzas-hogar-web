import { Fragment, useDeferredValue, useId, useMemo, useState } from 'react'
import { Ayuda } from '../core/ui/Ayuda'
import { Cifra } from '../core/ui/Cifra'
import { dinero, miles } from '../core/formato'
import type { DatosDelPlan } from './fuente'
import {
  avisoDeCierre,
  comparar,
  ESTRATEGIAS,
  filasDeOrden,
  lineaDeDiferencia,
  mesDelPlan,
  millones,
  resultadoDe,
  textoDeEsteMes,
  type Estrategia,
  type FilaDeOrden,
  type ResultadoDelPlan,
} from './plan'

/** What this browser remembers; the phone keeps its own choice. Nothing goes to the server. */
const CLAVE_DE_ESTRATEGIA = 'plan-de-deudas-estrategia'
const CLAVE_DE_EXTRA = 'plan-de-deudas-extra'

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave)
  } catch {
    return null
  }
}

function guardar(clave: string, valor: string | null) {
  try {
    if (valor === null) localStorage.removeItem(clave)
    else localStorage.setItem(clave, valor)
  } catch {
    // Blocked storage (private window): the choice just is not remembered.
  }
}

function estrategiaGuardada(): Estrategia | null {
  const e = leer(CLAVE_DE_ESTRATEGIA)
  return ESTRATEGIAS.some((x) => x.id === e) ? (e as Estrategia) : null
}

function extraGuardado(): number | null {
  const texto = leer(CLAVE_DE_EXTRA)
  const v = texto === null ? NaN : Number(texto)
  return Number.isFinite(v) && v >= 0 ? v : null
}

/** The project palette, one color per bar; the 0 % group goes gray. */
const COLORES = ['marino', 'arcilla', 'laguna', 'lavanda', 'musgo', 'ciruela', 'acero', 'mostaza', 'anil', 'oliva']

const enLista = (xs: string[]) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)
const conMeses = (n: number) => (n === 1 ? '1 mes' : `${n} meses`)

/**
 * The plan to get out of debt (design B, «Línea de tiempo»): when the
 * household is debt-free, the extra each month and the strategy that
 * recompute it at once, one bar per debt up to its payoff month, what to
 * do this month and, collapsed, the phone's month-by-month table.
 */
export function PlanDeDeudas({ datos, mesUno }: { datos: DatosDelPlan; mesUno: string }) {
  const [elegida, setElegida] = useState<Estrategia | null>(estrategiaGuardada)
  const [propio, setPropio] = useState<number | null>(extraGuardado)
  const extra = propio ?? datos.sobrante
  /** What is being typed in the exact field; null mirrors the extra. */
  const [campo, setCampo] = useState<string | null>(null)
  // The slider redraws at once; the plan follows as soon as it can.
  const extraDelPlan = useDeferredValue(extra)
  const comparacion = useMemo(() => comparar(datos.deudas, extraDelPlan), [datos.deudas, extraDelPlan])
  const estrategia = elegida ?? comparacion.recomendada
  const r = resultadoDe(comparacion, estrategia)

  if (datos.deudas.length === 0) {
    return (
      <section className="tarjeta pd-vacio" aria-label="Plan de deudas">
        <h2>No tienes deudas por pagar</h2>
        <p className="nota">Cuando registres una deuda o una compra diferida, aquí verás cuándo terminas de pagarla.</p>
      </section>
    )
  }

  const cambiarExtra = (v: number) => {
    setPropio(v)
    guardar(CLAVE_DE_EXTRA, String(v))
  }
  const usarCalculado = () => {
    setPropio(null)
    setCampo(null)
    guardar(CLAVE_DE_EXTRA, null)
  }
  const elegir = (e: Estrategia) => {
    setElegida(e)
    guardar(CLAVE_DE_ESTRATEGIA, e)
  }
  // Steps of 10.000 up to twice the surplus (at least two million); the
  // field takes any exact amount, beyond the slider too.
  const tope = Math.max(2_000_000, Math.ceil((datos.sobrante * 2) / 100_000) * 100_000)
  const cerradas = r.cierres.filter((c) => c.mes !== null).length

  return (
    <div className="plan-deudas">
      <div className="pd-tarjetas">
        <section className="tarjeta pd-fin" aria-label="Sin deudas en">
          <h2>Sin deudas en</h2>
          {r.meses !== null ? (
            <>
              <p className="grande">
                <Cifra texto={mesDelPlan(mesUno, r.meses)} />
              </p>
              <p className="nota num">
                {conMeses(r.meses)} · intereses {millones(r.interesTotal)}
              </p>
            </>
          ) : (
            <>
              <p className="pd-no-termina">Con este abono no se cierran todas las deudas</p>
              <p className="nota num">
                Se cierran {cerradas} de {r.cierres.length} en 50 años
              </p>
            </>
          )}
        </section>

        <section className="tarjeta pd-extra" aria-label="Abono extra cada mes">
          <h2>Abono extra cada mes</h2>
          <div className="pd-deslizador-fila">
            <input
              type="range"
              className="pd-deslizador"
              aria-label="Abono extra cada mes"
              aria-valuetext={dinero(extra)}
              min={0}
              max={tope}
              step={10_000}
              value={Math.min(extra, tope)}
              onChange={(e) => {
                const v = Number(e.target.value)
                cambiarExtra(v)
                setCampo(null)
              }}
            />
            <b className="num pd-monto">{dinero(extra)}</b>
          </div>
          <div className="pd-exacto">
            <input
              type="number"
              inputMode="numeric"
              className="pd-campo num"
              aria-label="Abono extra exacto"
              min={0}
              step={1000}
              value={campo ?? String(extra)}
              onChange={(e) => {
                setCampo(e.target.value)
                const v = Number(e.target.value)
                if (e.target.value.trim() !== '' && Number.isFinite(v) && v >= 0) cambiarExtra(Math.round(v))
              }}
            />
            <button className="secundario pd-calculado" disabled={propio === null} onClick={usarCalculado}>
              Usar el calculado
            </button>
          </div>
          <p className="nota">
            Lo que sobra al mes según tus últimos 3 meses: <span className="num">{dinero(datos.sobrante)}</span>
          </p>
        </section>

        <section className="tarjeta pd-estrategia" aria-label="Estrategia">
          <h2>Estrategia</h2>
          <div className="conmutador pd-conmutador" role="group" aria-label="Estrategia">
            {ESTRATEGIAS.map((e) => (
              <button key={e.id} aria-pressed={estrategia === e.id} onClick={() => elegir(e.id)}>
                {e.nombre}
                {comparacion.recomendada === e.id && <span className="pd-chip">Recomendada</span>}
              </button>
            ))}
          </div>
          <p className="nota">{ESTRATEGIAS.find((e) => e.id === estrategia)!.regla}</p>
          <p className="pd-diferencia">{lineaDeDiferencia(comparacion, datos.deudas.length)}</p>
        </section>
      </div>

      <LineaDeTiempo r={r} mesUno={mesUno} />

      <p className="pd-accion">{textoDeEsteMes(r, mesUno)}</p>

      <MesAMes r={r} mesUno={mesUno} />
    </div>
  )
}

/** «Cuándo termina cada deuda»: one bar per debt from today to its payoff month. */
function LineaDeTiempo({ r, mesUno }: { r: ResultadoDelPlan; mesUno: string }) {
  const filas = filasDeOrden(r)
  const cerradas = r.cierres.map((c) => c.mes).filter((m): m is number => m !== null)
  const horizonte = r.meses ?? Math.max(12, ...cerradas)
  const anos = ejeDeAnos(mesUno, horizonte)

  const titulo = (f: FilaDeOrden) => (f.nombres.length === 1 ? f.nombres[0] : `${f.nombres[0]} y ${f.nombres.length - 1} sin interés`)
  const ayuda = (f: FilaDeOrden) => {
    if (f.nombres.length > 1) return `${enLista(f.nombres)} · terminan ${mesDelPlan(mesUno, f.mes!)} · sin intereses`
    const fin = f.mes === null ? 'no cierra con este abono' : `termina ${mesDelPlan(mesUno, f.mes)}`
    return `${f.nombres[0]} · ${fin} · intereses ${millones(Math.round(r.interesPorDeuda[f.ids[0]] ?? 0))}`
  }

  return (
    <section className="tarjeta pd-linea" aria-label="Cuándo termina cada deuda">
      <h2>Cuándo termina cada deuda</h2>
      <ul className="pd-barras">
        {filas.map((f, i) => {
          const color = f.nombres.length > 1 ? 'var(--grafito)' : `var(--p-${COLORES[i % COLORES.length]})`
          const ancho = f.mes === null ? 100 : Math.max(2, (f.mes / horizonte) * 100)
          const texto = ayuda(f)
          return (
            <li key={f.ids.join(',')} className="pd-barra">
              <span className="pd-nombre" title={f.nombres.length > 1 ? enLista(f.nombres) : undefined}>
                {titulo(f)} <span className="apagado">· {f.tasa}</span>
              </span>
              <Ayuda texto={texto}>
                <span className="pd-pista" tabIndex={0} role="img" aria-label={texto}>
                  <i className={f.mes === null ? 'no-cierra' : undefined} style={{ width: `${ancho}%`, background: color }} />
                </span>
              </Ayuda>
              <span className="num pd-fin-mes">{f.mes === null ? 'No cierra' : mesDelPlan(mesUno, f.mes)}</span>
            </li>
          )
        })}
      </ul>
      <div className="pd-eje" aria-hidden="true">
        <span />
        <div className="pd-eje-anos">
          {anos.map((a) => (
            <span key={a.ano} style={{ left: `${a.en}%`, transform: a.en === 0 ? 'none' : undefined }}>
              {a.ano}
            </span>
          ))}
        </div>
        <span />
      </div>
    </section>
  )
}

/** The years on the time axis: the current one at 0 and each January after it, thinned past 8. */
function ejeDeAnos(mesUno: string, horizonte: number): { ano: number; en: number }[] {
  const ano = Number(mesUno.slice(0, 4))
  const inicio = ano * 12 + Number(mesUno.slice(5)) - 1
  const marcas = [{ ano, en: 0 }]
  for (let y = ano + 1; y * 12 - inicio < horizonte; y++) marcas.push({ ano: y, en: ((y * 12 - inicio) / horizonte) * 100 })
  // A January too close to the start would overlap the current year's label.
  if (marcas.length > 1 && marcas[1].en < 8) marcas.shift()
  const paso = Math.ceil(marcas.length / 8)
  return marcas.filter((_, i) => i % paso === 0)
}

/** «Ver mes a mes»: the phone's table, a month opening into one line per debt. */
function MesAMes({ r, mesUno }: { r: ResultadoDelPlan; mesUno: string }) {
  const [visible, setVisible] = useState(false)
  const [abiertos, setAbiertos] = useState<Set<number>>(() => new Set())
  const id = useId()
  const alternar = (n: number) =>
    setAbiertos((s) => {
      const nuevo = new Set(s)
      if (nuevo.has(n)) nuevo.delete(n)
      else nuevo.add(n)
      return nuevo
    })

  return (
    <section className="tarjeta pd-mes-a-mes">
      <button className="secundario pd-ver" aria-expanded={visible} aria-controls={id} onClick={() => setVisible((v) => !v)}>
        {visible ? 'Ocultar mes a mes' : 'Ver mes a mes'}
      </button>
      {visible && (
        <div className="tabla-envoltura" id={id}>
          <table className="pd-tabla" aria-label="Plan mes a mes">
            <thead>
              <tr>
                <th>Mes</th>
                <th>Extra a</th>
                <th>Pagas</th>
                <th>Interés</th>
                <th>Debes</th>
              </tr>
            </thead>
            <tbody>
              {r.mesAMes.map((m) => {
                const abierto = abiertos.has(m.numero)
                const aviso = avisoDeCierre(m)
                return (
                  <Fragment key={m.numero}>
                    <tr className={`pd-fila-mes ${abierto ? 'abierta' : ''}`}>
                      <td>
                        <button className="pd-abrir" aria-expanded={abierto} onClick={() => alternar(m.numero)}>
                          {mesDelPlan(mesUno, m.numero)}
                        </button>
                      </td>
                      <td className="pd-extra-a">{m.extraA ?? '—'}</td>
                      <td className="num">{miles(m.pagado)}</td>
                      <td className="num pd-interes">{miles(m.interes)}</td>
                      <td className="num">{miles(m.debes)}</td>
                    </tr>
                    {abierto &&
                      m.porDeuda.map((d) => (
                        <tr key={d.id} className={`pd-fila-deuda ${Math.round(d.extra) > 0 ? 'con-extra' : ''}`}>
                          <td>{d.nombre}</td>
                          <td className="pd-extra-a">{Math.round(d.extra) > 0 ? `+$${miles(d.extra)} extra` : ''}</td>
                          <td className="num">{miles(d.pago)}</td>
                          <td className="num pd-interes">{miles(d.interes)}</td>
                          <td className="num">{miles(d.saldo)}</td>
                        </tr>
                      ))}
                    {aviso && (
                      <tr className="pd-aviso">
                        <td colSpan={5}>{aviso}</td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
