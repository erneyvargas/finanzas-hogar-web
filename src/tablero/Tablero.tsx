import { useEffect, useRef, useState } from 'react'
import { useCargaVisible } from '../core/cargaVisible'
import { useSesion } from '../auth/sesion'
import { diaDe, mesDe, moverMes, resumenDelMes, type ResumenDelMes } from './calculo'
import type { FuenteDelTablero } from './fuente'
import { colorDe, dinero, nombreDelMes } from '../core/formato'
import type { FuenteDeMovimientos } from '../movimientos/fuente'
import { ListaDeMovimientos } from '../movimientos/ListaDeMovimientos'
import { Panel } from '../movimientos/Panel'
import type { DatosDeMovimientos, FilaDeMovimiento } from '../movimientos/reglas'

const mesLargo = (mes: string) => {
  const n = nombreDelMes(mes)
  return `${n[0].toUpperCase()}${n.slice(1)} ${mes.slice(0, 4)}`
}
const mesCorto = (mes: string) => {
  const n = nombreDelMes(mes)
  return `${n[0].toUpperCase()}${n.slice(1, 3)}`
}

/**
 * The month at a glance (option A of the proposals): what was spent
 * against the month before, by person, the income left, categories by
 * person, and the last six months. With [movimientos], the month's
 * list below it and the side panel to register and correct.
 */
export function Tablero({
  fuente,
  movimientos,
  mesInicial = mesDe(new Date().toISOString()),
  ahora = () => new Date(),
}: {
  fuente: FuenteDelTablero
  movimientos?: FuenteDeMovimientos
  mesInicial?: string
  /** The clock; tests fix it. */
  ahora?: () => Date
}) {
  const { usuario, salir } = useSesion()
  const hoy = mesDe(new Date().toISOString())
  /** Today in Bogotá; a string, so the effect below reruns only when the day changes. */
  const diaDeHoy = diaDe(ahora())
  const [mes, setMes] = useState(mesInicial)
  const [resumen, setResumen] = useState<ResumenDelMes | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Bumped after a save so the dashboard and the list load again. */
  const [recarga, setRecarga] = useState(0)
  const [lista, setLista] = useState<{ mes: string; datos: DatosDeMovimientos } | null>(null)
  const [errorDeLista, setErrorDeLista] = useState<string | null>(null)
  /** `undefined`: closed; `null`: registering; a movement: correcting it. */
  const [enPanel, setEnPanel] = useState<FilaDeMovimiento | null | undefined>(undefined)
  const [aperturas, setAperturas] = useState(0)

  useEffect(() => {
    let vivo = true
    setResumen(null)
    setError(null)
    fuente
      .cargar(mes)
      .then(({ hogarId, datos }) => {
        if (vivo) setResumen(resumenDelMes({ ...datos, mes, hogarId, hoy: diaDeHoy }))
      })
      .catch((e: Error) => {
        if (vivo) setError(`No se pudo cargar el mes. ${e.message}`)
      })
    return () => {
      vivo = false
    }
  }, [fuente, mes, recarga, diaDeHoy])

  useEffect(() => {
    if (!movimientos) return
    let vivo = true
    setErrorDeLista(null)
    movimientos
      .cargar(mes)
      .then((d) => {
        if (vivo) setLista({ mes, datos: d })
      })
      .catch((e: Error) => {
        if (vivo) setErrorDeLista(`No se pudieron cargar los movimientos. ${e.message}`)
      })
    return () => {
      vivo = false
    }
  }, [movimientos, mes, recarga])

  /** What had the focus when the panel opened; it gets it back on close. */
  const abridor = useRef<HTMLElement | null>(null)
  const abrir = (m: FilaDeMovimiento | null) => {
    abridor.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setAperturas((n) => n + 1)
    setEnPanel(m)
  }
  const cerrar = (guardado: boolean) => {
    setEnPanel(undefined)
    if (guardado) setRecarga((n) => n + 1)
  }
  useEffect(() => {
    if (enPanel === undefined && abridor.current?.isConnected) {
      abridor.current.focus()
      abridor.current = null
    }
  }, [enPanel])
  const reintentar = () => {
    setError(null)
    setErrorDeLista(null)
    setRecarga((n) => n + 1)
  }
  const esqueleto = useCargaVisible(!error && !resumen)
  const listaDelMes = lista?.mes === mes ? lista.datos : null

  return (
    <div className={`marco ${enPanel !== undefined ? 'con-panel' : ''}`}>
      <header className="barra">
        <span className="marca-texto">Finanzas del hogar</span>
        <nav className="selector-mes" aria-label="Mes">
          <button className="flecha" aria-label="Mes anterior" onClick={() => setMes(moverMes(mes, -1))}>
            ‹
          </button>
          <span>{mesLargo(mes)}</span>
          <button
            className="flecha"
            aria-label="Mes siguiente"
            disabled={mes >= hoy}
            onClick={() => setMes(moverMes(mes, 1))}
          >
            ›
          </button>
        </nav>
        {movimientos && (
          <button disabled={!lista} onClick={() => abrir(null)}>
            + Registrar
          </button>
        )}
        <span className="apagado correo">{usuario?.email}</span>
        <button className="secundario" onClick={() => void salir()}>
          Salir
        </button>
      </header>

      <main className="contenido">
        {error && <Fallo texto={error} alReintentar={reintentar} />}
        {!error && esqueleto && <Esqueleto mes={mes} conLista={!!movimientos} />}
        {resumen && !esqueleto && <Contenido mes={mes} r={resumen} />}
        {movimientos && errorDeLista && <Fallo texto={errorDeLista} alReintentar={reintentar} />}
        {movimientos && !errorDeLista && listaDelMes && !esqueleto && (
          <ListaDeMovimientos mes={mes} datos={listaDelMes} alElegir={abrir} />
        )}
      </main>

      {movimientos && lista && enPanel !== undefined && (
        <Panel
          key={aperturas}
          datos={lista.datos}
          original={enPanel}
          fuente={movimientos}
          ahora={ahora}
          alCerrar={cerrar}
        />
      )}
    </div>
  )
}

function Fallo({ texto, alReintentar }: { texto: string; alReintentar: () => void }) {
  return (
    <div role="alert" className="tarjeta fallo">
      <p className="error">{texto}</p>
      <button className="secundario" onClick={alReintentar}>
        Reintentar
      </button>
    </div>
  )
}

/**
 * The dashboard's shape while the month loads. Sizes measured on the live
 * page at 1920px: top cards 128px, matrix and chart cards 287px, list rows
 * 37px. Below 900px the grid is one column, as the real one.
 */
function Esqueleto({ mes, conLista }: { mes: string; conLista: boolean }) {
  const pequena = (
    <div className="tarjeta" aria-hidden="true">
      <span className="skeleton skeleton--text sk-w40" style={{ ['--sk-line' as string]: '19px', marginBottom: 15 }} />
      <span className="skeleton sk-w65" style={{ height: 40, marginBottom: 8 }} />
      <span className="skeleton skeleton--text sk-w80" style={{ ['--sk-line' as string]: '18px' }} />
    </div>
  )
  return (
    <div aria-busy="true" className="sk-delay">
      <p role="status" className="sk-sr">
        Cargando {nombreDelMes(mes)}…
      </p>
      <div className="rejilla">
        {pequena}
        {pequena}
        {pequena}
        <div className="tarjeta ancha esqueleto-alto" aria-hidden="true">
          <span className="skeleton skeleton--text sk-w30" style={{ ['--sk-line' as string]: '19px', marginBottom: 15 }} />
          {[100, 80, 65].map((w) => (
            <span key={w} className={`skeleton skeleton--text sk-w${w}`} style={{ ['--sk-line' as string]: '37px' }} />
          ))}
        </div>
        <div className="tarjeta esqueleto-alto" aria-hidden="true">
          <span className="skeleton skeleton--text sk-w40" style={{ ['--sk-line' as string]: '19px', marginBottom: 15 }} />
          <span className="skeleton" style={{ height: 200 }} />
        </div>
      </div>
      {conLista && (
        <div className="tarjeta movimientos" aria-hidden="true">
          <span className="skeleton skeleton--text sk-w30" style={{ ['--sk-line' as string]: '19px', marginBottom: 15 }} />
          {[100, 100, 100, 100].map((w, i) => (
            <span key={i} className={`skeleton skeleton--text sk-w${w}`} style={{ ['--sk-line' as string]: '37px' }} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Days before this one in a running month read as "Día N de M", not as a percentage. */
const DIAS_PARA_COMPARAR = 5

function diasDelMes(mes: string): number {
  const [a, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).getUTCDate()
}

function Contenido({ mes, r }: { mes: string; r: ResumenDelMes }) {
  const anterior =
    nombreDelMes(moverMes(mes, -1)) +
    (r.comparadoHasta === null ? '' : ` hasta el día ${r.comparadoHasta}`)
  const cambio = r.gastadoAnterior > 0 ? (r.gastado - r.gastadoAnterior) / r.gastadoAnterior : null
  const quedan = r.ingresos - r.gastado
  const columnas = r.porRubro
  const maxCelda = Math.max(1, ...r.matriz.flatMap((f) => Object.values(f.porRubro)))

  return (
    <div className="rejilla">
      <section className="tarjeta" aria-labelledby="t-gastado">
        <h2 id="t-gastado">Gastado en {nombreDelMes(mes)}</h2>
        <p className="grande num">{dinero(r.gastado)}</p>
        <p className="nota">
          {r.comparadoHasta !== null && r.comparadoHasta < DIAS_PARA_COMPARAR ? (
            <>
              Día {r.comparadoHasta} de {diasDelMes(mes)} · {anterior}: {dinero(r.gastadoAnterior)}
            </>
          ) : cambio === null ? (
            <>Sin gastos en {anterior} para comparar</>
          ) : (
            <>
              <span className={cambio > 0 ? 'sube' : 'baja'}>
                {cambio > 0 ? '↑' : '↓'} {Math.abs(Math.round(cambio * 100))} %
              </span>{' '}
              contra {anterior} ({dinero(r.gastadoAnterior)})
            </>
          )}
        </p>
      </section>

      <section className="tarjeta" aria-labelledby="t-personas">
        <h2 id="t-personas">Por persona</h2>
        {columnas.length === 0 ? (
          <p className="nota">Sin gastos este mes.</p>
        ) : (
          <>
            <div className="barra-apilada" aria-hidden="true">
              {columnas.map((c) => (
                <div key={c.id} style={{ flex: c.total, background: colorDe(c.color) }} title={c.nombre} />
              ))}
            </div>
            <ul className="leyenda">
              {columnas.map((c) => (
                <li key={c.id}>
                  <i style={{ background: colorDe(c.color) }} />
                  <span>{c.nombre}</span> <b className="num">{dinero(c.total)}</b>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="tarjeta" aria-labelledby="t-ingresos">
        <h2 id="t-ingresos">Ingresos del mes</h2>
        <p className="grande num">{dinero(r.ingresos)}</p>
        <p className="nota">
          {quedan >= 0 ? 'Te quedan ' : 'Gastaste de más '}
          <b className={`num ${quedan < 0 ? 'sube' : ''}`}>{dinero(Math.abs(quedan))}</b>
          {quedan >= 0 ? ' después de los gastos' : ' sobre lo que entró'}
        </p>
      </section>

      <section className="tarjeta ancha" aria-labelledby="t-matriz">
        <h2 id="t-matriz">Categorías por persona</h2>
        {r.matriz.length === 0 ? (
          <p className="nota">Sin gastos este mes.</p>
        ) : (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Categoría</th>
                  {columnas.map((c) => (
                    <th key={c.id}>{c.nombre}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {r.matriz.map((f) => (
                  <tr key={f.categoria}>
                    <td>{f.categoria}</td>
                    {columnas.map((c) => {
                      const v = f.porRubro[c.id] ?? 0
                      const fuerza = v ? Math.round(12 + (55 * v) / maxCelda) : 0
                      return (
                        <td key={c.id}>
                          {v ? (
                            <span
                              className="celda num"
                              style={{
                                background: `color-mix(in srgb, ${colorDe(c.color)} ${fuerza}%, transparent)`,
                              }}
                            >
                              {dinero(v)}
                            </span>
                          ) : (
                            <span className="apagado">·</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="num">
                      <b>{dinero(f.total)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="tarjeta" aria-labelledby="t-meses">
        <h2 id="t-meses">Últimos seis meses</h2>
        <Tendencia r={r} />
      </section>
    </div>
  )
}

/** A step of 1, 2 or 5 times a power of ten that leaves about 4 lines. */
function paso(max: number) {
  const bruto = max / 4
  const p = 10 ** Math.floor(Math.log10(bruto || 1))
  return [1, 2, 5, 10].map((k) => k * p).find((s) => s >= bruto) ?? p * 10
}

function Tendencia({ r }: { r: ResumenDelMes }) {
  const W = 320
  const H = 210
  const pad = { l: 44, r: 6, t: 10, b: 24 }
  const maxTotal = Math.max(1, ...r.meses.map((m) => m.total))
  const s = paso(maxTotal)
  const tope = Math.ceil(maxTotal / s) * s
  const alto = H - pad.t - pad.b
  const ancho = (W - pad.l - pad.r) / r.meses.length
  const y = (v: number) => H - pad.b - (v / tope) * alto
  const color = new Map(r.porRubro.map((c) => [c.id, c.color]))
  const lineas = Array.from({ length: Math.round(tope / s) + 1 }, (_, i) => i * s)
  const corto = (v: number) => (v >= 1e6 ? `${v / 1e6}M` : v >= 1e3 ? `${v / 1e3}k` : `${v}`)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Gasto de los últimos seis meses por persona">
      {lineas.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--regla)" />
          <text x={pad.l - 6} y={y(v) + 4} textAnchor="end">
            {corto(v)}
          </text>
        </g>
      ))}
      {r.meses.map((m, i) => {
        const x = pad.l + i * ancho + ancho * 0.18
        let base = H - pad.b
        const ultimo = i === r.meses.length - 1
        return (
          <g key={m.mes}>
            {Object.entries(m.porRubro).map(([id, v]) => {
              const h = (v / tope) * alto
              base -= h
              return (
                <rect
                  key={id}
                  x={x}
                  y={base}
                  width={ancho * 0.64}
                  height={h}
                  fill={colorDe(color.get(id) ?? null)}
                  opacity={ultimo ? 1 : 0.55}
                >
                  <title>{`${mesCorto(m.mes)}: ${dinero(v)}`}</title>
                </rect>
              )
            })}
            <text x={x + ancho * 0.32} y={H - pad.b + 16} textAnchor="middle" fontWeight={ultimo ? 700 : 400}>
              {mesCorto(m.mes)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
