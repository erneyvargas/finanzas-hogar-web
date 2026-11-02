import { horaDe, diaDe } from '../tablero/calculo'

/**
 * What the web needs to register and correct movements. The rules that
 * guard the money (balance, duplicates, closed statements) live in the
 * server functions of migration 0041; this only decides what to offer
 * and which function to call.
 */

export type Tipo = 'expense' | 'income'

export interface Cuenta {
  id: string
  nombre: string
  /** `accounts.type`, such as `cash` or `credit_card`. */
  tipo: string
  /** Not archived and not deleted. */
  viva: boolean
  /** Signed link to the account's photo; absent when it has none. */
  foto?: string | null
}

export interface CategoriaDeMovimiento {
  id: string
  nombre: string
  tipo: string
  nivel: string
  padreId: string | null
  color: string | null
  viva: boolean
}

/** A movement of the month list; transfers never get here. */
export interface FilaDeMovimiento {
  id: string
  tipo: Tipo
  monto: number
  fecha: string
  cuentaId: string
  /** The category picked when registering (`category_id`). */
  categoriaId: string | null
  rubroId: string | null
  comercio: string | null
  nota: string | null
}

export interface DatosDeMovimientos {
  hogarId: string
  movimientos: FilaDeMovimiento[]
  cuentas: Cuenta[]
  categorias: CategoriaDeMovimiento[]
}

export type FuncionDelServidor =
  | 'registrar_movimiento'
  | 'cambiar_categoria'
  | 'cambiar_cuenta'
  | 'cambiar_fecha'
  | 'cambiar_monto'
  | 'cambiar_nota'
  | 'borrar_movimiento'

export interface Llamada {
  funcion: FuncionDelServidor
  params: Record<string, unknown>
}

/** Same account types the server accepts for each kind. */
const ACEPTAN: Record<Tipo, string[]> = {
  expense: ['cash', 'debit', 'wallet', 'voucher', 'credit_card'],
  income: ['cash', 'debit', 'wallet', 'voucher', 'savings', 'investment', 'receivable'],
}

export function cuentasPara(tipo: Tipo, cuentas: Cuenta[]): Cuenta[] {
  return cuentas.filter((c) => c.viva && ACEPTAN[tipo].includes(c.tipo))
}

/**
 * The accounts of [ofrecidas] ranked by how many movements of [tipo] use
 * them, ties by name; unused ones are left out. Counting the month on
 * screen is good enough to put the usual accounts first.
 */
export function masUsadas(movimientos: FilaDeMovimiento[], tipo: Tipo, ofrecidas: Cuenta[]): string[] {
  const usos = new Map<string, number>()
  for (const m of movimientos) {
    if (m.tipo === tipo) usos.set(m.cuentaId, (usos.get(m.cuentaId) ?? 0) + 1)
  }
  return ofrecidas
    .filter((c) => usos.has(c.id))
    .sort((a, b) => usos.get(b.id)! - usos.get(a.id)! || a.nombre.localeCompare(b.nombre, 'es'))
    .map((c) => c.id)
}

/** The categories a movement of [tipo] can take: live subcategories. */
export function categoriasPara(tipo: Tipo, categorias: CategoriaDeMovimiento[]): CategoriaDeMovimiento[] {
  return categorias.filter((c) => c.viva && c.tipo === tipo && c.nivel === 'subcategory')
}

/** `Rubro › Categoría › Subcategoría`, and the rubro color. */
export function rutaDeCategoria(
  id: string | null,
  categorias: CategoriaDeMovimiento[],
): { texto: string; color: string | null } {
  const porId = new Map(categorias.map((c) => [c.id, c]))
  const nombres: string[] = []
  let color: string | null = null
  for (let c = id ? porId.get(id) : undefined; c && nombres.length < 5; c = c.padreId ? porId.get(c.padreId) : undefined) {
    nombres.unshift(c.nombre)
    color = c.color ?? color
  }
  return { texto: nombres.join(' › ') || 'Sin categoría', color }
}

/**
 * The instant to send for the Bogotá day [dia]: that day at the time of
 * day of [referencia] (now for a new movement, the original time when a
 * correction moves the day), written with Bogotá's offset.
 */
export function fechaParaServidor(dia: string, referencia: string | Date): string {
  return `${dia}T${horaDe(referencia)}-05:00`
}

export interface Edicion {
  monto: number
  categoriaId: string
  cuentaId: string
  dia: string
  nota: string
}

/** The functions a correction has to call, one per changed field. */
export function cambiosDe(original: FilaDeMovimiento, editado: Edicion): Llamada[] {
  const p_id = original.id
  const llamadas: Llamada[] = []
  if (editado.categoriaId !== original.categoriaId) {
    llamadas.push({ funcion: 'cambiar_categoria', params: { p_id, p_category_id: editado.categoriaId } })
  }
  if (editado.cuentaId !== original.cuentaId) {
    llamadas.push({ funcion: 'cambiar_cuenta', params: { p_id, p_account_id: editado.cuentaId } })
  }
  if (editado.monto !== original.monto) {
    llamadas.push({ funcion: 'cambiar_monto', params: { p_id, p_amount: editado.monto } })
  }
  if (editado.dia !== diaDe(original.fecha)) {
    llamadas.push({
      funcion: 'cambiar_fecha',
      params: { p_id, p_occurred_at: fechaParaServidor(editado.dia, original.fecha) },
    })
  }
  const nota = editado.nota.trim()
  if (nota !== (original.nota ?? '').trim()) {
    llamadas.push({ funcion: 'cambiar_nota', params: { p_id, p_note: nota || null } })
  }
  return llamadas
}

export interface Gemelo {
  movimientoId: string
  fecha: string
  comercio: string | null
}

/** A rejection of a server function, ready to show. */
export class ErrorDelServidor extends Error {
  readonly codigo: string | null
  readonly duplicado: Gemelo | null

  constructor(mensaje: string, codigo: string | null, duplicado: Gemelo | null = null) {
    super(mensaje)
    this.name = 'ErrorDelServidor'
    this.codigo = codigo
    this.duplicado = duplicado
  }
}

export const MENSAJE_GENERICO = 'No se pudo guardar. Intenta de nuevo en un momento.'

/**
 * The server rules raise SQLSTATE P0001 with the Spanish text in
 * `message` and a stable code in `details`. Anything else (network,
 * constraint, permission) gets a plain message: nothing technical.
 */
export function traducirError(e: {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}): ErrorDelServidor {
  // A duplicate key on a register means a save with this same id already
  // landed (the answer was lost on the way back): the panel takes it as saved.
  if (e.code === '23505') return new ErrorDelServidor(MENSAJE_GENERICO, 'ya_existe')
  if (e.code !== 'P0001' || !e.message) return new ErrorDelServidor(MENSAJE_GENERICO, null)
  const codigo = e.details || null
  let gemelo: Gemelo | null = null
  if (codigo === 'posible_duplicado' && e.hint) {
    try {
      const h = JSON.parse(e.hint) as { movimiento_id?: string; fecha?: string; comercio?: string | null }
      gemelo = { movimientoId: h.movimiento_id ?? '', fecha: h.fecha ?? '', comercio: h.comercio ?? null }
    } catch {
      gemelo = { movimientoId: '', fecha: '', comercio: null }
    }
  }
  if (codigo === 'posible_duplicado' && !gemelo) gemelo = { movimientoId: '', fecha: '', comercio: null }
  return new ErrorDelServidor(e.message, codigo, gemelo)
}

/** `12.000`, `$ 12000` or `12000,5` to a number; `NaN` when it is not one. */
export function leerMonto(texto: string): number {
  const limpio = texto.replace(/[$\s.]/g, '').replace(',', '.')
  return limpio ? Number(limpio) : NaN
}
