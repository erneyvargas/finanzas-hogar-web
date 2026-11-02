import type { SupabaseClient } from '@supabase/supabase-js'
import { limitesDelMes } from '../tablero/calculo'
import { todas } from '../tablero/datos'
import { traducirError, type DatosDeMovimientos, type FuncionDelServidor, type Tipo } from './reglas'

/**
 * Where the movements list and panel read and write; tests pass a fake.
 * Writes go only through the server functions (migration 0041), never
 * straight to `transactions`.
 */
export interface FuenteDeMovimientos {
  cargar(mes: string): Promise<DatosDeMovimientos>
  /** `saldo_de_cuenta`; `null` when the account cannot be seen. */
  saldo(cuentaId: string): Promise<number | null>
  /** Calls a server function; rejects with an `ErrorDelServidor`. */
  ejecutar(funcion: FuncionDelServidor, params: Record<string, unknown>): Promise<void>
}

/** The phone uploads account and category photos to this private bucket. */
const BUCKET_DE_FOTOS = 'categorias'

/**
 * Signed links for the account photos, by path. The bucket is private, so
 * the stored path is useless without a signature; one that cannot be
 * signed just leaves the initials, as when there is no photo.
 */
async function firmarFotos(sb: SupabaseClient, rutas: string[]): Promise<Map<string, string>> {
  const enlaces = new Map<string, string>()
  if (rutas.length === 0) return enlaces
  try {
    const { data } = await sb.storage.from(BUCKET_DE_FOTOS).createSignedUrls(rutas, 60 * 60 * 12)
    for (const f of data ?? []) if (f.path && f.signedUrl && !f.error) enlaces.set(f.path, f.signedUrl)
  } catch {
    // No photos is not worth an error: the initials stand in.
  }
  return enlaces
}

export function fuenteDeMovimientosDeSupabase(
  sb: SupabaseClient,
  hogar: () => Promise<string>,
): FuenteDeMovimientos {
  return {
    async cargar(mes) {
      const hogarId = await hogar()
      const { desde, hasta } = limitesDelMes(mes)
      const [movs, cuentas, cats] = await Promise.all([
        todas((a, b) =>
          sb
            .from('transactions')
            .select('id, kind, amount, occurred_at, account_id, category_id, rubro_id, merchant_name, note')
            .eq('household_id', hogarId)
            .is('deleted_at', null)
            .not('voided', 'is', true)
            .in('kind', ['expense', 'income'])
            .gte('occurred_at', desde)
            .lt('occurred_at', hasta)
            .order('occurred_at', { ascending: false })
            .range(a, b),
        ),
        todas((a, b) =>
          sb
            .from('accounts')
            .select('id, name, type, archived, deleted_at, image_path')
            .eq('household_id', hogarId)
            .order('name')
            .range(a, b),
        ),
        todas((a, b) =>
          sb
            .from('categories')
            .select('id, name, kind, level, parent_id, color, archived, deleted_at')
            .eq('household_id', hogarId)
            .order('name')
            .range(a, b),
        ),
      ])
      const fotos = await firmarFotos(
        sb,
        cuentas.map((c) => c.image_path).filter((r): r is string => !!r),
      )
      return {
        hogarId,
        movimientos: movs.map((m) => ({
          id: m.id,
          tipo: m.kind as Tipo,
          monto: Number(m.amount),
          fecha: m.occurred_at,
          cuentaId: m.account_id,
          categoriaId: m.category_id,
          rubroId: m.rubro_id,
          comercio: m.merchant_name,
          nota: m.note,
        })),
        cuentas: cuentas.map((c) => ({
          id: c.id,
          nombre: c.name,
          tipo: c.type,
          viva: c.archived !== true && c.deleted_at == null,
          foto: c.image_path ? (fotos.get(c.image_path) ?? null) : null,
        })),
        categorias: cats.map((c) => ({
          id: c.id,
          nombre: c.name,
          tipo: c.kind,
          nivel: c.level,
          padreId: c.parent_id,
          color: c.color,
          viva: c.archived !== true && c.deleted_at == null,
        })),
      }
    },

    async saldo(cuentaId) {
      const { data, error } = await sb.rpc('saldo_de_cuenta', { p_account_id: cuentaId })
      if (error || data == null) return null
      return Number(data)
    },

    async ejecutar(funcion, params) {
      let respuesta
      try {
        respuesta = await sb.rpc(funcion, params)
      } catch {
        throw traducirError({})
      }
      if (respuesta.error) throw traducirError(respuesta.error)
    },
  }
}
