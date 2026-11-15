import type { SupabaseClient } from '@supabase/supabase-js'
import { limitesDelMes, mesDe } from '../tablero/calculo'
import { todas } from '../tablero/datos'
import type { DatosDePorVencer } from './reglas'

/** Where the «Por vencer» tab reads; tests pass a fake. It never writes. */
export interface FuenteDePorVencer {
  cargar(): Promise<DatosDePorVencer>
}

export function fuenteDePorVencerDeSupabase(sb: SupabaseClient, hogar: () => Promise<string>): FuenteDePorVencer {
  return {
    async cargar() {
      const hogarId = await hogar()
      const { desde, hasta } = limitesDelMes(mesDe(new Date().toISOString()))
      const [reglas, cuentas, cats, gastos] = await Promise.all([
        todas((a, b) =>
          sb
            .from('recurring_rules')
            .select(
              'id, name, estimated_amount, frequency, day_of_month, next_due_date, reminder_days_before, account_id, category_id, end_date',
            )
            .eq('household_id', hogarId)
            .is('deleted_at', null)
            .eq('active', true)
            .eq('kind', 'expense')
            .order('next_due_date')
            .range(a, b),
        ),
        todas((a, b) =>
          sb
            .from('accounts')
            .select('id, name, type, is_principal, due_day')
            .eq('household_id', hogarId)
            .is('deleted_at', null)
            .not('archived', 'is', true)
            .order('name')
            .range(a, b),
        ),
        todas((a, b) =>
          sb.from('categories').select('id, parent_id, color').eq('household_id', hogarId).order('id').range(a, b),
        ),
        todas((a, b) =>
          sb
            .from('transactions')
            .select('category_id')
            .eq('household_id', hogarId)
            .is('deleted_at', null)
            .not('voided', 'is', true)
            .eq('kind', 'expense')
            .gte('occurred_at', desde)
            .lt('occurred_at', hasta)
            .order('id')
            .range(a, b),
        ),
      ])
      const tarjetas = cuentas.filter((c) => c.type === 'credit_card' && c.due_day != null)
      const principal = cuentas.find((c) => c.is_principal === true)
      const transferencias =
        tarjetas.length === 0
          ? []
          : await todas((a, b) =>
              sb
                .from('transactions')
                .select('counter_account_id')
                .eq('household_id', hogarId)
                .is('deleted_at', null)
                .not('voided', 'is', true)
                .eq('kind', 'transfer')
                .in(
                  'counter_account_id',
                  tarjetas.map((t) => t.id),
                )
                .gte('occurred_at', desde)
                .lt('occurred_at', hasta)
                .order('id')
                .range(a, b),
            )
      // The phone's balance: movements up to now, a debt payment counting only its principal.
      const ahora = new Date().toISOString()
      const saldo = async (id: string) => {
        const { data, error } = await sb.rpc('saldo_por_capital', { p_account_id: id, p_hasta: ahora })
        if (error) throw new Error(error.message)
        return Number(data ?? 0)
      }
      const [saldosDeTarjetas, saldoPrincipal] = await Promise.all([
        Promise.all(tarjetas.map((t) => saldo(t.id))),
        principal ? saldo(principal.id) : Promise.resolve(null),
      ])

      // A category without a color takes its nearest parent's.
      const porId = new Map(cats.map((c) => [c.id, c]))
      const colorDe = (id: string | null): string | null => {
        for (let c = id ? porId.get(id) : undefined, n = 0; c && n < 5; c = porId.get(c.parent_id), n++) {
          if (c.color) return c.color
        }
        return null
      }
      const inicioDelMes = desde.slice(0, 7)

      return {
        hogarId,
        reglas: reglas
          .filter((r) => r.end_date == null || r.end_date >= `${inicioDelMes}-01`)
          .map((r) => ({
            id: r.id,
            nombre: r.name,
            monto: Number(r.estimated_amount),
            frecuencia: r.frequency,
            diaDelMes: r.day_of_month ?? null,
            proximaFecha: r.next_due_date,
            avisoDias: r.reminder_days_before ?? 1,
            cuentaId: r.account_id,
            categoriaId: r.category_id ?? null,
            color: colorDe(r.category_id ?? null),
          })),
        tarjetas: tarjetas.map((t, i) => ({ id: t.id, nombre: t.name, diaDePago: t.due_day, deuda: -saldosDeTarjetas[i] })),
        cuentas: cuentas.map((c) => ({ id: c.id, nombre: c.name, principal: c.is_principal === true })),
        saldoPrincipal,
        gastosDelMes: gastos.map((g) => ({ categoriaId: g.category_id ?? null })),
        transferenciasDelMes: transferencias.map((t) => ({ haciaCuentaId: t.counter_account_id })),
      }
    },
  }
}
