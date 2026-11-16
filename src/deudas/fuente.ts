import type { SupabaseClient } from '@supabase/supabase-js'
import { diaDe, esIngresoDisponible, idDelRubroDeAjuste, limitesDelMes, moverMes } from '../tablero/calculo'
import { todas } from '../tablero/datos'
import { deudasDelPlan, diferidosDelPlan, sobrante, type DeudaCruda, type DeudaDelPlan } from './plan'

/** Months before the current one whose average is the computed surplus. */
const MESES_DEL_SOBRANTE = 3

export interface DatosDelPlan {
  /** The debts as they enter the simulation: loans first, then the cards' deferred purchases. */
  deudas: DeudaDelPlan[]
  /** The app's computed surplus: the average of the last full months, never below zero. */
  sobrante: number
}

/** Where the «Deudas» tab reads; tests pass a fake. Read-only: nothing is written. */
export interface FuenteDelPlan {
  cargar(): Promise<DatosDelPlan>
}

const n = (v: unknown) => Number(v ?? 0)

export function fuenteDelPlanDeSupabase(sb: SupabaseClient, hogar: () => Promise<string>): FuenteDelPlan {
  return {
    async cargar() {
      const hogarId = await hogar()
      const hoy = diaDe(new Date())
      const mes = hoy.slice(0, 7)
      // The phone's sobranteMensual: the full months before this one.
      const desde = limitesDelMes(moverMes(mes, -MESES_DEL_SOBRANTE)).desde
      const hasta = limitesDelMes(mes).desde
      const [deudas, diferidos, movimientos] = await Promise.all([
        // DeudaRepository.observar: active debts in start date order.
        todas((a, b) =>
          sb
            .from('debts')
            .select(
              'id, name, direction, original_amount, monthly_rate, installment_amount, seguro_vida, seguro_hogar, proteccion_pagos, otros_cargos, start_date, account_id',
            )
            .eq('household_id', hogarId)
            .is('deleted_at', null)
            .eq('status', 'active')
            .order('start_date')
            .order('id')
            .range(a, b),
        ),
        todas((a, b) =>
          sb
            .from('card_installment_plans')
            .select('id, description, total_amount, installments_total, installments_charged, monthly_principal, rate_monthly, active')
            .eq('household_id', hogarId)
            .is('deleted_at', null)
            .eq('active', true)
            .order('next_charge_date')
            .order('id')
            .range(a, b),
        ),
        // Income against expenses, without transfers, debt payments, voided,
        // debt-tagged rows (their interest is in the installment) or adjustments.
        todas((a, b) =>
          sb
            .from('transactions')
            .select('kind, amount, rubro_id, cuenta:accounts!account_id(type)')
            .eq('household_id', hogarId)
            .is('deleted_at', null)
            .not('voided', 'is', true)
            .in('kind', ['income', 'expense'])
            .is('debt_id', null)
            .gte('occurred_at', desde)
            .lt('occurred_at', hasta)
            .order('id')
            .range(a, b),
        ),
      ])

      const propias = deudas.filter((d) => d.direction === 'i_owe')
      const enlazadas = propias.filter((d) => d.account_id)
      const sueltas = propias.filter((d) => !d.account_id)

      // A loan linked to its account: the magnitude of the account's balance
      // (negative, it is credit), the phone's balance up to now.
      const ahora = new Date().toISOString()
      const saldoDeCuenta = async (id: string) => {
        const { data, error } = await sb.rpc('saldo_por_capital', { p_account_id: id, p_hasta: ahora })
        if (error) throw new Error(error.message)
        return Number(data ?? 0)
      }
      // Else the original amount minus the principal of its live payments.
      const [valores, detalles] = await Promise.all([
        Promise.all(enlazadas.map((d) => saldoDeCuenta(d.account_id as string))),
        sueltas.length === 0
          ? Promise.resolve([])
          : todas((a, b) =>
              sb
                .from('debt_payment_details')
                .select('transaction_id, debt_id, principal_amount, transactions(deleted_at, voided)')
                .in(
                  'debt_id',
                  sueltas.map((d) => d.id),
                )
                .order('transaction_id')
                .range(a, b),
            ),
      ])
      const saldoEnlazada = new Map(enlazadas.map((d, i) => [d.id as string, Math.max(0, -valores[i])]))
      const abonado = new Map<string, number>()
      for (const p of detalles) {
        const t = (Array.isArray(p.transactions) ? p.transactions[0] : p.transactions) as { deleted_at: string | null; voided: boolean | null } | null
        if (!t || t.deleted_at != null || t.voided === true) continue
        abonado.set(p.debt_id, (abonado.get(p.debt_id) ?? 0) + n(p.principal_amount))
      }

      const crudas: DeudaCruda[] = propias.map((d) => ({
        id: d.id,
        nombre: d.name,
        saldo: saldoEnlazada.get(d.id) ?? Math.max(0, n(d.original_amount) - (abonado.get(d.id) ?? 0)),
        tasaMensual: n(d.monthly_rate),
        cuota: d.installment_amount == null ? null : n(d.installment_amount),
        cargos: n(d.seguro_vida) + n(d.seguro_hogar) + n(d.proteccion_pagos) + n(d.otros_cargos),
        inicio: d.start_date ? String(d.start_date).slice(0, 10) : null,
        nosDeben: false,
      }))

      const ajuste = idDelRubroDeAjuste(hogarId)
      let ingresos = 0
      let gastos = 0
      for (const m of movimientos) {
        if (m.rubro_id === ajuste) continue
        if (m.kind === 'income') {
          // Income into savings is owned, not available to pay debts.
          if (esIngresoDisponible((m.cuenta as { type?: string } | null)?.type)) ingresos += n(m.amount)
        } else gastos += n(m.amount)
      }

      return {
        deudas: [
          ...deudasDelPlan(crudas, hoy),
          ...diferidosDelPlan(
            diferidos.map((p) => ({
              id: p.id,
              descripcion: p.description,
              total: n(p.total_amount),
              cuotas: n(p.installments_total),
              cobradas: n(p.installments_charged),
              capitalMensual: n(p.monthly_principal),
              tasaMensual: n(p.rate_monthly),
              activo: p.active === true,
            })),
          ),
        ],
        sobrante: sobrante(ingresos, gastos, MESES_DEL_SOBRANTE),
      }
    },
  }
}
