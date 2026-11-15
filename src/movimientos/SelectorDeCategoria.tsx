import { useId, useMemo, useRef, useState } from 'react'
import { colorDe } from '../core/formato'
import {
  arbolDeCategorias,
  atajosDeCategoria,
  buscarCategorias,
  esGeneral,
  rutaCorta,
  tituloDe,
  type OpcionDeCategoria,
} from './categorias'
import type { Tipo } from './reglas'

/** The rubro's face: its photo, or a dot of its color (the phone's glyphs stay out). */
function Medallon({ foto, color, clase = 'medallon' }: { foto: string | null; color: string | null; clase?: string }) {
  const [rota, setRota] = useState(false)
  if (foto && !rota) return <img className={clase} src={foto} alt="" aria-hidden="true" onError={() => setRota(true)} />
  return <span className={clase} aria-hidden="true" style={{ background: colorDe(color) }} />
}

/**
 * The category field of the register panel, as on the phone: up to seven
 * shortcuts plus «Más», the short path under them, and «Más» opens the
 * whole tree inline below.
 */
export function CampoDeCategoria({
  tipo,
  opciones,
  usos,
  categoriaId,
  rutaDeRespaldo,
  busquedaInicial = '',
  alElegir,
}: {
  tipo: Tipo
  opciones: OpcionDeCategoria[]
  /** Uses of each category in the household's recent movements of [tipo]. */
  usos: Map<string, number>
  categoriaId: string
  /** What to show for a chosen category that is no longer offered (an archived one being corrected). */
  rutaDeRespaldo: string | null
  /** Opens the picker with this already typed. */
  busquedaInicial?: string
  alElegir: (id: string) => void
}) {
  const idTitulo = useId()
  const [abierto, setAbierto] = useState(busquedaInicial.trim() !== '')
  const [busqueda, setBusqueda] = useState(busquedaInicial)
  const [tipoVisto, setTipoVisto] = useState(tipo)
  // Another kind is another list: what was typed was for the previous one.
  if (tipo !== tipoVisto) {
    setTipoVisto(tipo)
    setBusqueda('')
  }
  const mas = useRef<HTMLButtonElement>(null)

  const atajos = useMemo(() => atajosDeCategoria(opciones, usos, categoriaId || null), [opciones, usos, categoriaId])
  const elegida = opciones.find((o) => o.id === categoriaId)
  const ruta = elegida ? rutaCorta(elegida) : categoriaId ? rutaDeRespaldo : null

  const cerrar = () => {
    setAbierto(false)
    setBusqueda('')
  }
  const elegir = (o: OpcionDeCategoria) => {
    alElegir(o.id)
    cerrar()
  }

  return (
    <div className="campo campo-categoria">
      <div role="group" aria-labelledby={idTitulo}>
        <h3 id={idTitulo} className="pregunta">
          {tipo === 'income' ? '¿De dónde viene?' : '¿En qué fue?'}
        </h3>
        <div className="atajos">
          {atajos.map((o) => (
            <button
              key={o.id}
              type="button"
              className="atajo"
              aria-label={`${tituloDe(o)}, de ${o.rubro}`}
              aria-pressed={o.id === categoriaId}
              onClick={() => alElegir(o.id)}
            >
              <Medallon foto={o.fotoRubro} color={o.colorRubro ?? o.color} />
              <span className="atajo-texto">{tituloDe(o)}</span>
            </button>
          ))}
          <button
            ref={mas}
            type="button"
            className="atajo"
            aria-label="Más"
            aria-expanded={abierto}
            onClick={() => (abierto ? cerrar() : setAbierto(true))}
          >
            <span className="medallon mas" aria-hidden="true">
              ···
            </span>
            <span className="atajo-texto">Más</span>
          </button>
        </div>
      </div>
      <p className={ruta ? 'ruta-categoria' : 'nota'}>{ruta ?? 'Toca una, o «Más» para ver todas'}</p>
      {abierto && (
        <SelectorDeCategoria
          key={tipo}
          opciones={opciones}
          elegidaId={categoriaId}
          busqueda={busqueda}
          alBuscar={setBusqueda}
          alElegir={elegir}
          alCerrar={() => {
            cerrar()
            mas.current?.focus()
          }}
        />
      )}
    </div>
  )
}

/**
 * The whole tree: search, rubro pills, the rubro's categories that open
 * into their subcategorías, one at a time. Opens on the current choice.
 */
function SelectorDeCategoria({
  opciones,
  elegidaId,
  busqueda,
  alBuscar,
  alElegir,
  alCerrar,
}: {
  opciones: OpcionDeCategoria[]
  elegidaId: string
  busqueda: string
  alBuscar: (q: string) => void
  alElegir: (o: OpcionDeCategoria) => void
  alCerrar: () => void
}) {
  const arbol = useMemo(() => arbolDeCategorias(opciones), [opciones])
  const actual = opciones.find((o) => o.id === elegidaId)
  const [rubroId, setRubroId] = useState(actual?.rubroId ?? arbol[0]?.id ?? null)
  const [abierta, setAbierta] = useState(actual && !esGeneral(actual) ? actual.categoriaId : null)
  const lista = useRef<HTMLDivElement>(null)

  const buscando = busqueda.trim() !== ''
  const resultados = buscando ? buscarCategorias(opciones, busqueda) : []
  const rubro = arbol.find((r) => r.id === rubroId) ?? arbol[0]

  const elegirRubro = (id: string) => {
    if (id === rubroId) return
    setRubroId(id)
    lista.current?.scrollTo?.({ top: 0 })
  }

  return (
    <section
      className="selector-categoria"
      aria-label="Todas las categorías"
      onKeyDown={(e) => {
        // Escape closes the picker, not the whole panel.
        if (e.key === 'Escape') {
          e.stopPropagation()
          alCerrar()
        }
      }}
    >
      <input
        type="search"
        aria-label="Buscar categoría"
        placeholder="Buscar categoría"
        autoComplete="off"
        autoFocus={!buscando}
        value={busqueda}
        onChange={(e) => alBuscar(e.target.value)}
      />
      {!buscando && arbol.length > 0 && (
        <div className="pildoras" role="group" aria-label="Rubros">
          {arbol.map((r) => (
            <button key={r.id} type="button" className="pildora" aria-pressed={r.id === rubro?.id} onClick={() => elegirRubro(r.id)}>
              <Medallon foto={r.foto} color={r.color} />
              {r.nombre}
            </button>
          ))}
        </div>
      )}
      <div className="selector-lista" ref={lista}>
        {buscando ? (
          resultados.length > 0 ? (
            <ul>
              {resultados.map((o) => (
                <li key={o.id}>
                  <button type="button" className="fila-categoria" aria-pressed={o.id === elegidaId} onClick={() => alElegir(o)}>
                    <span className="punto" style={{ background: colorDe(o.color) }} />
                    <span className="fila-categoria-texto">
                      <b>{tituloDe(o)}</b> <span className="apagado">{esGeneral(o) ? o.rubro : `${o.rubro} › ${o.categoria}`}</span>
                    </span>
                    {o.id === elegidaId && <span className="visto" aria-hidden="true">✓</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="nota vacio">No hay categorías que coincidan. Puedes crearla en Secciones › Categorías.</p>
          )
        ) : (
          rubro && (
            <>
              <h3 className="rubro-del-selector">
                {rubro.nombre} · {rubro.opciones === 1 ? '1 opción' : `${rubro.opciones} opciones`}
              </h3>
              <ul>
                {rubro.grupos.map((g) => {
                  const despliega = g.hojas.length > 0
                  const estaAbierta = despliega && abierta === g.id
                  return (
                    <li key={g.id}>
                      {despliega ? (
                        <button
                          type="button"
                          className="fila-categoria"
                          aria-expanded={estaAbierta}
                          onClick={() => setAbierta(estaAbierta ? null : g.id)}
                        >
                          <span className="punto" style={{ background: colorDe(g.cara.color) }} />
                          <span className="fila-categoria-texto">
                            <b>{g.nombre}</b>{' '}
                            <span className="apagado">
                              {g.hojas.length === 1 ? '1 subcategoría' : `${g.hojas.length} subcategorías`}
                            </span>
                          </span>
                          <span className="chevron" aria-hidden="true">
                            {estaAbierta ? '▴' : '▾'}
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="fila-categoria"
                          aria-pressed={g.cara.id === elegidaId}
                          onClick={() => alElegir(g.cara)}
                        >
                          <span className="punto" style={{ background: colorDe(g.cara.color) }} />
                          <span className="fila-categoria-texto">
                            <b>{g.nombre}</b>
                          </span>
                          {g.cara.id === elegidaId && <span className="visto" aria-hidden="true">✓</span>}
                        </button>
                      )}
                      {estaAbierta && (
                        <ul className="subcategorias">
                          {g.hojas.map((o) => (
                            <li key={o.id}>
                              <button type="button" className="fila-sub" aria-pressed={o.id === elegidaId} onClick={() => alElegir(o)}>
                                {o.subcategoria}
                                {o.id === elegidaId && <span className="visto" aria-hidden="true">✓</span>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )
        )}
      </div>
    </section>
  )
}
