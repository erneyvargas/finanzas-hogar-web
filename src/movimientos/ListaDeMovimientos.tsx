import { useState } from 'react'
import { colorDe, dinero, MESES, nombreDelMes } from '../core/formato'
import { diaDe } from '../tablero/calculo'
import { alternar, arbolDeGastos, dentroDelRango, pasaLaSeleccion, textoDelRango, tocarDia, type Rango } from './filtros'
import { FiltrosDelMes } from './FiltrosDelMes'
import { rutaDeCategoria, type DatosDeMovimientos, type FilaDeMovimiento } from './reglas'

/**
 * The account's face: its photo when it has one, else its initials on a
 * tile, as the phone shows it without a logo.
 */
export function Cara({ nombre, foto }: { nombre: string; foto?: string | null }) {
  const [rota, setRota] = useState(false)
  if (foto && !rota) {
    return <img className="cara" src={foto} alt="" aria-hidden="true" onError={() => setRota(true)} />
  }
  const iniciales = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
  return (
    <span className="cara" aria-hidden="true">
      {iniciales || '·'}
    </span>
  )
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/** `Martes 27 oct` for a `YYYY-MM-DD` day. */
function tituloDelDia(dia: string) {
  const [a, m, d] = dia.split('-').map(Number)
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d} ${MESES[m - 1].slice(0, 3)}`
}

/** Lower case, without accents, to compare what the user types. */
const plano = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

type Filtro = 'todos' | 'expense' | 'income'
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
}: {
  mes: string
  datos: DatosDeMovimientos
  alElegir: (m: FilaDeMovimiento) => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [rango, setRango] = useState<Rango | null>(null)
  const arbol = arbolDeGastos(datos.categorias)
  const cuentas = new Map(datos.cuentas.map((c) => [c.id, c]))

  const lineas: Linea[] = [...datos.movimientos]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
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
  const nombres = [...seleccion].map((id) => porId.get(id)?.nombre).filter(Boolean)
  const filtrado = [nombres.join(', '), rango ? textoDelRango(rango) : ''].filter(Boolean).join(' · ')
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
          <p className="nota resumen" aria-live="polite">
            <span>
              {visibles.length} {visibles.length === 1 ? 'movimiento' : 'movimientos'}
            </span>
            {visibles.length > 0 && ' · '}
            {sumas(total(visibles, 'expense'), total(visibles, 'income'))}
          </p>
          {filtrado && (
            <p className="nota filtrado">
              <span>{filtrado}</span>
              <button
                type="button"
                className="enlace"
                onClick={() => {
                  setSeleccion(new Set())
                  setRango(null)
                }}
              >
                Quitar filtros
              </button>
            </p>
          )}
          {visibles.length === 0 && <p className="nota vacio">Ningún movimiento coincide.</p>}
          {dias.map((d) => (
            <div key={d.dia} className="dia">
              <h3>
                <span>{tituloDelDia(d.dia)}</span>
                <span className="num">{sumas(total(d.lineas, 'expense'), total(d.lineas, 'income'))}</span>
              </h3>
              <ul>
                {d.lineas.map((l) => (
                  <li key={l.fila.id}>
                    <button className="fila" onClick={() => alElegir(l.fila)}>
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
                    </button>
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
