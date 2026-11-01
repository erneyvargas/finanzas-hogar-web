import { v5 as uuidv5 } from 'uuid'

/**
 * The month dashboard numbers, with the same rules as the phone app
 * (`lib/core/repositories/repositorios.dart`):
 *
 * - Only live movements count: not deleted (the query already filters
 *   them) and not voided.
 * - A split invoice counts each part in its own rubro, never the whole
 *   in the parent's (`sqlPlataRepartida`).
 * - The balance adjustment rubro is left out (`sqlSinAjustes`).
 * - Months are Bogotá months (UTC-5, no daylight saving).
 */

export interface Movimiento {
  id: string
  tipo: string
  monto: number
  /** ISO timestamp, as Supabase returns `occurred_at`. */
  fecha: string
  rubroId: string | null
  /** The level-2 category (`category_l2_id`). */
  categoriaId: string | null
  anulado: boolean
}

export interface Parte {
  movimientoId: string
  monto: number
  rubroId: string | null
  categoriaId: string | null
}

export interface Categoria {
  id: string
  nombre: string
  nivel: string
  /** Palette key of the phone app, such as `lavanda`. */
  color: string | null
}

export interface TotalDeRubro {
  id: string
  nombre: string
  color: string | null
  total: number
}

export interface FilaDeMatriz {
  categoria: string
  total: number
  porRubro: Record<string, number>
}

export interface MesDeTendencia {
  mes: string
  total: number
  porRubro: Record<string, number>
}

export interface ResumenDelMes {
  gastado: number
  gastadoAnterior: number
  ingresos: number
  porRubro: TotalDeRubro[]
  matriz: FilaDeMatriz[]
  meses: MesDeTendencia[]
}

/** The phone app's namespace for the adjustment categories. */
const NAMESPACE_DE_AJUSTE = 'a11e3a5d-0000-4000-8000-000000000001'

/** Same derivation as `idDelRubroDeAjuste` in the phone app. */
export function idDelRubroDeAjuste(hogarId: string): string {
  return uuidv5(`finanzas-hogar/ajuste-de-saldo/${hogarId}/rubro`, NAMESPACE_DE_AJUSTE)
}

const HORAS_DE_BOGOTA = 5

/** `YYYY-MM` of a timestamp, in Bogotá. */
export function mesDe(iso: string): string {
  const d = new Date(new Date(iso).getTime() - HORAS_DE_BOGOTA * 3600_000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Moves a `YYYY-MM` key by [delta] months. */
export function moverMes(mes: string, delta: number): string {
  const [a, m] = mes.split('-').map(Number)
  const total = a * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** The [cuantos] months that end in [mes], oldest first. */
export function mesesHasta(mes: string, cuantos: number): string[] {
  return Array.from({ length: cuantos }, (_, i) => moverMes(mes, i - cuantos + 1))
}

/** UTC bounds of a Bogotá month, to query `occurred_at`. */
export function limitesDelMes(mes: string): { desde: string; hasta: string } {
  const inicio = (k: string) => {
    const [a, m] = k.split('-').map(Number)
    return new Date(Date.UTC(a, m - 1, 1, HORAS_DE_BOGOTA)).toISOString()
  }
  return { desde: inicio(mes), hasta: inicio(moverMes(mes, 1)) }
}

interface Linea {
  mes: string
  monto: number
  rubroId: string | null
  categoriaId: string | null
}

/** Expense money split by part, without voided or adjustment lines. */
function lineasDeGasto(
  movimientos: Movimiento[],
  partes: Parte[],
  ajuste: string,
): Linea[] {
  const partesDe = new Map<string, Parte[]>()
  for (const p of partes) {
    const lista = partesDe.get(p.movimientoId) ?? []
    lista.push(p)
    partesDe.set(p.movimientoId, lista)
  }

  const lineas: Linea[] = []
  for (const m of movimientos) {
    if (m.tipo !== 'expense' || m.anulado) continue
    const mes = mesDe(m.fecha)
    const suyas = partesDe.get(m.id)
    const fuente = suyas?.length
      ? suyas.map((p) => ({ monto: p.monto, rubroId: p.rubroId, categoriaId: p.categoriaId }))
      : [{ monto: m.monto, rubroId: m.rubroId, categoriaId: m.categoriaId }]
    for (const f of fuente) {
      if (f.rubroId === ajuste) continue
      lineas.push({ mes, ...f })
    }
  }
  return lineas
}

const sumar = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function resumenDelMes(entrada: {
  movimientos: Movimiento[]
  partes: Parte[]
  categorias: Categoria[]
  mes: string
  hogarId: string
}): ResumenDelMes {
  const { movimientos, partes, categorias, mes, hogarId } = entrada
  const ajuste = idDelRubroDeAjuste(hogarId)
  const cat = new Map(categorias.map((c) => [c.id, c]))
  const lineas = lineasDeGasto(movimientos, partes, ajuste)
  const delMes = lineas.filter((l) => l.mes === mes)

  const rubros = new Map<string, number>()
  const filas = new Map<string, FilaDeMatriz>()
  for (const l of delMes) {
    const rubro = l.rubroId ?? 'sin-rubro'
    rubros.set(rubro, (rubros.get(rubro) ?? 0) + l.monto)
    const nombre = (l.categoriaId && cat.get(l.categoriaId)?.nombre) || 'Sin categoría'
    const fila = filas.get(nombre) ?? { categoria: nombre, total: 0, porRubro: {} }
    fila.total += l.monto
    fila.porRubro[rubro] = (fila.porRubro[rubro] ?? 0) + l.monto
    filas.set(nombre, fila)
  }

  const meses = mesesHasta(mes, 6).map((k) => {
    const porRubro: Record<string, number> = {}
    for (const l of lineas) {
      if (l.mes !== k) continue
      const rubro = l.rubroId ?? 'sin-rubro'
      porRubro[rubro] = (porRubro[rubro] ?? 0) + l.monto
    }
    return { mes: k, total: sumar(Object.values(porRubro)), porRubro }
  })

  const ingresos = sumar(
    movimientos
      .filter((m) => m.tipo === 'income' && !m.anulado && m.rubroId !== ajuste)
      .filter((m) => mesDe(m.fecha) === mes)
      .map((m) => m.monto),
  )

  return {
    gastado: sumar(delMes.map((l) => l.monto)),
    gastadoAnterior: sumar(
      lineas.filter((l) => l.mes === moverMes(mes, -1)).map((l) => l.monto),
    ),
    ingresos,
    porRubro: [...rubros.entries()]
      .map(([id, total]) => ({
        id,
        nombre: cat.get(id)?.nombre ?? 'Sin rubro',
        color: cat.get(id)?.color ?? null,
        total,
      }))
      .sort((a, b) => b.total - a.total),
    matriz: [...filas.values()].sort((a, b) => b.total - a.total),
    meses,
  }
}
