import { useState } from 'react'
import { colorDe, dinero, MESES } from '../core/formato'
import { dentroDelRango, type Rango, type RubroDelArbol } from './filtros'

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
}: {
  mes: string
  gastoPorDia: Map<string, number>
  rango: Rango | null
  alTocarDia: (dia: string) => void
  arbol: RubroDelArbol[]
  seleccion: Set<string>
  totales: Map<string, number>
  alAlternar: (id: string) => void
}) {
  const [a, m] = mes.split('-').map(Number)
  const diasDelMes = new Date(Date.UTC(a, m, 0)).getUTCDate()
  // Monday first, as calendars are read in Colombia.
  const hueco = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7
  const mayor = Math.max(0, ...gastoPorDia.values())
  // Rubros start folded, so the panel is short; the arrow opens one.
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const plegar = (id: string) => {
    const nuevos = new Set(abiertos)
    if (nuevos.has(id)) nuevos.delete(id)
    else nuevos.add(id)
    setAbiertos(nuevos)
  }

  return (
    <aside className="filtros-del-mes">
      <p className="titulo-filtro" aria-hidden="true">Días</p>
      <div className="calendario" role="group" aria-label="Días del mes">
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
          // Five shades, so a quiet day and a heavy one read apart.
          const tono = gasto > 0 && mayor > 0 ? Math.max(1, Math.round((gasto / mayor) * 4)) : 0
          return (
            <button
              key={dia}
              type="button"
              className={`dia-del-mes tono-${tono}`}
              aria-label={`${i + 1} de ${MESES[m - 1]}`}
              aria-pressed={elegido}
              title={gasto > 0 ? dinero(gasto) : undefined}
              onClick={() => alTocarDia(dia)}
            >
              {i + 1}
            </button>
          )
        })}
      </div>

      <p className="titulo-filtro" id="t-rubros">Rubros y categorías</p>
      <div role="group" aria-labelledby="t-rubros" className="rubros">
        {arbol.map((r) => {
          const marcadas = r.categorias.filter((c) => seleccion.has(c.id)).length
          const estado = seleccion.has(r.id) ? 'true' : marcadas > 0 ? 'mixed' : 'false'
          const abierto = abiertos.has(r.id)
          return (
            <div key={r.id} className="rubro">
              <div className="rubro-cabeza">
                <Casilla
                  nombre={r.nombre}
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
  estado,
  total,
  color,
  alAlternar,
}: {
  nombre: string
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
      <span className="num casilla-total">{total > 0 ? dinero(total) : ''}</span>
    </button>
  )
}
