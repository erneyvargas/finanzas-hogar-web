import type { SupabaseClient } from '@supabase/supabase-js'
import { diaDe, limitesDelMes, mesDe } from '../tablero/calculo'
import { todas } from '../tablero/datos'
import { DIAS_DE_HOLGURA, type DatosDePorVencer, type Extracto } from './reglas'

/** Where the «Por vencer» tab reads; tests pass a fake. It never writes. */
export interface FuenteDePorVencer {
  cargar(): Promise<DatosDePorVencer>
}

export function fuenteDePorVencerDeSupabase(sb: SupabaseClient, hogar: () => Promise<string>): FuenteDePorVencer {
  return {
    async cargar() {
      const hogarId = await hogar()
      const { desde, hasta } = limitesDelMes(mesDe(new Date().toISOString()))
      // An expense up to 10 days before the month can pay a bill due early in it.
      const desdeConHolgura = new Date(Date.parse(desde) - DIAS_DE_HOLGURA * 86_400_000).toISOString()
      const [reglas, cuentas, cats, gastos] = await Promise.all([
        todas((a, b) =>
          sb
            .from('recurring_rules')
            .select(
              'id, name, kind, estimated_amount, frequency, day_of_month, next_due_date, reminder_days_before, account_id, category_id, debt_id, end_date',
            )
            .eq('household_id', hogarId)
            .is('deleted_at', null)
            .eq('active', true)
            .in('kind', ['expense', 'debt_payment'])
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
            .select('category_id, occurred_at')
            .eq('household_id', hogarId)
            .is('deleted_at', null)
            .not('voided', 'is', true)
            .eq('kind', 'expense')
            .gte('occurred_at', desdeConHolgura)
            .lt('occurred_at', hasta)
            .order('id')
            .range(a, b),
        ),
      ])
      // A debt rule pays its debt's loan account; a debt payment near its date pays it.
      const deudasDeReglas = [...new Set(reglas.map((r) => r.debt_id as string | null).filter((x): x is string => !!x))]
      const [deudas, abonos] =
        deudasDeReglas.length === 0
          ? [[], []]
          : await Promise.all([
              todas((a, b) =>
                sb.from('debts').select('id, account_id').in('id', deudasDeReglas).order('id').range(a, b),
              ),
              todas((a, b) =>
                sb
                  .from('transactions')
                  .select('debt_id, occurred_at')
                  .eq('household_id', hogarId)
                  .is('deleted_at', null)
                  .not('voided', 'is', true)
                  .eq('kind', 'debt_payment')
                  .in('debt_id', deudasDeReglas)
                  .gte('occurred_at', desdeConHolgura)
                  .lt('occurred_at', hasta)
                  .order('id')
                  .range(a, b),
              ),
            ])
      const prestamoDe = new Map<string, string | null>(deudas.map((x) => [x.id as string, (x.account_id as string) ?? null]))
      const tarjetas = cuentas.filter((c) => c.type === 'credit_card' && c.due_day != null)
      const principal = cuentas.find((c) => c.is_principal === true)
      // The last billed statement of each card (the phone's observarExtractosPorPagar):
      // an `open` one is a projection the bank has not billed yet.
      const extractos =
        tarjetas.length === 0
          ? []
          : await todas((a, b) =>
              sb
                .from('card_statements')
                .select('account_id, cut_date, due_date, statement_balance, minimum_payment, status')
                .eq('household_id', hogarId)
                .is('deleted_at', null)
                .neq('status', 'open')
                .in(
                  'account_id',
                  tarjetas.map((t) => t.id),
                )
                .order('cut_date', { ascending: false })
                .range(a, b),
            )
      const ultimo = new Map<string, Extracto>()
      for (const e of extractos) {
        if (ultimo.has(e.account_id)) continue
        ultimo.set(e.account_id, {
          corte: e.cut_date,
          vence: e.due_date,
          saldo: Number(e.statement_balance),
          minimo: Number(e.minimum_payment),
          pagado: e.status === 'paid',
        })
      }
      // Payments into a card after its last cut count for that statement (abonadoAlExtracto).
      const cortes = [...ultimo.values()].map((e) => e.corte).sort()
      const pagos =
        cortes.length === 0
          ? []
          : await todas((a, b) =>
              sb
                .from('transactions')
                .select('counter_account_id, amount, occurred_at')
                .eq('household_id', hogarId)
                .is('deleted_at', null)
                .not('voided', 'is', true)
                .in('kind', ['transfer', 'debt_payment'])
                .in('counter_account_id', [...ultimo.keys()])
                .gte('occurred_at', limitesDelMes(cortes[0].slice(0, 7)).desde)
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
      // Every account that pays something, and the cards for their debt.
      const pagadoras = [
        ...new Set([...reglas.map((r) => r.account_id as string), ...(principal ? [principal.id] : []), ...tarjetas.map((t) => t.id)]),
      ]
      const valores = await Promise.all(pagadoras.map(saldo))
      const saldos = Object.fromEntries(pagadoras.map((id, i) => [id, valores[i]]))

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
            deudaId: r.kind === 'debt_payment' ? (r.debt_id ?? null) : null,
            destinoId: r.kind === 'debt_payment' && r.debt_id ? (prestamoDe.get(r.debt_id) ?? null) : null,
          })),
        tarjetas: tarjetas.map((t) => ({
          id: t.id,
          nombre: t.name,
          diaDePago: t.due_day,
          deuda: -saldos[t.id],
          extracto: ultimo.get(t.id) ?? null,
        })),
        cuentas: cuentas.map((c) => ({ id: c.id, nombre: c.name, principal: c.is_principal === true })),
        saldos,
        gastos: gastos.map((g) => ({ categoriaId: g.category_id ?? null, dia: diaDe(g.occurred_at) })),
        abonos: abonos.map((x) => ({ deudaId: x.debt_id as string, dia: diaDe(x.occurred_at) })),
        pagosATarjetas: pagos.map((p) => ({ haciaCuentaId: p.counter_account_id, dia: diaDe(p.occurred_at), monto: Number(p.amount) })),
      }
    },
  }
}
