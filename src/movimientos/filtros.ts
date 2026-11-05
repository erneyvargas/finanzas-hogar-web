import { MESES } from '../core/formato'
import type { CategoriaDeMovimiento } from './reglas'

/** A rubro with the categories under it, as the filter panel lists them. */
export interface RubroDelArbol {
  id: string
  nombre: string
  color: string | null
  categorias: { id: string; nombre: string }[]
}

/** The live expense rubros with their live categories, in the order they come. */
export function arbolDeGastos(categorias: CategoriaDeMovimiento[]): RubroDelArbol[] {
  const vivas = categorias.filter((c) => c.viva && c.tipo === 'expense')
  return vivas
    .filter((c) => c.nivel === 'rubro')
    .map((r) => ({
      id: r.id,
      nombre: r.nombre,
      color: r.color,
      categorias: vivas
        .filter((c) => c.nivel === 'category' && c.padreId === r.id)
        .map((c) => ({ id: c.id, nombre: c.nombre })),
    }))
}

/**
 * Checks or unchecks [id] (a rubro or a category). A selected rubro stands
 * for all its categories: unchecking one of them keeps the others, and
 * checking the last missing one turns them back into the rubro.
 */
export function alternar(seleccion: Set<string>, id: string, arbol: RubroDelArbol[]): Set<string> {
  const nueva = new Set(seleccion)
  const rubro = arbol.find((r) => r.id === id)
  if (rubro) {
    for (const c of rubro.categorias) nueva.delete(c.id)
    if (seleccion.has(id)) nueva.delete(id)
    else nueva.add(id)
    return nueva
  }
  const padre = arbol.find((r) => r.categorias.some((c) => c.id === id))
  if (!padre) return nueva
  if (nueva.has(padre.id)) {
    nueva.delete(padre.id)
    for (const c of padre.categorias) if (c.id !== id) nueva.add(c.id)
    return nueva
  }
  if (nueva.has(id)) nueva.delete(id)
  else nueva.add(id)
  if (padre.categorias.length > 0 && padre.categorias.every((c) => nueva.has(c.id))) {
    for (const c of padre.categorias) nueva.delete(c.id)
    nueva.add(padre.id)
  }
  return nueva
}

/** Whether a movement with [categoriaId] passes: no selection, or one of its ancestors is selected. */
export function pasaLaSeleccion(
  seleccion: Set<string>,
  categoriaId: string | null,
  categorias: CategoriaDeMovimiento[],
): boolean {
  if (seleccion.size === 0) return true
  const porId = new Map(categorias.map((c) => [c.id, c]))
  for (let c = categoriaId ? porId.get(categoriaId) : undefined, n = 0; c && n < 5; c = c.padreId ? porId.get(c.padreId) : undefined, n++) {
    if (seleccion.has(c.id)) return true
  }
  return false
}

/** Chosen days, both ends included, as `YYYY-MM-DD`. */
export interface Rango {
  desde: string
  hasta: string
}

/**
 * A tap on a calendar day: the first picks that day, a second one makes
 * the range, tapping the only chosen day clears it, and a tap on a range
 * starts again from that day.
 */
export function tocarDia(rango: Rango | null, dia: string): Rango | null {
  if (rango && rango.desde === rango.hasta) {
    if (dia === rango.desde) return null
    return dia < rango.desde ? { desde: dia, hasta: rango.desde } : { desde: rango.desde, hasta: dia }
  }
  return { desde: dia, hasta: dia }
}

export const dentroDelRango = (rango: Rango | null, dia: string) =>
  !rango || (dia >= rango.desde && dia <= rango.hasta)

/** `14 al 27 oct`, or `24 oct` for a single day. */
export function textoDelRango(rango: Rango): string {
  const corto = (dia: string) => `${Number(dia.slice(8))} ${MESES[Number(dia.slice(5, 7)) - 1].slice(0, 3)}`
  return rango.desde === rango.hasta
    ? corto(rango.desde)
    : `${Number(rango.desde.slice(8))} al ${corto(rango.hasta)}`
}
