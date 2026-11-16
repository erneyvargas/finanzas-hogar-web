import { useEffect, useRef, useState } from 'react'
import { dinero, miles, nombreDelMes } from '../core/formato'
import { diaDe } from '../tablero/calculo'
import { EsqueletoDeMovimientosDeCuenta } from '../tablero/esqueletos'
import { useCargaVisible } from '../core/cargaVisible'
import { Cara } from '../movimientos/ListaDeMovimientos'
import { ErrorDelServidor, MENSAJE_GENERICO, leerMonto } from '../movimientos/reglas'
import type { FuenteDeCuentas, FuncionDeCuentas } from './fuente'
import { SelectorDeCuenta } from './SelectorDeCuenta'
import { descargarExcel, filasParaExcel, nombreDelArchivo } from './excel'
import { Ayuda } from '../core/ui/Ayuda'
import {
  ESTILOS,
  ETIQUETA,
  TIPOS_QUE_SE_CREAN,
  TIPOS_SIMPLES,
  accionesDe,
  conSigno,
  destinosPara,
  errorDeTarjeta,
  grupoDe,
  signoDe,
  textoDe,
  origenInicial,
  origenesConSaldo,
  puedeInvertir,
  vistaPrevia,
  leerReparto,
  type RepartoDeCuota,
  type CuentaConSaldo,
  type DatosDeCuentas,
  type MovimientoDeCuenta,
  type TipoDeCuenta,
  etiquetaDeCuenta,
  textoDeTasa,
} from './reglas'

/** What the accounts panel shows; `desde` is the account a form goes back to. */
export type VistaDeCuenta =
  | { v: 'detalle'; id: string }
  | { v: 'nueva' }
  | { v: 'transferir'; origen?: string; desde?: string; destino?: string; monto?: number }
  | { v: 'editar' | 'ajustar' | 'tipo' | 'gmf' | 'tasa' | 'estilo' | 'foto'; id: string }

const TITULOS: Record<Exclude<VistaDeCuenta['v'], 'detalle'>, string> = {
  nueva: 'Nueva cuenta',
  transferir: 'Transferir',
  editar: 'Editar cuenta',
  ajustar: 'Ajustar saldo',
  tipo: 'Cambiar tipo',
  gmf: '4x1000',
  tasa: 'Tasa de rendimiento',
  estilo: 'Estilo de tarjeta',
  foto: 'Foto',
}

const comoError = (e: unknown) => (e instanceof ErrorDelServidor ? e : new ErrorDelServidor(MENSAJE_GENERICO, null))
/** A day field: a whole number, or null when blank. */
const leerDia = (t: string) => (t.trim() ? Number(t.trim()) : null)
/** A money field: a number, or null when blank. */
const leerOpcional = (t: string) => (t.trim() ? leerMonto(t) : null)

/**
 * The side panel of the «Cuentas» tab: an account's balance, its month
 * movements and its actions, and the forms to create, edit, adjust and
 * transfer. Every write is a 0048 server function; a rejection is shown
 * here and the panel stays open. [alGuardar] asks the page to reload.
 */
export function PanelDeCuenta({
  datos,
  vista,
  mes,
  fuente,
  alCambiarVista,
  alGuardar,
}: {
  datos: DatosDeCuentas
  vista: VistaDeCuenta
  mes: string
  fuente: FuenteDeCuentas
  /** `undefined` closes the panel. */
  alCambiarVista: (v: VistaDeCuenta | undefined) => void
  alGuardar: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const cuenta = 'id' in vista ? datos.cuentas.find((c) => c.id === vista.id) : undefined
  const desde = vista.v === 'transferir' ? vista.desde : vista.v === 'detalle' || vista.v === 'nueva' ? undefined : vista.id
  const volver = () => {
    setError(null)
    alCambiarVista(desde ? { v: 'detalle', id: desde } : undefined)
  }

  // An account that is gone (deleted elsewhere) closes its panel.
  const falta = 'id' in vista && !cuenta
  useEffect(() => {
    if (falta) alCambiarVista(undefined)
  }, [falta, alCambiarVista])

  // Escape closes, like the ✕, but not while a save is on its way.
  const cerrarRef = useRef(() => {})
  cerrarRef.current = () => {
    if (!guardando) alCambiarVista(undefined)
  }
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrarRef.current()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [])

  /** Runs the calls in order; on success reloads and goes [despues]. */
  async function correr(llamadas: [FuncionDeCuentas, Record<string, unknown>][], despues: VistaDeCuenta | undefined) {
    setGuardando(true)
    setError(null)
    try {
      for (const [f, p] of llamadas) await fuente.ejecutar(f, p)
      alGuardar()
      alCambiarVista(despues)
    } catch (e) {
      setError(comoError(e).message)
    } finally {
      setGuardando(false)
    }
  }
  const base = { p_household_id: datos.hogarId }
  const deCuenta = (c: CuentaConSaldo) => ({ ...base, p_account_id: c.id })
  const comun = { error, setError, guardando, correr, volver }

  if (falta) return null
  const titulo = vista.v === 'detalle' ? cuenta!.nombre : TITULOS[vista.v]

  return (
    <aside className="panel panel-de-cuenta" role="dialog" aria-labelledby="t-cuenta">
      <div className="panel-cabeza">
        <h2 id="t-cuenta">{titulo}</h2>
        <button className="flecha" aria-label="Cerrar" onClick={() => alCambiarVista(undefined)}>
          ✕
        </button>
      </div>
      {vista.v === 'detalle' && (
        <Detalle
          c={cuenta!}
          datos={datos}
          mes={mes}
          fuente={fuente}
          {...comun}
          alIr={(v) => {
            setError(null)
            alCambiarVista(v)
          }}
          alAccion={(f) => void correr([[f, deCuenta(cuenta!)]], vista)}
        />
      )}
      {vista.v === 'nueva' && <NuevaCuenta {...comun} base={base} />}
      {vista.v === 'editar' && <Editar {...comun} c={cuenta!} base={deCuenta(cuenta!)} />}
      {vista.v === 'ajustar' && <Ajustar {...comun} c={cuenta!} base={deCuenta(cuenta!)} />}
      {vista.v === 'tipo' && <CambiarTipo {...comun} c={cuenta!} base={deCuenta(cuenta!)} />}
      {vista.v === 'gmf' && <Gmf {...comun} c={cuenta!} base={deCuenta(cuenta!)} datos={datos} />}
      {vista.v === 'tasa' && <Tasa {...comun} c={cuenta!} base={deCuenta(cuenta!)} />}
      {vista.v === 'estilo' && <Estilo {...comun} c={cuenta!} base={deCuenta(cuenta!)} />}
      {vista.v === 'foto' && (
        <Foto {...comun} c={cuenta!} base={deCuenta(cuenta!)} fuente={fuente} setGuardando={setGuardando} alGuardar={alGuardar} />
      )}
      {vista.v === 'transferir' && <Transferir {...comun} datos={datos} vista={vista} base={base} fuente={fuente} />}
    </aside>
  )
}

interface Comun {
  error: string | null
  setError: (e: string | null) => void
  guardando: boolean
  correr: (llamadas: [FuncionDeCuentas, Record<string, unknown>][], despues: VistaDeCuenta | undefined) => Promise<void>
  volver: () => void
}

function Aviso({ texto }: { texto: string | null }) {
  return texto ? (
    <div role="alert" className="aviso">
      <span>{texto}</span>
    </div>
  ) : null
}

/** Save and Volver at the bottom of a form. */
function Pie({ texto, guardando, volver, conVolver = true }: { texto: string; guardando: boolean; volver: () => void; conVolver?: boolean }) {
  return (
    <div className="acciones pie">
      <button type="submit" className="guardar" disabled={guardando}>
        {texto}
      </button>
      {conVolver && (
        <button type="button" className="secundario" disabled={guardando} onClick={volver}>
          Volver
        </button>
      )}
    </div>
  )
}

function Detalle({
  c,
  datos,
  mes,
  fuente,
  error,
  guardando,
  alIr,
  alAccion,
}: Comun & {
  c: CuentaConSaldo
  datos: DatosDeCuentas
  mes: string
  fuente: FuenteDeCuentas
  alIr: (v: VistaDeCuenta) => void
  alAccion: (f: FuncionDeCuentas) => void
}) {
  const [movs, setMovs] = useState<{ clave: string; filas: MovimientoDeCuenta[] } | null>(null)
  const [fallo, setFallo] = useState(false)
  const [menu, setMenu] = useState(false)
  const [archivando, setArchivando] = useState(false)
  const clave = `${c.id}|${mes}|${c.saldo}`
  useEffect(() => {
    let vivo = true
    setFallo(false)
    fuente
      .movimientos(c.id, mes)
      .then((filas) => vivo && setMovs({ clave, filas }))
      .catch(() => vivo && setFallo(true))
    return () => {
      vivo = false
    }
  }, [fuente, c.id, mes, clave])
  const a = accionesDe(c)
  const puedeSalir = origenesConSaldo(datos.cuentas).some((o) => o.id === c.id)
  const nombre = (id: string | null) => datos.cuentas.find((x) => x.id === id)?.nombre ?? 'otra cuenta'
  const filas = movs?.clave === clave ? movs.filas : null
  const esqueleto = useCargaVisible(!fallo && !filas)
  // The month's movements as an .xlsx, the balance running back from the month's end.
  const [exportando, setExportando] = useState(false)
  const [falloExcel, setFalloExcel] = useState<string | null>(null)
  async function exportar() {
    if (!filas || !fuente.saldoAl) return
    setExportando(true)
    setFalloExcel(null)
    try {
      const saldoFinal = await fuente.saldoAl(c.id, mes)
      await descargarExcel(filasParaExcel(filas, c, saldoFinal, nombre), nombreDelArchivo(c.nombre, mes))
    } catch {
      setFalloExcel('No se pudo preparar el Excel. Intenta de nuevo.')
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="panel-cuerpo">
      <div className="cabeza-de-cuenta">
        <Cara nombre={c.nombre} foto={c.foto} clase="cara enorme" />
        <div>
          <small className="apagado">
            {etiquetaDeCuenta(c)}
            {c.archivada ? ' · Archivada' : ''}
          </small>
          <div className={`saldo-grande num ${grupoDe(c) === 'credito' && c.saldo < 0 ? 'gasto' : ''}`}>{conSigno(c.saldo)}</div>
        </div>
      </div>

      <div className="acciones">
        {a.transferir && puedeSalir && (
          <button type="button" className="secundario" onClick={() => alIr({ v: 'transferir', origen: c.id, desde: c.id })}>
            Transferir
          </button>
        )}
        {a.editar && (
          <button type="button" className="secundario" onClick={() => alIr({ v: 'editar', id: c.id })}>
            Editar
          </button>
        )}
        {a.ajustar && (
          <button type="button" className="secundario" onClick={() => alIr({ v: 'ajustar', id: c.id })}>
            Ajustar saldo
          </button>
        )}
        {a.desarchivar && (
          <button type="button" className="secundario" disabled={guardando} onClick={() => alAccion('desarchivar_cuenta')}>
            Desarchivar
          </button>
        )}
        {!c.archivada && (
          <button type="button" className="secundario" aria-label="Más acciones" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            ⋯
          </button>
        )}
      </div>

      {menu && (
        <div className="menu-de-cuenta" role="group" aria-label="Más acciones de la cuenta">
          {a.principal && (
            <button type="button" disabled={guardando} onClick={() => alAccion('marcar_cuenta_principal')}>
              Marcar como principal
            </button>
          )}
          {a.cambiarTipo && <button type="button" onClick={() => alIr({ v: 'tipo', id: c.id })}>Cambiar tipo</button>}
          {a.gmf && <button type="button" onClick={() => alIr({ v: 'gmf', id: c.id })}>4x1000</button>}
          {a.tasa && <button type="button" onClick={() => alIr({ v: 'tasa', id: c.id })}>Tasa de rendimiento</button>}
          {a.estilo && <button type="button" onClick={() => alIr({ v: 'estilo', id: c.id })}>Estilo de tarjeta</button>}
          {a.foto && <button type="button" onClick={() => alIr({ v: 'foto', id: c.id })}>Foto</button>}
          {fuente.saldoAl && (
            <button type="button" disabled={!filas || filas.length === 0 || exportando} onClick={() => void exportar()}>
              {exportando ? 'Preparando Excel…' : 'Descargar Excel'}
            </button>
          )}
          {a.archivar && (
            <button type="button" className="texto-peligro" onClick={() => setArchivando(true)}>
              Archivar
            </button>
          )}
        </div>
      )}

      {archivando && a.archivar && (
        <div className="confirmar">
          <span>¿Archivar «{c.nombre}»? Su saldo tiene que estar en cero.</span>
          <button type="button" className="peligro" disabled={guardando} onClick={() => alAccion('archivar_cuenta')}>
            Sí, archivar
          </button>
          <button type="button" className="secundario" disabled={guardando} onClick={() => setArchivando(false)}>
            Cancelar
          </button>
        </div>
      )}

      <Aviso texto={error ?? falloExcel} />

      <div>
        <h3 className="rotulo">Movimientos de {nombreDelMes(mes)}</h3>
        {fallo && <p className="error">No se pudieron cargar los movimientos.</p>}
        {!fallo && esqueleto && <EsqueletoDeMovimientosDeCuenta mes={nombreDelMes(mes)} />}
        {filas && !esqueleto && filas.length === 0 && <p className="nota">Sin movimientos este mes.</p>}
        {filas && !esqueleto && filas.length > 0 && (
          <ul className="movs-de-cuenta" aria-label={`Movimientos de ${nombreDelMes(mes)}`}>
            {filas.map((m) => {
              const signo = signoDe(m, c.id)
              return (
                <li key={m.id}>
                  <span className="dia-de-mov num">{Number(diaDe(m.fecha).slice(8))}</span>
                  <span className="que">{textoDe(m, c.id, nombre)}</span>
                  <span className={`num ${signo > 0 ? 'ingreso' : 'gasto'}`}>
                    {signo > 0 ? '+' : '−'}
                    {dinero(m.monto)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Cupo, cut day and due day of a card, shared by Nueva cuenta and Editar. */
function CamposDeTarjeta({
  cupo,
  corte,
  pago,
  set,
}: {
  cupo: string
  corte: string
  pago: string
  set: (campo: 'cupo' | 'corte' | 'pago', valor: string) => void
}) {
  return (
    <>
      <div className="campo">
        <label htmlFor="c-cupo">Cupo</label>
        <input id="c-cupo" className="num" inputMode="decimal" autoComplete="off" placeholder="Opcional" value={cupo} onChange={(e) => set('cupo', e.target.value)} />
      </div>
      <div className="dos-columnas">
        <div className="campo">
          <label htmlFor="c-corte">Día de corte</label>
          <input id="c-corte" className="num" inputMode="numeric" autoComplete="off" value={corte} onChange={(e) => set('corte', e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="c-pago">Día de pago</label>
          <input id="c-pago" className="num" inputMode="numeric" autoComplete="off" value={pago} onChange={(e) => set('pago', e.target.value)} />
        </div>
      </div>
    </>
  )
}

function NuevaCuenta({ error, setError, guardando, correr, volver, base }: Comun & { base: Record<string, unknown> }) {
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoDeCuenta>('cash')
  const [saldo, setSaldo] = useState('')
  const [tarjeta, setTarjeta] = useState({ cupo: '', corte: '', pago: '' })
  // Fixed when the form opens: a retry after a lost answer cannot create it twice.
  const [id] = useState(() => crypto.randomUUID())
  const esTarjeta = tipo === 'credit_card'

  function crear() {
    const limpio = nombre.trim()
    if (!limpio) return setError('La cuenta necesita nombre')
    const apertura = saldo.trim() ? leerMonto(saldo) : 0
    if (Number.isNaN(apertura)) return setError('El saldo inicial tiene que ser un número')
    const cupo = esTarjeta ? leerOpcional(tarjeta.cupo) : null
    const corte = esTarjeta ? leerDia(tarjeta.corte) : null
    const pago = esTarjeta ? leerDia(tarjeta.pago) : null
    if (esTarjeta) {
      const falla = errorDeTarjeta(cupo, corte, pago)
      if (falla) return setError(falla)
    }
    void correr(
      [
        [
          'crear_cuenta',
          {
            ...base,
            p_name: limpio,
            p_type: tipo,
            p_opening_balance: apertura,
            p_credit_limit: cupo,
            p_cut_day: corte,
            p_due_day: pago,
            p_id: id,
          },
        ],
      ],
      undefined,
    )
  }

  return (
    <form
      className="panel-cuerpo"
      onSubmit={(e) => {
        e.preventDefault()
        crear()
      }}
    >
      <div className="campo">
        <label htmlFor="c-nombre">Nombre</label>
        <input id="c-nombre" autoComplete="off" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      <div className="campo">
        <label htmlFor="c-tipo">Tipo</label>
        <select id="c-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeCuenta)}>
          {TIPOS_QUE_SE_CREAN.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA[t]}
            </option>
          ))}
        </select>
        <span className="nota">Un préstamo o un por cobrar se crea desde Deudas.</span>
      </div>
      <div className="campo">
        <label htmlFor="c-saldo">{esTarjeta ? 'Deuda actual' : 'Saldo inicial'}</label>
        <input id="c-saldo" className="num" inputMode="decimal" autoComplete="off" placeholder="0" value={saldo} onChange={(e) => setSaldo(e.target.value)} />
      </div>
      {esTarjeta && <CamposDeTarjeta {...tarjeta} set={(k, v) => setTarjeta({ ...tarjeta, [k]: v })} />}
      <Aviso texto={error} />
      <Pie texto="Crear cuenta" guardando={guardando} volver={volver} conVolver={false} />
    </form>
  )
}

function Editar({ c, base, error, setError, guardando, correr, volver }: Comun & { c: CuentaConSaldo; base: Record<string, unknown> }) {
  const esTarjeta = c.tipo === 'credit_card'
  const [nombre, setNombre] = useState(c.nombre)
  const [tarjeta, setTarjeta] = useState({
    cupo: c.cupo == null ? '' : miles(c.cupo),
    corte: c.diaDeCorte == null ? '' : String(c.diaDeCorte),
    pago: c.diaDePago == null ? '' : String(c.diaDePago),
  })

  function guardar() {
    const limpio = nombre.trim()
    if (!limpio) return setError('La cuenta necesita nombre')
    const llamadas: [FuncionDeCuentas, Record<string, unknown>][] = []
    if (limpio !== c.nombre) llamadas.push(['renombrar_cuenta', { ...base, p_name: limpio }])
    if (esTarjeta) {
      const cupo = leerOpcional(tarjeta.cupo)
      const corte = leerDia(tarjeta.corte)
      const pago = leerDia(tarjeta.pago)
      const falla = errorDeTarjeta(cupo, corte, pago)
      if (falla) return setError(falla)
      if (cupo !== c.cupo || corte !== c.diaDeCorte || pago !== c.diaDePago) {
        llamadas.push(['editar_tarjeta', { ...base, p_credit_limit: cupo, p_cut_day: corte, p_due_day: pago }])
      }
    }
    if (llamadas.length === 0) return volver()
    void correr(llamadas, { v: 'detalle', id: c.id })
  }

  return (
    <form
      className="panel-cuerpo"
      onSubmit={(e) => {
        e.preventDefault()
        guardar()
      }}
    >
      <div className="campo">
        <label htmlFor="c-nombre">Nombre</label>
        <input id="c-nombre" autoComplete="off" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      {esTarjeta && <CamposDeTarjeta {...tarjeta} set={(k, v) => setTarjeta({ ...tarjeta, [k]: v })} />}
      <Aviso texto={error} />
      <Pie texto="Guardar cambios" guardando={guardando} volver={volver} />
    </form>
  )
}

function Ajustar({ c, base, error, setError, guardando, correr, volver }: Comun & { c: CuentaConSaldo; base: Record<string, unknown> }) {
  // It starts blank, as on the phone: prefilling it would suggest the wrong figure.
  const [real, setReal] = useState('')
  const [id] = useState(() => crypto.randomUUID())
  return (
    <form
      className="panel-cuerpo"
      onSubmit={(e) => {
        e.preventDefault()
        const valor = leerMonto(real)
        if (Number.isNaN(valor)) return setError('Falta el saldo real de la cuenta')
        void correr([['ajustar_saldo_de_cuenta', { ...base, p_saldo_real: valor, p_id: id }]], { v: 'detalle', id: c.id })
      }}
    >
      <p className="nota">
        En la app, {c.nombre} tiene <b className="num">{conSigno(c.saldo)}</b>. Escribe lo que hay de verdad: la diferencia queda como
        un ajuste de saldo.
      </p>
      <div className="campo">
        <label htmlFor="c-real">Saldo real</label>
        <input id="c-real" className="num" inputMode="decimal" autoComplete="off" autoFocus value={real} onChange={(e) => setReal(e.target.value)} />
      </div>
      <Aviso texto={error} />
      <Pie texto="Ajustar" guardando={guardando} volver={volver} />
    </form>
  )
}

function CambiarTipo({ c, base, error, guardando, correr, volver }: Comun & { c: CuentaConSaldo; base: Record<string, unknown> }) {
  // The principal stays a current account that can pay (cambiar_tipo_de_cuenta).
  const tipos = TIPOS_SIMPLES.filter((t) => t !== c.tipo && (!c.principal || (grupoDe({ tipo: t }) === 'corriente' && t !== 'voucher')))
  const [tipo, setTipo] = useState<TipoDeCuenta>(tipos[0] ?? c.tipo)
  return (
    <form
      className="panel-cuerpo"
      onSubmit={(e) => {
        e.preventDefault()
        void correr([['cambiar_tipo_de_cuenta', { ...base, p_type: tipo }]], { v: 'detalle', id: c.id })
      }}
    >
      <div className="campo">
        <label htmlFor="c-tipo-nuevo">Tipo nuevo</label>
        <select id="c-tipo-nuevo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeCuenta)}>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA[t]}
            </option>
          ))}
        </select>
      </div>
      <Aviso texto={error} />
      <Pie texto="Cambiar tipo" guardando={guardando} volver={volver} />
    </form>
  )
}

function Gmf({ c, base, datos, error, setError, guardando, correr, volver }: Comun & { c: CuentaConSaldo; base: Record<string, unknown>; datos: DatosDeCuentas }) {
  const sugerida = datos.categoriasDeGasto.find((x) => /4x1000|gmf/i.test(x.ruta))?.id ?? ''
  const [categoria, setCategoria] = useState(c.categoriaGmf ?? sugerida)
  const actual = datos.categoriasDeGasto.find((x) => x.id === c.categoriaGmf)
  const detalle = { v: 'detalle' as const, id: c.id }
  if (c.cobraGmf) {
    return (
      <div className="panel-cuerpo">
        <p className="nota">
          {c.nombre} cobra 4x1000{actual ? ` en «${actual.ruta}»` : ''}. Apagarlo no toca los cargos de antes.
        </p>
        <Aviso texto={error} />
        <div className="acciones pie">
          <button
            type="button"
            className="guardar"
            disabled={guardando}
            onClick={() => void correr([['cambiar_gmf_de_cuenta', { ...base, p_cobra: false, p_category_id: null }]], detalle)}
          >
            Dejar de cobrar 4x1000
          </button>
          <button type="button" className="secundario" disabled={guardando} onClick={volver}>
            Volver
          </button>
        </div>
      </div>
    )
  }
  return (
    <form
      className="panel-cuerpo"
      onSubmit={(e) => {
        e.preventDefault()
        if (!categoria) return setError('Para cobrar 4x1000 hace falta la categoría del cargo')
        void correr([['cambiar_gmf_de_cuenta', { ...base, p_cobra: true, p_category_id: categoria }]], detalle)
      }}
    >
      <p className="nota">Registra el 0,4 % de cada salida de {c.nombre} como un gasto.</p>
      <div className="campo">
        <label htmlFor="c-gmf">Categoría del cargo</label>
        <select id="c-gmf" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Elige una categoría</option>
          {datos.categoriasDeGasto.map((x) => (
            <option key={x.id} value={x.id}>
              {x.ruta}
            </option>
          ))}
        </select>
      </div>
      <Aviso texto={error} />
      <Pie texto="Cobrar 4x1000" guardando={guardando} volver={volver} />
    </form>
  )
}

/** «9,35» → 0.0935; empty → null; undefined when it is not a valid rate. */
function tasaDesdeTexto(texto: string): number | null | undefined {
  const limpio = texto.replace('%', '').replace(',', '.').trim()
  if (limpio === '') return null
  const porcentaje = Number(limpio)
  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje >= 100) return undefined
  return Math.round(porcentaje * 100) / 10000
}

function Tasa({ c, base, error, setError, guardando, correr, volver }: Comun & { c: CuentaConSaldo; base: Record<string, unknown> }) {
  const [texto, setTexto] = useState(c.tasaAnual == null ? '' : textoDeTasa(c.tasaAnual))
  return (
    <form
      className="panel-cuerpo"
      onSubmit={(e) => {
        e.preventDefault()
        const tasa = tasaDesdeTexto(texto)
        if (tasa === undefined) return setError('Escribe la tasa como 9,35, entre 0% y 100%')
        void correr([['cambiar_tasa_de_cuenta', { ...base, p_tasa: tasa }]], { v: 'detalle', id: c.id })
      }}
    >
      <p className="nota">
        Cada mes se suma a {c.nombre} lo que rindió. No cuenta como plata disponible hasta que la transfieras. Déjalo vacío si no rinde.
      </p>
      <div className="campo">
        <label htmlFor="c-tasa">Tasa efectiva anual (%)</label>
        <input id="c-tasa" inputMode="decimal" placeholder="9,35" value={texto} onChange={(e) => setTexto(e.target.value)} />
      </div>
      <Aviso texto={error} />
      <Pie texto="Guardar tasa" guardando={guardando} volver={volver} />
    </form>
  )
}

function Estilo({ c, base, error, guardando, correr, volver }: Comun & { c: CuentaConSaldo; base: Record<string, unknown> }) {
  const [estilo, setEstilo] = useState(c.estilo ?? '')
  return (
    <form
      className="panel-cuerpo"
      onSubmit={(e) => {
        e.preventDefault()
        void correr([['cambiar_estilo_de_tarjeta', { ...base, p_style: estilo || null }]], { v: 'detalle', id: c.id })
      }}
    >
      <div className="campo">
        <label htmlFor="c-estilo">Estilo</label>
        <select id="c-estilo" value={estilo} onChange={(e) => setEstilo(e.target.value)}>
          <option value="">Automático</option>
          {ESTILOS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </select>
      </div>
      <Aviso texto={error} />
      <Pie texto="Guardar estilo" guardando={guardando} volver={volver} />
    </form>
  )
}

function Foto({
  c,
  base,
  fuente,
  error,
  setError,
  guardando,
  setGuardando,
  volver,
  alGuardar,
}: Comun & {
  c: CuentaConSaldo
  base: Record<string, unknown>
  fuente: FuenteDeCuentas
  setGuardando: (g: boolean) => void
  alGuardar: () => void
}) {
  const anterior = c.rutaDeFoto
  async function poner(archivo: File) {
    setGuardando(true)
    setError(null)
    try {
      const ruta = await fuente.subirFoto(base.p_household_id as string, c.id, archivo)
      await fuente.ejecutar('cambiar_foto_de_cuenta', { ...base, p_image_path: ruta })
      // The old file goes only after the new one is stored, as on the phone.
      if (anterior) await fuente.borrarFoto(anterior)
      alGuardar()
      volver()
    } catch (e) {
      setError(comoError(e).message)
    } finally {
      setGuardando(false)
    }
  }
  async function quitar(ruta: string) {
    setGuardando(true)
    setError(null)
    try {
      await fuente.ejecutar('cambiar_foto_de_cuenta', { ...base, p_image_path: null })
      // The row is cleared first: the file goes only once nothing points to it.
      await fuente.borrarFoto(ruta)
      alGuardar()
      volver()
    } catch (e) {
      setError(comoError(e).message)
    } finally {
      setGuardando(false)
    }
  }
  return (
    <div className="panel-cuerpo">
      <Cara nombre={c.nombre} foto={c.foto} clase="cara enorme" />
      <div className="campo">
        <label htmlFor="c-foto">Elegir foto</label>
        <input
          id="c-foto"
          type="file"
          accept="image/*"
          disabled={guardando}
          onChange={(e) => {
            const archivo = e.target.files?.[0]
            if (archivo) void poner(archivo)
          }}
        />
      </div>
      <Aviso texto={error} />
      <div className="acciones pie">
        {anterior && (
          <button
            type="button"
            className="secundario"
            disabled={guardando}
            onClick={() => void quitar(anterior)}
          >
            Quitar foto
          </button>
        )}
        <button type="button" className="secundario" disabled={guardando} onClick={volver}>
          Volver
        </button>
      </div>
    </div>
  )
}

function Transferir({
  datos,
  vista,
  base,
  error,
  setError,
  guardando,
  correr,
  volver,
  fuente,
}: Comun & {
  datos: DatosDeCuentas
  vista: { origen?: string; desde?: string; destino?: string; monto?: number }
  base: Record<string, unknown>
  fuente: FuenteDeCuentas
}) {
  const origenes = origenesConSaldo(datos.cuentas)
  const primero = (o: CuentaConSaldo | undefined) => (o ? destinosPara(o, datos.cuentas).find((d) => !d.motivo)?.cuenta.id ?? '' : '')
  const [origenId, setOrigenId] = useState(() => origenInicial(origenes, vista.origen)?.id ?? '')
  const origen = origenes.find((o) => o.id === origenId)
  const destinos = origen ? destinosPara(origen, datos.cuentas) : []
  const [destinoElegido, setDestinoId] = useState(() =>
    origen && vista.destino && destinosPara(origen, datos.cuentas).some((d) => d.cuenta.id === vista.destino && !d.motivo)
      ? vista.destino
      : primero(origen),
  )
  // A destination the new source cannot reach is cleared: the user picks again.
  const destinoId = destinos.some((d) => d.cuenta.id === destinoElegido && !d.motivo) ? destinoElegido : ''
  const destino = datos.cuentas.find((c) => c.id === destinoId)
  const cambiarOrigen = (id: string) => {
    setOrigenId(id)
    const nuevo = origenes.find((o) => o.id === id)
    if (nuevo && !destinosPara(nuevo, datos.cuentas).some((d) => d.cuenta.id === destinoElegido && !d.motivo)) setDestinoId('')
  }
  const [montoTexto, setMontoTexto] = useState(() => (vista.monto && vista.monto > 0 ? miles(vista.monto) : ''))
  const [id] = useState(() => crypto.randomUUID())
  const monto = leerMonto(montoTexto)
  const hayMonto = Number.isFinite(monto) && monto > 0
  // A loan destination is an installment, as on the phone: its split is
  // previewed while typing and it is paid with pagar_cuota_de_prestamo.
  const esCuota = destino?.tipo === 'liability'
  const [reparto, setReparto] = useState<{ clave: string; r: RepartoDeCuota } | null>(null)
  const clave = `${destinoId}|${monto}`
  useEffect(() => {
    if (!esCuota || !hayMonto) return
    let vivo = true
    const t = window.setTimeout(() => {
      fuente
        .ejecutar('reparto_de_cuota', { ...base, p_destino_id: destinoId, p_amount: monto })
        .then((r) => {
          const leido = leerReparto(r)
          if (vivo && leido) setReparto({ clave, r: leido })
        })
        .catch(() => {
          // No preview is not worth an error: saving still answers.
        })
    }, 250)
    return () => {
      vivo = false
      window.clearTimeout(t)
    }
    // base is rebuilt each render; the household does not change here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esCuota, hayMonto, destinoId, monto, clave, fuente])
  const partida = esCuota && hayMonto && reparto?.clave === clave ? reparto.r : null
  const previa =
    origen && destino && hayMonto && (!esCuota || partida) ? vistaPrevia(origen, destino, monto, partida?.capital) : null

  if (!origen) return <p className="nota">No tienes cuentas entre las que transferir.</p>

  return (
    <form
      className="panel-cuerpo"
      onSubmit={(e) => {
        e.preventDefault()
        if (!hayMonto) return setError('Una transferencia en cero no mueve nada')
        if (!destino) return setError('Elige a qué cuenta va la plata')
        void correr(
          [
            [
              esCuota ? 'pagar_cuota_de_prestamo' : 'registrar_transferencia',
              { ...base, p_origen_id: origen.id, p_destino_id: destino.id, p_amount: monto, p_id: id },
            ],
          ],
          vista.desde ? { v: 'detalle', id: vista.desde } : undefined,
        )
      }}
    >
      <div className="cabecera-monto">
        <label htmlFor="t-monto">{esCuota ? 'Cuota del préstamo' : 'Monto'}</label>
        <div className="monto">
          <span aria-hidden="true">$</span>
          <input
            id="t-monto"
            className="num"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            style={{ width: `${Math.max(1, montoTexto.length) + 0.3}ch` }}
            value={montoTexto}
            onChange={(e) => setMontoTexto(e.target.value)}
          />
        </div>
      </div>
      <div className="campo">
        <SelectorDeCuenta
          etiqueta="De"
          opciones={origenes.map((o) => ({ id: o.id, nombre: o.nombre, foto: o.foto, detalle: conSigno(o.saldo) }))}
          valor={origenId}
          alElegir={cambiarOrigen}
        />
      </div>
      {destino && puedeInvertir(origen, destino) && origenes.some((o) => o.id === destino.id) && (
        <Ayuda texto="Invertir">
          <button
            type="button"
            className="intercambio"
            aria-label="Invertir"
            onClick={() => {
              setOrigenId(destino.id)
              setDestinoId(origen.id)
            }}
          >
            ⇅
          </button>
        </Ayuda>
      )}
      <div className="campo">
        <SelectorDeCuenta
          etiqueta="A"
          opciones={destinos.map((d) => ({
            id: d.cuenta.id,
            nombre: d.cuenta.nombre,
            foto: d.cuenta.foto,
            detalle: conSigno(d.cuenta.saldo),
            motivo: d.motivo,
          }))}
          valor={destinoId}
          alElegir={setDestinoId}
        />
      </div>
      {esCuota &&
        (partida ? (
          <div className="reparto-de-cuota" role="group" aria-label="Cómo se parte la cuota">
            <div className="barra-de-cuota" aria-hidden="true">
              <span className="capital" style={{ flexGrow: Math.max(partida.capital, 0) }} />
              <span className="interes" style={{ flexGrow: partida.interes }} />
            </div>
            <div className="tramos num">
              <div>
                <span>Capital</span>
                <b>{dinero(partida.capital)}</b>
              </div>
              <div>
                <span>Intereses</span>
                <b>{dinero(partida.interes)}</b>
              </div>
            </div>
          </div>
        ) : (
          <p className="nota centrada">La cuota se parte en capital, que baja la deuda, e intereses, que son gasto.</p>
        ))}
      {partida?.insuficiente && (
        <Aviso
          texto={`Este abono no cubre los intereses del mes. La deuda subiría ${dinero(partida.interesDelMes - monto)}.`}
        />
      )}
      {previa && destino && (
        <div className="antes-despues num" aria-label="Cómo quedan">
          <div>
            <span>{origen.nombre} queda</span>
            <b>{conSigno(previa.origen)}</b>
          </div>
          <div>
            <span>{destino.nombre} queda</span>
            <b>{conSigno(previa.destino)}</b>
          </div>
          {previa.gmf > 0 && <small className="apagado">Incluye el 4x1000: {dinero(previa.gmf)}</small>}
        </div>
      )}
      <Aviso texto={error} />
      <Pie
        texto={
          esCuota ? (hayMonto ? `Pagar cuota ${dinero(monto)}` : 'Pagar cuota') : hayMonto ? `Transferir ${dinero(monto)}` : 'Transferir'
        } guardando={guardando} volver={volver} conVolver={!!vista.desde} />
    </form>
  )
}
