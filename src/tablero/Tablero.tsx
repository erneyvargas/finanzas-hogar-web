import { useEffect, useRef, useState } from 'react'
import { useCargaVisible } from '../core/cargaVisible'
import { guardarEnLaPestana, leerDeLaPestana } from '../core/recordado'
import { useSesion } from '../auth/sesion'
import { diaDe, mesDe, moverMes, resumenDelMes, type ResumenDelMes } from './calculo'
import type { FuenteDelTablero } from './fuente'
import { colorDe, dinero, nombreDelMes } from '../core/formato'
import type { FuenteDeMovimientos } from '../movimientos/fuente'
import { DesdeFactura } from '../facturas/DesdeFactura'
import { VisorDeFactura } from '../movimientos/VisorDeFactura'
import type { FuenteDeFacturas } from '../facturas/fuente'
import { ListaDeMovimientos } from '../movimientos/ListaDeMovimientos'
import { Panel } from '../movimientos/Panel'
import type { DatosDeMovimientos, FilaDeMovimiento } from '../movimientos/reglas'
import { PorCategoria } from './PorCategoria'
import { Cuentas } from '../cuentas/Cuentas'
import type { FuenteDeCuentas } from '../cuentas/fuente'
import { PanelDeCuenta, type VistaDeCuenta } from '../cuentas/PanelDeCuenta'
import type { DatosDeCuentas } from '../cuentas/reglas'
import { PorVencer } from '../porvencer/PorVencer'
import type { FuenteDePorVencer } from '../porvencer/fuente'
import { porPagarEn30Dias, vencimientos, type DatosDePorVencer, type Vencimiento } from '../porvencer/reglas'

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
 * list below it and the side panel to register and correct. With
 * [facturas] too, «Desde factura» registers an expense from a receipt.
 * With [cuentas], the «Cuentas» tab: today's balances and the accounts'
 * own side panel. With [porVencer], the «Por vencer» tab: bills coming due.
 */
export function Tablero({
  fuente,
  movimientos,
  facturas,
  cuentas,
  porVencer,
  mesInicial,
  ahora = () => new Date(),
}: {
  fuente: FuenteDelTablero
  movimientos?: FuenteDeMovimientos
  /** Where receipts are uploaded and read; without it, no «Desde factura». */
  facturas?: FuenteDeFacturas
  /** Where the accounts are read and written; without it, no «Cuentas» tab. */
  cuentas?: FuenteDeCuentas
  /** Where the bills coming due are read; without it, no «Por vencer» tab. */
  porVencer?: FuenteDePorVencer
  /** Without it: the month open before an F5, else the current one. */
  mesInicial?: string
  /** The clock; tests fix it. */
  ahora?: () => Date
}) {
  const { usuario, salir } = useSesion()
  const hoy = mesDe(new Date().toISOString())
  /** Today in Bogotá; a string, so the effect below reruns only when the day changes. */
  const diaDeHoy = diaDe(ahora())
  const [mes, setMesGuardado] = useState(
    () => mesInicial ?? leerDeLaPestana<string>('mes-del-tablero') ?? mesDe(new Date().toISOString()),
  )
  useEffect(() => guardarEnLaPestana('mes-del-tablero', mes), [mes])
  /** Which way the month name slides in. */
  const [direccion, setDireccion] = useState<'atras' | 'adelante' | null>(null)
  const setMes = (nuevo: string) => {
    setDireccion(nuevo < mes ? 'atras' : 'adelante')
    setMesGuardado(nuevo)
  }
  /** With its month: a reload of the same month keeps showing the old one. */
  const [cargado, setCargado] = useState<{ mes: string; r: ResumenDelMes } | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Bumped after a save so the dashboard and the list load again. */
  const [recarga, setRecarga] = useState(0)
  const [lista, setLista] = useState<{ mes: string; datos: DatosDeMovimientos } | null>(null)
  const [errorDeLista, setErrorDeLista] = useState<string | null>(null)
  /** `undefined`: closed; `null`: registering; a movement: correcting it. */
  const [enPanel, setEnPanel] = useState<FilaDeMovimiento | null | undefined>(undefined)
  const [aperturas, setAperturas] = useState(0)
  /** The movement a new registration copies (Duplicar), or none. */
  const [copia, setCopia] = useState<FilaDeMovimiento | null>(null)
  /** What a new expense from the Por categoría card starts with. */
  const [inicio, setInicio] = useState<{
    categoria?: string
    busqueda?: string
    monto?: number
    cuenta?: string
    comercio?: string
  } | null>(null)
  /** The expense just added from the card, while its Deshacer shows. */
  const [anadido, setAnadido] = useState<{ id: string; error?: string } | null>(null)
  /** The receipt dialog's opening count while it is open; `null` when closed. */
  const [factura, setFactura] = useState<number | null>(null)
  /** The movement whose receipt is being seen (Ver factura). */
  const [viendoFactura, setViendoFactura] = useState<{ reciboId: string; titulo: string } | null>(null)
  const [datosDeCuentas, setDatosDeCuentas] = useState<DatosDeCuentas | null>(null)
  const [errorDeCuentas, setErrorDeCuentas] = useState<string | null>(null)
  /** The accounts panel: `undefined` when closed. */
  const [enCuentas, setEnCuentas] = useState<VistaDeCuenta | undefined>(undefined)
  const [datosPorVencer, setDatosPorVencer] = useState<DatosDePorVencer | null>(null)
  const [errorPorVencer, setErrorPorVencer] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setError(null)
    fuente
      .cargar(mes)
      .then(({ hogarId, datos }) => {
        if (vivo) setCargado({ mes, r: resumenDelMes({ ...datos, mes, hogarId, hoy: diaDeHoy }) })
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

  useEffect(() => {
    if (!cuentas) return
    let vivo = true
    setErrorDeCuentas(null)
    cuentas
      .cargar()
      .then((d) => {
        if (vivo) setDatosDeCuentas(d)
      })
      .catch((e: Error) => {
        if (vivo) setErrorDeCuentas(`No se pudieron cargar las cuentas. ${e.message}`)
      })
    return () => {
      vivo = false
    }
  }, [cuentas, recarga])

  useEffect(() => {
    if (!porVencer) return
    let vivo = true
    setErrorPorVencer(null)
    porVencer
      .cargar()
      .then((d) => {
        if (vivo) setDatosPorVencer(d)
      })
      .catch((e: Error) => {
        if (vivo) setErrorPorVencer(`No se pudieron cargar los vencimientos. ${e.message}`)
      })
    return () => {
      vivo = false
    }
  }, [porVencer, recarga])

  /** What had the focus when the panel opened; it gets it back on close. */
  const abridor = useRef<HTMLElement | null>(null)
  const abrirCuentas = (v: VistaDeCuenta) => {
    if (enCuentas === undefined) {
      abridor.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
    setEnCuentas(v)
  }
  const recargar = () => setRecarga((n) => n + 1)
  const abrir = (m: FilaDeMovimiento | null) => {
    abridor.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setAperturas((n) => n + 1)
    setCopia(null)
    setInicio(null)
    setEnPanel(m)
  }
  /**
   * A new expense from the card: a category with one subcategory comes
   * chosen; otherwise its name is typed so its subcategories show.
   */
  const anadir = (categoriaId: string | null) => {
    const cats = lista?.datos.categorias ?? []
    const hijas = cats.filter((c) => c.viva && c.nivel === 'subcategory' && c.padreId === categoriaId)
    const nombre = cats.find((c) => c.id === categoriaId)?.nombre
    abrir(null)
    setInicio(hijas.length === 1 ? { categoria: hijas[0].id } : nombre ? { busqueda: nombre } : {})
  }
  /** Pagar in Por vencer: a new expense with the bill's amount, category, account and name. */
  const pagar = (v: Vencimiento) => {
    abrir(null)
    setInicio({
      categoria: v.categoriaId ?? undefined,
      monto: v.monto,
      cuenta: v.cuentaId ?? undefined,
      comercio: v.nombre,
    })
  }
  // Swaps the correction for a new movement copied from it. What opened the
  // correction keeps its claim on the focus.
  const duplicar = (m: FilaDeMovimiento) => {
    setAperturas((n) => n + 1)
    setCopia(m)
    setEnPanel(null)
  }
  const abrirFactura = () => {
    abridor.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setAperturas((n) => n + 1)
    setFactura(aperturas + 1)
  }
  const cerrarFactura = (guardado: boolean) => {
    setFactura(null)
    if (guardado) setRecarga((n) => n + 1)
  }
  const cerrar = (guardado: boolean, idNuevo?: string) => {
    setEnPanel(undefined)
    if (guardado) setRecarga((n) => n + 1)
    if (inicio && idNuevo) setAnadido({ id: idNuevo })
    setInicio(null)
  }
  /** Deletes from the row menu; a rejection goes back to the menu to show. */
  const borrarDesdeLaLista = async (m: FilaDeMovimiento) => {
    if (!movimientos) return
    await movimientos.ejecutar('borrar_movimiento', { p_id: m.id })
    setRecarga((n) => n + 1)
  }
  const deshacer = async (id: string) => {
    if (!movimientos) return
    try {
      await movimientos.ejecutar('borrar_movimiento', { p_id: id })
      setAnadido(null)
      setRecarga((n) => n + 1)
    } catch (e) {
      setAnadido({ id, error: e instanceof Error ? e.message : 'No se pudo deshacer.' })
    }
  }
  // The undo offer goes away on its own after a while.
  useEffect(() => {
    if (!anadido || anadido.error) return
    const t = setTimeout(() => setAnadido(null), 8000)
    return () => clearTimeout(t)
  }, [anadido])
  useEffect(() => {
    if (enPanel === undefined && factura === null && enCuentas === undefined && abridor.current?.isConnected) {
      abridor.current.focus()
      abridor.current = null
    }
  }, [enPanel, factura, enCuentas])
  const reintentar = () => {
    setError(null)
    setErrorDeLista(null)
    setErrorDeCuentas(null)
    setErrorPorVencer(null)
    setRecarga((n) => n + 1)
  }
  // ← and → change the month, unless a field is typing or the panel is open.
  const teclaDeMes = useRef<(e: KeyboardEvent) => void>(() => {})
  teclaDeMes.current = (e) => {
    const t = e.target
    if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
    if (enPanel !== undefined || enCuentas !== undefined || factura !== null || viendoFactura !== null || e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'ArrowLeft') setMes(moverMes(mes, -1))
    else if (e.key === 'ArrowRight' && mes < hoy) setMes(moverMes(mes, 1))
  }
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => teclaDeMes.current(e)
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [])

  // Only a new month shows the skeleton. A reload after saving keeps the
  // page (and the list's filters) until the new numbers arrive.
  const resumen = cargado?.mes === mes ? cargado.r : null
  const esqueleto = useCargaVisible(!error && !resumen)
  const listaDelMes = lista?.mes === mes ? lista.datos : null
  const [pestanaGuardadaAhora, setPestana] = useState<Pestana>(pestanaGuardada)
  const elegirPestana = (p: Pestana) => {
    setPestana(p)
    guardarPestana(p)
    setEnCuentas(undefined)
  }
  // A tab whose source is missing is not offered; without either, no tabs.
  const ofrecida = { resumen: true, movimientos: !!movimientos, cuentas: !!cuentas, porvencer: !!porVencer }
  const pestanas = PESTANAS.filter((p) => ofrecida[p.id])
  const pestana = pestanas.some((p) => p.id === pestanaGuardadaAhora) ? pestanaGuardadaAhora : 'resumen'
  const verResumen = pestana === 'resumen'
  const verLista = pestana === 'movimientos'
  const verCuentas = pestana === 'cuentas'
  const verPorVencer = pestana === 'porvencer'
  /** The badge: unpaid bills due in the next 30 days. */
  const porPagar = datosPorVencer ? porPagarEn30Dias(vencimientos(datosPorVencer, diaDeHoy), diaDeHoy).length : 0

  return (
    <div className={`marco ${enPanel !== undefined || enCuentas !== undefined ? 'con-panel' : ''}`}>
      <header className="barra">
        <span className="marca-texto">Finanzas del hogar</span>
        <nav className="selector-mes" aria-label="Mes">
          <button className="flecha" aria-label="Mes anterior" onClick={() => setMes(moverMes(mes, -1))}>
            ‹
          </button>
          <span className="mes-visible" aria-live="polite">
            <span key={mes} data-dir={direccion ?? undefined}>
              {mesLargo(mes)}
            </span>
          </span>
          <button
            className="flecha"
            aria-label="Mes siguiente"
            disabled={mes >= hoy}
            onClick={() => setMes(moverMes(mes, 1))}
          >
            ›
          </button>
        </nav>
        {verCuentas && (
          <span className="apagado saldos-de-hoy">
            Saldos al {Number(diaDeHoy.slice(8))} de {nombreDelMes(diaDeHoy.slice(0, 7))}
          </span>
        )}
        <span className="apagado correo">{usuario?.email}</span>
        <button className="secundario" onClick={() => void salir()}>
          Salir
        </button>
      </header>

      <main className="contenido">
        {/* The tabs and, on their right, the actions: in the page's flow, so
            they never cover a row. They stay mounted while a panel is open
            (CSS hides them) so the focus can come back on close. */}
        {(pestanas.length > 1 || movimientos || verCuentas) && (
          <div className="fila-de-pestanas">
            {pestanas.length > 1 && (
              <div className="pestanas" role="tablist" aria-label="Vista">
                {pestanas.map((p) => (
                  <button
                    key={p.id}
                    role="tab"
                    className="pestana"
                    aria-selected={pestana === p.id}
                    onClick={() => elegirPestana(p.id)}
                  >
                    {p.nombre}
                    {p.id === 'porvencer' && porPagar > 0 && <span className="insignia">{porPagar}</span>}
                  </button>
                ))}
              </div>
            )}
            {(movimientos || verCuentas) && (
              <div className="acciones-del-tablero" role="toolbar" aria-label="Acciones">
                {verCuentas && (
                  <>
                    <button className="secundario" disabled={!datosDeCuentas} onClick={() => abrirCuentas({ v: 'nueva' })}>
                      Nueva cuenta
                    </button>
                    <button className="secundario" disabled={!datosDeCuentas} onClick={() => abrirCuentas({ v: 'transferir' })}>
                      Transferir
                    </button>
                  </>
                )}
                {movimientos && facturas && (
                  <button className="secundario desde-factura" disabled={!lista} onClick={abrirFactura}>
                    Desde factura
                  </button>
                )}
                {movimientos && (
                  <button className="registrar" disabled={!lista} onClick={() => abrir(null)}>
                    + Registrar
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {error && <Fallo texto={error} alReintentar={reintentar} />}
        {!error && esqueleto && <Esqueleto mes={mes} conResumen={verResumen} conLista={verLista} />}
        {verResumen && resumen && !esqueleto && (
          <Contenido
            mes={mes}
            r={resumen}
            lista={listaDelMes}
            alElegirMovimiento={abrir}
            alAnadir={movimientos && lista ? anadir : undefined}
          />
        )}
        {verLista && errorDeLista && <Fallo texto={errorDeLista} alReintentar={reintentar} />}
        {verLista && !errorDeLista && listaDelMes && !esqueleto && (
          <ListaDeMovimientos
            mes={mes}
            datos={listaDelMes}
            alElegir={abrir}
            alDuplicar={duplicar}
            alBorrar={borrarDesdeLaLista}
            alVerFactura={
              movimientos?.factura
                ? (m, titulo) => {
                    abridor.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
                    if (m.reciboId) setViendoFactura({ reciboId: m.reciboId, titulo })
                  }
                : undefined
            }
          />
        )}
        {verCuentas && errorDeCuentas && <Fallo texto={errorDeCuentas} alReintentar={reintentar} />}
        {verCuentas && !errorDeCuentas && !datosDeCuentas && <p className="cargando">Cargando cuentas…</p>}
        {verPorVencer && errorPorVencer && <Fallo texto={errorPorVencer} alReintentar={reintentar} />}
        {verPorVencer && !errorPorVencer && !datosPorVencer && <p className="cargando">Cargando vencimientos…</p>}
        {verPorVencer && !errorPorVencer && datosPorVencer && (
          <PorVencer datos={datosPorVencer} hoy={diaDeHoy} alPagar={movimientos && lista ? pagar : undefined} />
        )}
        {verCuentas && !errorDeCuentas && datosDeCuentas && (
          <Cuentas
            datos={datosDeCuentas}
            seleccionada={enCuentas && 'id' in enCuentas ? enCuentas.id : null}
            alElegir={(id) => abrirCuentas({ v: 'detalle', id })}
          />
        )}
      </main>

      {movimientos && facturas && lista && factura !== null && (
        <DesdeFactura
          key={factura}
          datos={lista.datos}
          fuente={facturas}
          movimientos={movimientos}
          ahora={ahora}
          alCerrar={cerrarFactura}
        />
      )}

      {movimientos?.factura && viendoFactura && (
        <VisorDeFactura
          titulo={viendoFactura.titulo}
          cargar={() => movimientos.factura!(viendoFactura.reciboId)}
          alCerrar={() => {
            setViendoFactura(null)
            abridor.current?.focus()
          }}
        />
      )}

      {movimientos && lista && enPanel !== undefined && (
        <Panel
          key={aperturas}
          datos={lista.datos}
          original={enPanel}
          copia={copia}
          categoriaInicial={inicio?.categoria}
          busquedaInicial={inicio?.busqueda}
          montoInicial={inicio?.monto}
          cuentaInicial={inicio?.cuenta}
          comercioInicial={inicio?.comercio}
          fuente={movimientos}
          facturas={facturas}
          ahora={ahora}
          alCerrar={cerrar}
          alDuplicar={duplicar}
        />
      )}

      {cuentas && datosDeCuentas && enCuentas !== undefined && (
        <PanelDeCuenta
          datos={datosDeCuentas}
          vista={enCuentas}
          mes={mes}
          fuente={cuentas}
          alCambiarVista={setEnCuentas}
          alGuardar={recargar}
        />
      )}

      {anadido && (
        <div role="status" aria-label="Gasto añadido" className="aviso-flotante">
          <span>{anadido.error ?? 'Gasto añadido'}</span>
          <button type="button" className="secundario" onClick={() => void deshacer(anadido.id)}>
            {anadido.error ? 'Reintentar' : 'Deshacer'}
          </button>
        </div>
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
 * page at 1920px: top cards 128px, matrix and chart cards 287px, list search
 * 44px and rows 62px. Below 900px the grid is one column, as the real one.
 */
function Esqueleto({ mes, conResumen, conLista }: { mes: string; conResumen: boolean; conLista: boolean }) {
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
      {conResumen && (
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
      )}
      {conLista && (
        <div className="tarjeta movimientos" aria-hidden="true">
          <span className="skeleton skeleton--text sk-w30" style={{ ['--sk-line' as string]: '19px', marginBottom: 15 }} />
          <span className="skeleton" style={{ height: 44, marginBottom: 14 }} />
          {[65, 80, 50, 70].map((w, i) => (
            <span key={i} className={`skeleton skeleton--text sk-w${w}`} style={{ ['--sk-line' as string]: '62px' }} />
          ))}
        </div>
      )}
    </div>
  )
}

type Pestana = 'resumen' | 'movimientos' | 'cuentas' | 'porvencer'
const PESTANAS: { id: Pestana; nombre: string }[] = [
  { id: 'resumen', nombre: 'Resumen' },
  { id: 'movimientos', nombre: 'Movimientos' },
  { id: 'cuentas', nombre: 'Cuentas' },
  { id: 'porvencer', nombre: 'Por vencer' },
]
const CLAVE_DE_PESTANA = 'pestana-del-tablero'

/** The tab left open last time, in this browser; Resumen the first time. */
function pestanaGuardada(): Pestana {
  try {
    const guardada = localStorage.getItem(CLAVE_DE_PESTANA)
    return PESTANAS.some((p) => p.id === guardada) ? (guardada as Pestana) : 'resumen'
  } catch {
    return 'resumen'
  }
}

function guardarPestana(p: Pestana) {
  try {
    localStorage.setItem(CLAVE_DE_PESTANA, p)
  } catch {
    // Blocked storage (private window): the tab just is not remembered.
  }
}

/** Days before this one in a running month read as "Día N de M", not as a percentage. */
const DIAS_PARA_COMPARAR = 5

function diasDelMes(mes: string): number {
  const [a, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).getUTCDate()
}

function Contenido({
  mes,
  r,
  lista,
  alElegirMovimiento,
  alAnadir,
}: {
  mes: string
  r: ResumenDelMes
  lista: DatosDeMovimientos | null
  alElegirMovimiento: (m: FilaDeMovimiento) => void
  alAnadir?: (categoriaId: string | null) => void
}) {
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

      <PorCategoria
        mes={mes}
        categorias={r.porCategoria}
        filas={lista?.movimientos ?? null}
        categoriasDeMovimientos={lista?.categorias ?? []}
        alElegirMovimiento={alElegirMovimiento}
        alAnadir={alAnadir}
      />

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
