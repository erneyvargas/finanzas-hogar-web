import type { SupabaseClient } from '@supabase/supabase-js'
import { limitesDelMes, moverMes, type Categoria, type Movimiento, type Parte } from './calculo'

/** Supabase answers at most 1000 rows per request; this reads them all. */
export async function todas<T>(
  pedir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const pagina = 1000
  const filas: T[] = []
  for (let desde = 0; ; desde += pagina) {
    const { data, error } = await pedir(desde, desde + pagina - 1)
    if (error) throw new Error(error.message)
    filas.push(...(data ?? []))
    if (!data || data.length < pagina) return filas
  }
}

/**
 * The household of the signed-in user. The app is for its owner, who has
 * one household; with several, the first one joined is used.
 */
export async function hogarDelUsuario(sb: SupabaseClient): Promise<string> {
  const { data: usuario } = await sb.auth.getUser()
  const { data, error } = await sb
    .from('household_members')
    .select('household_id')
    .eq('user_id', usuario.user?.id ?? '')
    .order('joined_at', { ascending: true })
    .limit(1)
  if (error) throw new Error(error.message)
  const id = data?.[0]?.household_id as string | undefined
  if (!id) throw new Error('Tu cuenta no tiene un hogar todavía.')
  return id
}

export interface DatosDelTablero {
  movimientos: Movimiento[]
  partes: Parte[]
  categorias: Categoria[]
}

/**
 * Everything the dashboard needs for [mes] and the five months before
 * it: movements, the parts of split invoices and the categories. Row
 * level security already limits the rows to the user's household.
 */
export async function cargarTablero(
  sb: SupabaseClient,
  hogarId: string,
  mes: string,
): Promise<DatosDelTablero> {
  const { desde } = limitesDelMes(moverMes(mes, -5))
  const { hasta } = limitesDelMes(mes)

  const [movs, partes, cats] = await Promise.all([
    todas((a, b) =>
      sb
        .from('transactions')
        .select('id, kind, amount, occurred_at, rubro_id, category_l2_id, voided')
        .eq('household_id', hogarId)
        .is('deleted_at', null)
        .in('kind', ['expense', 'income'])
        .gte('occurred_at', desde)
        .lt('occurred_at', hasta)
        .order('occurred_at')
        .range(a, b),
    ),
    todas((a, b) =>
      sb
        .from('transaction_splits')
        .select('transaction_id, amount, rubro_id, category_l2_id')
        .eq('household_id', hogarId)
        .is('deleted_at', null)
        .order('id')
        .range(a, b),
    ),
    todas((a, b) =>
      sb
        .from('categories')
        .select('id, name, level, color')
        .eq('household_id', hogarId)
        .order('id')
        .range(a, b),
    ),
  ])

  return {
    movimientos: movs.map((m) => ({
      id: m.id,
      tipo: m.kind,
      monto: Number(m.amount),
      fecha: m.occurred_at,
      rubroId: m.rubro_id,
      categoriaId: m.category_l2_id,
      anulado: m.voided === true,
    })),
    partes: partes.map((p) => ({
      movimientoId: p.transaction_id,
      monto: Number(p.amount),
      rubroId: p.rubro_id,
      categoriaId: p.category_l2_id,
    })),
    categorias: cats.map((c) => ({
      id: c.id,
      nombre: c.name,
      nivel: c.level,
      color: c.color,
    })),
  }
}
