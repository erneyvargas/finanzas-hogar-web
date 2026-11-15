import { useEffect, useState } from 'react'
import { guardarEnLaPestana, leerDeLaPestana } from '../core/recordado'
import { festivoDe } from '../core/festivos'
import { colorDe, dinero, MESES, nombreDelMes } from '../core/formato'
import { diaDe } from '../tablero/calculo'
import { alternar, arbolDeGastos, dentroDelRango, pasaLaSeleccion, plano, textoDelRango, tocarDia, type Rango } from './filtros'
import { FiltrosDelMes } from './FiltrosDelMes'
import { MenuDeFila } from './MenuDeFila'
import { rutaDeCategoria, type DatosDeMovimientos, type FilaDeMovimiento } from './reglas'

/**
 * The account's face: its photo when it has one, else its initials on a
 * tile, as the phone shows it without a logo.
 */
export function Cara({ nombre, foto, clase = 'cara' }: { nombre: string; foto?: string | null; clase?: string }) {
  const [rota, setRota] = useState(false)
  if (foto && !rota) {
    return <img className={clase} src={foto} alt="" aria-hidden="true" onError={() => setRota(true)} />
  }
  const iniciales = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
  return (
    <span className={clase} aria-hidden="true">
      {iniciales || '·'}
    </span>
  )
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/** `Martes 27 oct` for a `YYYY-MM-DD` day. */
/** Saturday, Sunday or a Colombian holiday. */
function esDiaNoHabil(dia: string) {
  const [a, m, d] = dia.split('-').map(Number)
  const semana = new Date(Date.UTC(a, m - 1, d)).getUTCDay()
  return semana === 0 || semana === 6 || festivoDe(dia) !== undefined
}

function tituloDelDia(dia: string) {
  const [a, m, d] = dia.split('-').map(Number)
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d} ${MESES[m - 1].slice(0, 3)}`
}

type Filtro = 'todos' | 'expense' | 'income'

const CLAVE_DE_FILTROS = 'filtros-de-movimientos'
interface FiltrosGuardados {
  mes: string
  busqueda: string
  filtro: Filtro
  seleccion: string[]
  rango: Rango | null
  recientesPrimero: boolean
}
const FILTROS: { id: Filtro; nombre: string }[] = [
  { id: 'todos', nombre: 'Todos' },
  { id: 'expense', nombre: 'Gastos' },
  { id: 'income', nombre: 'Ingresos' },
]

/** `−$7.600 · +$100.000`, leaving out a side that is zero. */
function sumas(gastos: number, ingresos: number) {
  return (
    <>
      {gastos > 0 && <b className="gasto num">−{dinero(gastos)}</b>}
      {gastos > 0 && ingresos > 0 && ' · '}
      {ingresos > 0 && <b className="ingreso num">+{dinero(ingresos)}</b>}
    </>
  )
}

interface Linea {
  fila: FilaDeMovimiento
  titulo: string
  detalle: string
  color: string | null
  cuenta: string
  foto?: string | null
  /** The rubro the movement hangs from, for the face at the start of the row. */
  rubro: { nombre: string; foto?: string | null } | null
  buscable: string
}

/**
 * The month's movements by day, newest first (option A of the list
 * proposals), with a search, a kind filter and the sums of what shows.
 * Transfers are not loaded, same as the phone's Inicio. Clicking one
 * opens it to correct. On the left, [FiltrosDelMes] narrows it by days and
 * by rubro or category.
 */
export function ListaDeMovimientos({
  mes,
  datos,
  alElegir,
  alDuplicar,
  alBorrar,
}: {
  mes: string
  datos: DatosDeMovimientos
  alElegir: (m: FilaDeMovimiento) => void
  /** With both, each row gets the ⋮ menu. */
  alDuplicar?: (m: FilaDeMovimiento) => void
  alBorrar?: (m: FilaDeMovimiento) => Promise<void>
}) {
  // F5 keeps the filters: they are remembered for this tab. The chosen
  // days only come back for the month they belong to.
  const [guardado] = useState(() => leerDeLaPestana<FiltrosGuardados>(CLAVE_DE_FILTROS))
  const [busqueda, setBusqueda] = useState(guardado?.busqueda ?? '')
  const [filtro, setFiltro] = useState<Filtro>(guardado?.filtro ?? 'todos')
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set(guardado?.seleccion ?? []))
  const [rango, setRango] = useState<Rango | null>(guardado?.mes === mes ? (guardado.rango ?? null) : null)
  const [recientesPrimero, setRecientesPrimero] = useState(guardado?.recientesPrimero ?? true)
  useEffect(() => {
    guardarEnLaPestana(CLAVE_DE_FILTROS, {
      mes,
      busqueda,
      filtro,
      seleccion: [...seleccion],
      rango,
      recientesPrimero,
    } satisfies FiltrosGuardados)
  }, [mes, busqueda, filtro, seleccion, rango, recientesPrimero])
  const arbol = arbolDeGastos(datos.categorias)
  const cuentas = new Map(datos.cuentas.map((c) => [c.id, c]))
  const categoriaPorId = new Map(datos.categorias.map((c) => [c.id, c]))
  const rubroDe = (id: string | null) => {
    let c = id ? categoriaPorId.get(id) : undefined
    for (let n = 0; c?.padreId && n < 5; n++) c = categoriaPorId.get(c.padreId)
    return c ? { nombre: c.nombre, foto: c.foto } : null
  }

  const lineas: Linea[] = [...datos.movimientos]
    .sort((a, b) => (recientesPrimero ? b.fecha.localeCompare(a.fecha) : a.fecha.localeCompare(b.fecha)))
    .map((m) => {
      const ruta = rutaDeCategoria(m.categoriaId, datos.categorias)
      const partes = ruta.texto.split(' › ')
      const persona = partes.length > 1 ? partes[0] : ''
      const sinPersona = partes.slice(persona ? 1 : 0)
      // «General» is the schema's filler leaf, never a name to show.
      const hoja = [...partes].reverse().find((p) => p !== 'General') ?? partes[partes.length - 1]
      // As the phone: the note is the title and the merchant goes below.
      const nota = m.nota?.trim() || null
      const titulo = nota || m.comercio || hoja
      // Without "General", a level that repeats the one above, or the title itself.
      const camino = sinPersona
        .filter((p, i) => p !== 'General' && p !== sinPersona[i - 1] && p !== titulo)
        .join(' › ')
      const cuenta = cuentas.get(m.cuentaId)
      const nombreCuenta = cuenta?.nombre ?? 'Cuenta'
      const detalle = [nota ? m.comercio : null, camino, persona, nombreCuenta].filter(Boolean).join(' · ')
      return {
        fila: m,
        titulo,
        detalle,
        color: ruta.color,
        cuenta: nombreCuenta,
        foto: cuenta?.foto,
        rubro: rubroDe(m.categoriaId),
        buscable: plano([m.comercio, ruta.texto, nombreCuenta, m.nota].filter(Boolean).join(' ')),
      }
    })

  const buscado = plano(busqueda.trim())
  const porTipoYBusqueda = lineas.filter(
    (l) => (filtro === 'todos' || l.fila.tipo === filtro) && (!buscado || l.buscable.includes(buscado)),
  )
  // Each part of the panel counts with the other filters, never its own:
  // the calendar shades by the checked rubros, the totals by the chosen days.
  const porCategoria = porTipoYBusqueda.filter((l) => pasaLaSeleccion(seleccion, l.fila.categoriaId, datos.categorias))
  const visibles = porCategoria.filter((l) => dentroDelRango(rango, diaDe(l.fila.fecha)))

  const gastoPorDia = new Map<string, number>()
  for (const l of porCategoria) {
    if (l.fila.tipo !== 'expense') continue
    const dia = diaDe(l.fila.fecha)
    gastoPorDia.set(dia, (gastoPorDia.get(dia) ?? 0) + l.fila.monto)
  }
  const porId = new Map(datos.categorias.map((c) => [c.id, c]))
  const totales = new Map<string, number>()
  for (const l of porTipoYBusqueda) {
    if (l.fila.tipo !== 'expense' || !dentroDelRango(rango, diaDe(l.fila.fecha))) continue
    for (let c = l.fila.categoriaId ? porId.get(l.fila.categoriaId) : undefined, n = 0; c && n < 5; c = c.padreId ? porId.get(c.padreId) : undefined, n++) {
      totales.set(c.id, (totales.get(c.id) ?? 0) + l.fila.monto)
    }
  }
  // One removable chip per active filter: the days, then each rubro or
  // `Rubro › Categoría` checked.
  const activos = [...seleccion].map((id) => {
    const rubro = arbol.find((r) => r.id === id)
    if (rubro) return { id, texto: rubro.nombre }
    const padre = arbol.find((r) => r.categorias.some((c) => c.id === id))
    const nombre = porId.get(id)?.nombre ?? ''
    return { id, texto: padre ? `${padre.nombre} › ${nombre}` : nombre }
  })
  const sinFiltro = (id: string) => {
    const nueva = new Set(seleccion)
    nueva.delete(id)
    setSeleccion(nueva)
  }
  const total = (xs: Linea[], tipo: FilaDeMovimiento['tipo']) =>
    xs.filter((l) => l.fila.tipo === tipo).reduce((a, l) => a + l.fila.monto, 0)

  const dias: { dia: string; lineas: Linea[] }[] = []
  for (const l of visibles) {
    const dia = diaDe(l.fila.fecha)
    if (dias[dias.length - 1]?.dia !== dia) dias.push({ dia, lineas: [] })
    dias[dias.length - 1].lineas.push(l)
  }

  return (
    <section className="tarjeta movimientos" aria-labelledby="t-movimientos">
      <h2 id="t-movimientos">Movimientos de {nombreDelMes(mes)}</h2>
      {lineas.length === 0 ? (
        <p className="nota">Sin movimientos este mes.</p>
      ) : (
        <div className="lista-con-filtros">
          <FiltrosDelMes
            mes={mes}
            gastoPorDia={gastoPorDia}
            rango={rango}
            alTocarDia={(dia) => setRango(tocarDia(rango, dia))}
            arbol={arbol}
            seleccion={seleccion}
            totales={totales}
            alAlternar={(id) => setSeleccion(alternar(seleccion, id, arbol))}
            alQuitarDias={() => setRango(null)}
            alQuitarSeleccion={() => setSeleccion(new Set())}
          />
          <div className="lista-filtrada">
          <div className="filtros">
            <input
              type="search"
              aria-label="Buscar movimientos"
              placeholder="Buscar comercio, categoría o cuenta"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <div className="chips" role="group" aria-label="Tipo">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  className="chip"
                  aria-pressed={filtro === f.id}
                  onClick={() => setFiltro(f.id)}
                >
                  {f.nombre}
                </button>
              ))}
            </div>
          </div>
          <div className="resumen-y-orden">
            <p className="nota resumen" aria-live="polite">
              <span>
                {visibles.length} {visibles.length === 1 ? 'movimiento' : 'movimientos'}
              </span>
              {visibles.length > 0 && ' · '}
              {sumas(total(visibles, 'expense'), total(visibles, 'income'))}
            </p>
            {/* The button says the order in use; clicking flips it. */}
            <button type="button" className="enlace orden" onClick={() => setRecientesPrimero(!recientesPrimero)}>
              {recientesPrimero ? 'Más recientes primero' : 'Más antiguos primero'} <span aria-hidden="true">⇅</span>
            </button>
          </div>
          {(rango || activos.length > 0) && (
            <div className="filtros-activos" role="group" aria-label="Filtros activos">
              {rango && (
                <Activo texto={textoDelRango(rango)} alQuitar={() => setRango(null)} />
              )}
              {activos.map((a) => (
                <Activo key={a.id} texto={a.texto} alQuitar={() => sinFiltro(a.id)} />
              ))}
              <button
                type="button"
                className="enlace"
                onClick={() => {
                  setSeleccion(new Set())
                  setRango(null)
                }}
              >
                Limpiar todo
              </button>
            </div>
          )}
          {visibles.length === 0 && <p className="nota vacio">Ningún movimiento coincide.</p>}
          {dias.map((d) => (
            <div key={d.dia} className={`dia${esDiaNoHabil(d.dia) ? ' no-habil' : ''}`}>
              <h3>
                <span>
                  {tituloDelDia(d.dia)}
                  {festivoDe(d.dia) && <span className="festivo-nombre"> · {festivoDe(d.dia)}</span>}
                </span>
                <span className="num">{sumas(total(d.lineas, 'expense'), total(d.lineas, 'income'))}</span>
              </h3>
              <ul>
                {d.lineas.map((l) => (
                  <li key={l.fila.id} className={alDuplicar && alBorrar ? 'con-menu' : undefined}>
                    <button className="fila" onClick={() => alElegir(l.fila)}>
                      <Cara nombre={l.rubro?.nombre ?? ''} foto={l.rubro?.foto} clase="cara-de-rubro" />
                      <span className="fila-texto">
                        <span className="fila-arriba">
                          <b className="fila-titulo">{l.titulo}</b>
                          <b className={`num ${l.fila.tipo === 'expense' ? 'gasto' : 'ingreso'}`}>
                            {l.fila.tipo === 'expense' ? '−' : '+'}
                            {dinero(l.fila.monto)}
                          </b>
                        </span>
                        <span className="fila-abajo">
                          <span className="punto" style={{ background: colorDe(l.color) }} />
                          <Cara nombre={l.cuenta} foto={l.foto} />
                          <span className="fila-detalle">{l.detalle}</span>
                        </span>
                      </span>
                    </button>
                    {alDuplicar && alBorrar && (
                      <MenuDeFila
                        titulo={l.titulo}
                        alDuplicar={() => alDuplicar(l.fila)}
                        alBorrar={() => alBorrar(l.fila)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          </div>
        </div>
      )}
    </section>
  )
}

/** An active filter as a chip; its ✕ removes only that filter. */
function Activo({ texto, alQuitar }: { texto: string; alQuitar: () => void }) {
  return (
    <span className="activo">
      <span>{texto}</span>
      <button type="button" aria-label={`Quitar ${texto}`} onClick={alQuitar}>
        <span aria-hidden="true">✕</span>
      </button>
    </span>
  )
}
