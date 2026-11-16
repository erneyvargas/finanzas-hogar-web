import { useState } from 'react'
import { festivoDe } from '../core/festivos'
import { Ayuda } from '../core/ui/Ayuda'
import { colorDe, dinero, MESES } from '../core/formato'
import { buscarEnArbol, dentroDelRango, type Rango, type RubroDelArbol } from './filtros'

const DIAS_CORTOS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/**
 * The left column of the movements (option B of the filter proposals): the
 * month as a calendar shaded by what was spent each day, and the expense
 * rubros with their categories to check.
 */
export function FiltrosDelMes({
  mes,
  gastoPorDia,
  rango,
  alTocarDia,
  arbol,
  seleccion,
  totales,
  alAlternar,
  alQuitarDias,
  alQuitarSeleccion,
}: {
  mes: string
  gastoPorDia: Map<string, number>
  rango: Rango | null
  alTocarDia: (dia: string) => void
  arbol: RubroDelArbol[]
  seleccion: Set<string>
  totales: Map<string, number>
  alAlternar: (id: string) => void
  alQuitarDias: () => void
  alQuitarSeleccion: () => void
}) {
  const [a, m] = mes.split('-').map(Number)
  const diasDelMes = new Date(Date.UTC(a, m, 0)).getUTCDate()
  // Monday first, as calendars are read in Colombia.
  const hueco = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7
  const mayor = Math.max(0, ...gastoPorDia.values())
  // With one day chosen, the day under the pointer previews the range a
  // second tap would make.
  const [sobre, setSobre] = useState<string | null>(null)
  const unSoloDia = rango !== null && rango.desde === rango.hasta ? rango.desde : null
  const previa: Rango | null =
    unSoloDia && sobre && sobre !== unSoloDia
      ? sobre < unSoloDia
        ? { desde: sobre, hasta: unSoloDia }
        : { desde: unSoloDia, hasta: sobre }
      : null
  // Rubros start folded, so the panel is short; the arrow opens one.
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const plegar = (id: string) => {
    const nuevos = new Set(abiertos)
    if (nuevos.has(id)) nuevos.delete(id)
    else nuevos.add(id)
    setAbiertos(nuevos)
  }
  // The search only narrows this panel; the selection and the list stay.
  const [busqueda, setBusqueda] = useState('')
  const buscando = busqueda.trim() !== ''
  const visibles = buscarEnArbol(arbol, busqueda)
  const rubrosMarcados = arbol.filter((r) => seleccion.has(r.id)).length
  const categoriasMarcadas = seleccion.size - rubrosMarcados
  const marcado = [
    rubrosMarcados ? `${rubrosMarcados} ${rubrosMarcados === 1 ? 'rubro' : 'rubros'}` : '',
    categoriasMarcadas ? `${categoriasMarcadas} ${categoriasMarcadas === 1 ? 'categoría' : 'categorías'}` : '',
  ].filter(Boolean).join(' y ')
  const avisoDeBusqueda = marcado
    ? `Solo busca en esta lista. Lo marcado sigue igual (${marcado}).`
    : 'Solo busca en esta lista; no marca nada.'

  return (
    <aside className="filtros-del-mes">
      <div className="titulo-filtro">
        <span aria-hidden="true">Días</span>
        {rango && (
          <button type="button" className="enlace" onClick={alQuitarDias}>
            Quitar días
          </button>
        )}
      </div>
      <div className="calendario" role="group" aria-label="Días del mes" onMouseLeave={() => setSobre(null)}>
        {DIAS_CORTOS.map((d, i) => (
          <span key={i} className="dia-semana" aria-hidden="true">
            {d}
          </span>
        ))}
        {Array.from({ length: hueco }, (_, i) => (
          <span key={`h${i}`} />
        ))}
        {Array.from({ length: diasDelMes }, (_, i) => {
          const dia = `${mes}-${String(i + 1).padStart(2, '0')}`
          const gasto = gastoPorDia.get(dia) ?? 0
          const elegido = rango !== null && dentroDelRango(rango, dia)
          const enPrevia = !elegido && previa !== null && dentroDelRango(previa, dia)
          // Four bar widths, so a quiet day and a heavy one read apart. The
          // bar is grey: green is only for what is chosen.
          const tono = gasto > 0 && mayor > 0 ? Math.max(1, Math.round((gasto / mayor) * 4)) : 0
          const inicio = elegido && rango !== null && dia === rango.desde
          const fin = elegido && rango !== null && dia === rango.hasta
          const festivo = festivoDe(dia)
          const nombre = `${i + 1} de ${MESES[m - 1]}`
          const titulo = [festivo, gasto > 0 ? dinero(gasto) : null].filter(Boolean).join(' · ')
          return (
            <Ayuda key={dia} texto={titulo}>
              <button
                type="button"
                className={`dia-del-mes${festivo ? ' festivo' : ''}${inicio ? ' inicio' : ''}${fin ? ' fin' : ''}`}
                aria-label={festivo ? `${nombre}, festivo: ${festivo}` : nombre}
                aria-pressed={elegido}
                data-previa={enPrevia || undefined}
                onMouseEnter={() => setSobre(dia)}
                onClick={() => alTocarDia(dia)}
              >
                {i + 1}
                {tono > 0 && <span className={`gasto-del-dia nivel-${tono}`} aria-hidden="true" />}
              </button>
            </Ayuda>
          )
        })}
      </div>
      <p className="leyenda-calendario" aria-hidden="true">
        <span>
          <i className="muestra-gasto" />
          gasto del día
        </span>
        <span>
          <i className="muestra-elegido" />
          elegido
        </span>
      </p>

      <div className="titulo-filtro">
        <span id="t-rubros">Rubros y categorías</span>
        {seleccion.size > 0 && (
          <button type="button" className="enlace" onClick={alQuitarSeleccion}>
            Quitar
          </button>
        )}
      </div>
      <input
        type="search"
        className="buscar-rubro"
        placeholder="Buscar rubro o categoría"
        aria-label="Buscar rubro o categoría"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setBusqueda('')
        }}
      />
      <div role="group" aria-labelledby="t-rubros" className="rubros">
        {buscando && <p className="nota aviso-busqueda">{avisoDeBusqueda}</p>}
        {buscando && visibles.length === 0 && (
          <p className="nota sin-resultados">Sin resultados para «{busqueda.trim()}»</p>
        )}
        {visibles.map((r) => {
          // The rubro's state reads all its categories, also the hidden ones.
          const completo = arbol.find((x) => x.id === r.id) ?? r
          const marcadas = completo.categorias.filter((c) => seleccion.has(c.id)).length
          const estado = seleccion.has(r.id) ? 'true' : marcadas > 0 ? 'mixed' : 'false'
          // While searching, a rubro kept for its categories shows them.
          const porSusCategorias = buscando && r !== arbol.find((x) => x.id === r.id)
          const abierto = abiertos.has(r.id) || porSusCategorias
          return (
            <div key={r.id} className="rubro">
              <div className="rubro-cabeza">
                <Casilla
                  nombre={r.nombre}
                  cuantas={estado === 'mixed' ? `${marcadas} de ${completo.categorias.length}` : undefined}
                  estado={estado}
                  total={totales.get(r.id) ?? 0}
                  color={colorDe(r.color)}
                  alAlternar={() => alAlternar(r.id)}
                />
                {r.categorias.length > 0 && (
                  <button
                    type="button"
                    className="plegar"
                    aria-label={`Ver categorías de ${r.nombre}`}
                    aria-expanded={abierto}
                    onClick={() => plegar(r.id)}
                  >
                    <span aria-hidden="true">{abierto ? '▾' : '▸'}</span>
                  </button>
                )}
              </div>
              {abierto && r.categorias.map((c) => (
                <Casilla
                  key={c.id}
                  nombre={c.nombre}
                  estado={seleccion.has(r.id) || seleccion.has(c.id) ? 'true' : 'false'}
                  total={totales.get(c.id) ?? 0}
                  alAlternar={() => alAlternar(c.id)}
                />
              ))}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

function Casilla({
  nombre,
  cuantas,
  estado,
  total,
  color,
  alAlternar,
}: {
  nombre: string
  /** `1 de 8` for a partly checked rubro. */
  cuantas?: string
  estado: 'true' | 'false' | 'mixed'
  total: number
  color?: string
  alAlternar: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={estado}
      aria-label={nombre}
      className={color ? 'casilla de-rubro' : 'casilla de-categoria'}
      onClick={alAlternar}
    >
      <span className="caja" aria-hidden="true">
        {estado === 'true' ? '✓' : estado === 'mixed' ? '–' : ''}
      </span>
      {color && <span className="punto" style={{ background: color }} />}
      <span className="casilla-nombre">{nombre}</span>
      {cuantas && <span className="cuantas">{cuantas}</span>}
      <span className="num casilla-total">{total > 0 ? dinero(total) : ''}</span>
    </button>
  )
}
