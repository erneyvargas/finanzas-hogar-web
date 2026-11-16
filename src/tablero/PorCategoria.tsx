import { useEffect, useMemo, useState } from 'react'
import { Anillo } from '../core/ui/Anillo'
import { Ayuda } from '../core/ui/Ayuda'
import { explicarCambio } from './cambio'
import { Cifra } from '../core/ui/Cifra'
import { colorDe, dinero, nombreDelMes } from '../core/formato'
import { moverMes, type CategoriaDelMes } from './calculo'

/** Six slices read at a glance; the rest go together. */
const CUANTAS = 6
/** Palette keys of the phone app, in the order the slices take them. */
const PALETA = ['marino', 'arcilla', 'laguna', 'lavanda', 'musgo', 'ciruela']

interface Grupo extends CategoriaDelMes {
  color: string
  /** The level-2 categories it stands for. */
  ids: string[]
}

function agrupar(categorias: CategoriaDelMes[]): Grupo[] {
  const grandes = categorias.length > CUANTAS ? categorias.slice(0, CUANTAS - 1) : categorias
  // A rubro brings its own color (the phone's); a slice without one takes the palette's.
  const grupos: Grupo[] = grandes.map((c, i) => ({
    ...c,
    color: colorDe(c.color ?? PALETA[i]),
    ids: [c.id],
  }))
  const resto = categorias.slice(grandes.length)
  if (resto.length > 0) {
    grupos.push({
      id: 'otras',
      nombre: 'Otros',
      total: resto.reduce((s, c) => s + c.total, 0),
      anterior: resto.reduce((s, c) => s + c.anterior, 0),
      color: 'var(--grafito)',
      ids: resto.map((c) => c.id),
    })
  }
  return grupos
}

const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : 0)
const editable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

/**
 * Spending by rubro (the Moxen "Gastos" layout; the user asked «este quiero
 * que sea por rubro»): a ring with the
 * month's total in the middle, the categories with their share and the
 * change against the month before, and the month's movements below.
 * Choosing a category (its row, its slice or keys 1–6) narrows all of it;
 * again, Escape or the pill clear it.
 */
export function PorCategoria({
  mes,
  categorias,
  comparadoHasta = null,
  alAnadir,
  alElegirGrupo,
}: {
  mes: string
  /** The day the comparison with the month before stops at; null for a closed month. */
  comparadoHasta?: number | null
  categorias: CategoriaDelMes[]
  /** Opens a new expense for the chosen level-2 category, or none. */
  alAnadir?: (categoriaId: string | null) => void
  /** The rubro ids of the chosen slice, or null when none: the page filters with it. */
  alElegirGrupo?: (ids: string[] | null) => void
}) {
  const grupos = useMemo(() => agrupar(categorias), [categorias])
  const total = grupos.reduce((s, g) => s + g.total, 0)
  const [elegido, setElegido] = useState<string | null>(null)
  const grupo = grupos.find((g) => g.id === elegido) ?? null
  // The page narrows the «Categorías por persona» table to the chosen rubro.
  const idsElegidos = grupo ? grupo.ids.join('|') : null
  useEffect(() => {
    alElegirGrupo?.(idsElegidos ? idsElegidos.split('|') : null)
  }, [idsElegidos, alElegirGrupo])
  const anterior = nombreDelMes(moverMes(mes, -1))

  // A new month starts with nothing chosen.
  const [mesVisto, setMesVisto] = useState(mes)
  if (mesVisto !== mes) {
    setMesVisto(mes)
    setElegido(null)
  }

  const alternar = (id: string) => setElegido((e) => (e === id ? null : id))

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      // The panel owns the keys while it is open, and fields own their typing.
      if (document.querySelector('[role="dialog"]') || editable(e.target)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Escape') setElegido(null)
      const n = Number(e.key)
      if (Number.isInteger(n) && n >= 1 && n <= grupos.length) alternar(grupos[n - 1].id)
    }
    window.addEventListener('keydown', alTeclear, true)
    return () => window.removeEventListener('keydown', alTeclear, true)
  }, [grupos])

  const subtitulo = grupo
    ? `${pct(grupo.total, total)} % del mes`
    : `${grupos.length} ${grupos.length === 1 ? 'rubro' : 'rubros'}`

  return (
    <section className="tarjeta completa por-categoria" aria-labelledby="t-categorias">
      <div className="pc-cabeza">
        <h2 id="t-categorias">Por rubro</h2>
        {grupo && (
          <button
            type="button"
            className="pc-filtro"
            aria-label={`Quitar filtro ${grupo.nombre}`}
            style={{ ['--c' as string]: grupo.color }}
            onClick={() => setElegido(null)}
          >
            {grupo.nombre} <span aria-hidden="true">✕</span>
          </button>
        )}
        {alAnadir && (
          <button type="button" className="secundario pc-anadir" onClick={() => alAnadir(grupo?.id ?? null)}>
            Añadir gasto
          </button>
        )}
      </div>

      {grupos.length === 0 ? (
        <p className="nota">Sin gastos este mes.</p>
      ) : (
        <div className="pc-cuerpo">
          <Anillo
            etiqueta={`Gasto por rubro de ${nombreDelMes(mes)}`}
            partes={grupos.map((g) => ({
              id: g.id,
              valor: g.total,
              color: g.color,
              nombre: g.nombre,
            }))}
            elegido={elegido}
            alElegir={alternar}
            clave={mes}
          >
            <span className="pc-centro-et">{grupo ? grupo.nombre : `Gastado en ${nombreDelMes(mes)}`}</span>
            <Cifra className="pc-centro-total" texto={dinero(grupo ? grupo.total : total)} />
            <span className="pc-centro-sub">{subtitulo}</span>
          </Anillo>

          <ul className="pc-cats">
            {grupos.map((g, i) => {
              const cambio = g.anterior > 0 ? Math.round(((g.total - g.anterior) / g.anterior) * 100) : null
              return (
                <li key={g.id}>
                  {/* The explanation of the comparison belongs to the row button: hover or
                      keyboard focus on the row shows it, with no control nested in a control. */}
                  <Ayuda texto={explicarCambio(g.total, g.anterior, mes, comparadoHasta)}>
                    <button
                      type="button"
                      className="pc-cat"
                      aria-pressed={g.id === elegido}
                      aria-keyshortcuts={String(i + 1)}
                      style={{ ['--c' as string]: g.color }}
                      onClick={() => alternar(g.id)}
                    >
                      <span className="pc-cat-nom">{g.nombre}</span>
                      <span className="pc-pildora num">{pct(g.total, total)} %</span>
                      <b className="pc-cat-monto num">{dinero(g.total)}</b>
                      <span className="pc-cat-cambio">
                        {cambio === null ? (
                          `Sin gasto en ${anterior}`
                        ) : cambio === 0 ? (
                          `Igual que en ${anterior}`
                        ) : (
                          <span className={cambio > 0 ? 'sube' : 'baja'}>
                            {cambio > 0 ? '↑' : '↓'} {Math.abs(cambio)} % vs {anterior}
                          </span>
                        )}
                      </span>
                      <span className="pc-barra" aria-hidden="true">
                        <i
                          style={{
                            ['--w' as string]: total > 0 ? g.total / total : 0,
                          }}
                        />
                      </span>
                    </button>
                  </Ayuda>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
