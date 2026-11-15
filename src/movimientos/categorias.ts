import { plano } from './filtros'
import type { CategoriaDeMovimiento, Tipo } from './reglas'

/**
 * The category picker's rules, copied from the phone app
 * (`selector_categoria.dart`, `atajos_de_categoria.dart` and
 * `OpcionCategoria` in `modelos.dart`).
 */

/**
 * The filler leaf the schema hangs under every category (trigger
 * `categories_auto_general`). It is recognized by name, as on the phone.
 */
export const HOJA_GENERAL = 'General'

/** A leaf a movement can take, with its three-level path resolved. */
export interface OpcionDeCategoria {
  id: string
  rubroId: string
  rubro: string
  categoriaId: string
  categoria: string
  subcategoria: string
  /** The closest level's color. */
  color: string | null
  /** The rubro's photo, the face of its shortcuts and pill. */
  fotoRubro: string | null
  colorRubro: string | null
}

export const esGeneral = (o: OpcionDeCategoria) => o.subcategoria === HOJA_GENERAL

/** How the option is named in a list: the category for General, else the subcategory. */
export const tituloDe = (o: OpcionDeCategoria) => (esGeneral(o) ? o.categoria : o.subcategoria)

/** Always two levels: `Rubro › Categoría` for General, else `Categoría › Subcategoría`. */
export const rutaCorta = (o: OpcionDeCategoria) =>
  esGeneral(o) ? `${o.rubro} › ${o.categoria}` : `${o.categoria} › ${o.subcategoria}`

const porOrden = (a: CategoriaDeMovimiento, b: CategoriaDeMovimiento) =>
  (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre, 'es')

/**
 * The leaves a movement of [tipo] can take: a subcategory under a
 * category under a rubro, all three live, outside the balance-adjustment
 * rubro; ordered by rubro, category and subcategory `sort_order`.
 */
export function opcionesDeCategoria(
  tipo: Tipo,
  categorias: CategoriaDeMovimiento[],
  rubroDeAjuste: string | null,
): OpcionDeCategoria[] {
  const porId = new Map(categorias.map((c) => [c.id, c]))
  const filas: { sub: CategoriaDeMovimiento; cat: CategoriaDeMovimiento; rub: CategoriaDeMovimiento }[] = []
  for (const sub of categorias) {
    if (sub.nivel !== 'subcategory' || sub.tipo !== tipo || !sub.viva) continue
    const cat = sub.padreId ? porId.get(sub.padreId) : undefined
    const rub = cat?.padreId ? porId.get(cat.padreId) : undefined
    if (!cat || !rub || !cat.viva || !rub.viva || rub.id === rubroDeAjuste) continue
    if (cat.nivel !== 'category' || rub.nivel !== 'rubro') continue
    filas.push({ sub, cat, rub })
  }
  filas.sort((a, b) => porOrden(a.rub, b.rub) || porOrden(a.cat, b.cat) || porOrden(a.sub, b.sub))
  return filas.map(({ sub, cat, rub }) => ({
    id: sub.id,
    rubroId: rub.id,
    rubro: rub.nombre,
    categoriaId: cat.id,
    categoria: cat.nombre,
    subcategoria: sub.nombre,
    color: sub.color ?? cat.color ?? rub.color,
    fotoRubro: rub.foto ?? null,
    colorRubro: rub.color,
  }))
}

/** One category of the picker: its face (its General, or its first leaf) and the leaves offered. */
export interface GrupoDeCategoria {
  id: string
  nombre: string
  cara: OpcionDeCategoria
  /** The real subcategories; empty when General is the only leaf, so a tap chooses [cara]. */
  hojas: OpcionDeCategoria[]
}

export interface RubroDelSelector {
  id: string
  nombre: string
  color: string | null
  foto: string | null
  /** Every leaf of the rubro, General included, as the phone counts them. */
  opciones: number
  grupos: GrupoDeCategoria[]
}

/** The options grouped rubro › categoría › leaves, keeping their order. */
export function arbolDeCategorias(opciones: OpcionDeCategoria[]): RubroDelSelector[] {
  const rubros = new Map<string, RubroDelSelector & { porCategoria: Map<string, OpcionDeCategoria[]> }>()
  for (const o of opciones) {
    let r = rubros.get(o.rubroId)
    if (!r) {
      r = { id: o.rubroId, nombre: o.rubro, color: o.colorRubro, foto: o.fotoRubro, opciones: 0, grupos: [], porCategoria: new Map() }
      rubros.set(o.rubroId, r)
    }
    r.opciones += 1
    const hojas = r.porCategoria.get(o.categoriaId) ?? []
    hojas.push(o)
    r.porCategoria.set(o.categoriaId, hojas)
  }
  return [...rubros.values()].map(({ porCategoria, ...r }) => ({
    ...r,
    grupos: [...porCategoria.values()].map((hojas) => {
      const reales = hojas.filter((o) => !esGeneral(o))
      return {
        id: hojas[0].categoriaId,
        nombre: hojas[0].categoria,
        cara: hojas.find(esGeneral) ?? hojas[0],
        hojas: reales,
      }
    }),
  }))
}

/** Whether [o] answers what was typed: rubro, category or subcategory, ignoring case and accents. */
export function coincide(o: OpcionDeCategoria, q: string): boolean {
  const t = plano(q.trim())
  if (!t) return true
  return plano(o.rubro).includes(t) || plano(o.categoria).includes(t) || plano(o.subcategoria).includes(t)
}

export const buscarCategorias = (opciones: OpcionDeCategoria[], q: string) => opciones.filter((o) => coincide(o, q))

/** How many of the household's recent movements of [tipo] use each category. */
export function usosPorCategoria(
  historial: { tipo: Tipo; categoriaId: string | null }[],
  tipo: Tipo,
): Map<string, number> {
  const usos = new Map<string, number>()
  for (const m of historial) {
    if (m.tipo === tipo && m.categoriaId) usos.set(m.categoriaId, (usos.get(m.categoriaId) ?? 0) + 1)
  }
  return usos
}

/**
 * The shortcut tiles: the most used, best first; with no history, the
 * first leaf of each rubro. The chosen one goes first when it is not
 * already there, so its ring has somewhere to show.
 */
export function atajosDeCategoria(
  opciones: OpcionDeCategoria[],
  usos: Map<string, number>,
  elegidaId: string | null,
  cupo = 7,
): OpcionDeCategoria[] {
  const frecuentes = opciones
    .filter((o) => (usos.get(o.id) ?? 0) > 0)
    .sort((a, b) => usos.get(b.id)! - usos.get(a.id)!)
    .slice(0, cupo)
  const vistos = new Set<string>()
  const base = frecuentes.length > 0 ? frecuentes : opciones.filter((o) => !vistos.has(o.rubroId) && vistos.add(o.rubroId)).slice(0, cupo)
  const elegida = opciones.find((o) => o.id === elegidaId)
  if (!elegida || base.some((o) => o.id === elegida.id)) return base
  return [elegida, ...base].slice(0, cupo)
}
