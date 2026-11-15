import type { SupabaseClient } from '@supabase/supabase-js'
import { limitesDelMes } from '../tablero/calculo'
import { todas } from '../tablero/datos'
import { BUCKET_DE_FOTOS, firmarFotos } from '../movimientos/fuente'
import { categoriasPara, rutaDeCategoria, traducirError, type CategoriaDeMovimiento } from '../movimientos/reglas'
import type { DatosDeCuentas, MovimientoDeCuenta, TipoDeCuenta } from './reglas'

/** The account functions of migration 0048. */
export type FuncionDeCuentas =
  | 'crear_cuenta'
  | 'marcar_cuenta_principal'
  | 'cambiar_tipo_de_cuenta'
  | 'cambiar_gmf_de_cuenta'
  | 'cambiar_foto_de_cuenta'
  | 'cambiar_estilo_de_tarjeta'
  | 'ajustar_saldo_de_cuenta'
  | 'registrar_transferencia'
  | 'renombrar_cuenta'
  | 'editar_tarjeta'
  | 'archivar_cuenta'
  | 'desarchivar_cuenta'

/**
 * Where the «Cuentas» tab reads and writes; tests pass a fake. Writes go
 * only through the server functions of migration 0048, never straight
 * to `accounts` or `transactions`.
 */
export interface FuenteDeCuentas {
  cargar(): Promise<DatosDeCuentas>
  /** The movements of [mes] that touch the account, from either side. */
  movimientos(cuentaId: string, mes: string): Promise<MovimientoDeCuenta[]>
  /** Calls a server function; rejects with an `ErrorDelServidor`. */
  ejecutar(funcion: FuncionDeCuentas, params: Record<string, unknown>): Promise<unknown>
  /** Uploads the photo where the phone puts it and returns its path. */
  subirFoto(hogarId: string, cuentaId: string, archivo: File): Promise<string>
  /** Removes a replaced photo; a failure only leaves an orphan file. */
  borrarFoto(ruta: string): Promise<void>
}

export function fuenteDeCuentasDeSupabase(sb: SupabaseClient, hogar: () => Promise<string>): FuenteDeCuentas {
  return {
    async cargar() {
      const hogarId = await hogar()
      const [cuentas, deudas, cats] = await Promise.all([
        todas((a, b) =>
          sb
            .from('accounts')
            .select(
              'id, name, type, archived, is_principal, image_path, credit_limit, cut_day, due_day, applies_gmf, gmf_category_id, card_style',
            )
            .eq('household_id', hogarId)
            .is('deleted_at', null)
            .order('name')
            .range(a, b),
        ),
        todas((a, b) =>
          sb
            .from('debts')
            .select('account_id, installments_paid, installments_total')
            .eq('household_id', hogarId)
            .is('deleted_at', null)
            .eq('status', 'active')
            .not('account_id', 'is', null)
            .order('id')
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
      // The phone's balance (sqlDeSaldo): movements up to now, a debt
      // payment counting only its principal. One call per account.
      const ahora = new Date().toISOString()
      const saldos = await Promise.all(
        cuentas.map(async (c) => {
          const { data, error } = await sb.rpc('saldo_por_capital', { p_account_id: c.id, p_hasta: ahora })
          if (error) throw new Error(error.message)
          return Number(data ?? 0)
        }),
      )
      const fotos = await firmarFotos(
        sb,
        cuentas.map((c) => c.image_path).filter((r): r is string => !!r),
      )
      const categorias: CategoriaDeMovimiento[] = cats.map((c) => ({
        id: c.id,
        nombre: c.name,
        tipo: c.kind,
        nivel: c.level,
        padreId: c.parent_id,
        color: c.color,
        viva: c.archived !== true && c.deleted_at == null,
      }))
      return {
        hogarId,
        cuentas: cuentas.map((c, i) => ({
          id: c.id,
          nombre: c.name,
          tipo: c.type as TipoDeCuenta,
          saldo: saldos[i],
          archivada: c.archived === true,
          principal: c.is_principal === true,
          foto: c.image_path ? (fotos.get(c.image_path) ?? null) : null,
          rutaDeFoto: c.image_path ?? null,
          cupo: c.credit_limit == null ? null : Number(c.credit_limit),
          diaDeCorte: c.cut_day ?? null,
          diaDePago: c.due_day ?? null,
          cobraGmf: c.applies_gmf === true,
          categoriaGmf: c.gmf_category_id ?? null,
          estilo: c.card_style ?? null,
        })),
        deudas: deudas.map((d) => ({
          cuentaId: d.account_id,
          cuotasPagadas: d.installments_paid ?? 0,
          cuotasTotales: d.installments_total ?? null,
        })),
        categoriasDeGasto: categoriasPara('expense', categorias).map((c) => ({
          id: c.id,
          ruta: rutaDeCategoria(c.id, categorias).texto,
        })),
      }
    },

    async movimientos(cuentaId, mes) {
      const hogarId = await hogar()
      const { desde, hasta } = limitesDelMes(mes)
      const filas = await todas((a, b) =>
        sb
          .from('transactions')
          .select('id, kind, amount, occurred_at, account_id, counter_account_id, merchant_name, note')
          .eq('household_id', hogarId)
          .is('deleted_at', null)
          .not('voided', 'is', true)
          .or(`account_id.eq.${cuentaId},counter_account_id.eq.${cuentaId}`)
          .gte('occurred_at', desde)
          .lt('occurred_at', hasta)
          .order('occurred_at', { ascending: false })
          .range(a, b),
      )
      return filas.map((m) => ({
        id: m.id,
        tipo: m.kind,
        monto: Number(m.amount),
        fecha: m.occurred_at,
        cuentaId: m.account_id,
        contracuentaId: m.counter_account_id,
        comercio: m.merchant_name,
        nota: m.note,
      }))
    },

    async ejecutar(funcion, params) {
      let respuesta
      try {
        respuesta = await sb.rpc(funcion, params)
      } catch {
        throw traducirError({})
      }
      if (respuesta.error) throw traducirError(respuesta.error)
      return respuesta.data
    },

    async subirFoto(hogarId, cuentaId, archivo) {
      // The phone's path: `<household>/<account>-<instant>.<ext>`. A new
      // name each time, so the row changes and other devices re-sign it.
      const extension = (archivo.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      const ruta = `${hogarId}/${cuentaId}-${Date.now()}.${extension}`
      const { error } = await sb.storage.from(BUCKET_DE_FOTOS).upload(ruta, archivo, { upsert: true })
      if (error) throw traducirError({})
      return ruta
    },

    async borrarFoto(ruta) {
      try {
        await sb.storage.from(BUCKET_DE_FOTOS).remove([ruta])
      } catch {
        // An orphan file costs a few kilobytes.
      }
    },
  }
}
