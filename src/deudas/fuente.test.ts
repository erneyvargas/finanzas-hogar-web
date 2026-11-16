import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { idDelRubroDeAjuste } from '../tablero/calculo'
import { fuenteDelPlanDeSupabase } from './fuente'

/** A query builder that ignores its filters and resolves to [filas]. */
function consulta(filas: unknown[]) {
  const cadena: Record<string, unknown> = {}
  for (const metodo of ['select', 'eq', 'is', 'not', 'in', 'gte', 'lt', 'order', 'range']) cadena[metodo] = () => cadena
  cadena.then = (listo: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve(listo({ data: filas, error: null }))
  return cadena
}

const deuda = (o: Record<string, unknown>) => ({
  direction: 'i_owe',
  monthly_rate: 0,
  installment_amount: null,
  seguro_vida: 0,
  seguro_hogar: 0,
  proteccion_pagos: 0,
  otros_cargos: 0,
  start_date: '2026-01-10',
  account_id: null,
  ...o,
})

describe('where the debt plan reads', () => {
  it('computes each balance like the phone and the surplus of the last 3 months', async () => {
    const tablas: Record<string, unknown[]> = {
      debts: [
        // Linked to its loan account: the magnitude of that account's balance.
        deuda({ id: 'hip', name: 'Hipotecario', original_amount: 130000000, monthly_rate: 0.0088859305, installment_amount: 1357000, seguro_vida: 50000, seguro_hogar: 20040, account_id: 'cta-hip' }),
        // Not linked: the original amount minus the principal of its live payments.
        deuda({ id: 'pertuz', name: 'Pertuz', original_amount: 1000000 }),
        deuda({ id: 'medeben', name: 'Me deben', original_amount: 500000, direction: 'owed_to_me' }),
      ],
      card_installment_plans: [
        { id: 'tv', description: 'TV', total_amount: 1200000, installments_total: 12, installments_charged: 3, monthly_principal: 100000, rate_monthly: 0, active: true },
      ],
      debt_payment_details: [
        { transaction_id: 't1', debt_id: 'pertuz', principal_amount: 200000, transactions: { deleted_at: null, voided: false } },
        { transaction_id: 't2', debt_id: 'pertuz', principal_amount: 300000, transactions: { deleted_at: '2026-10-01', voided: false } },
        { transaction_id: 't3', debt_id: 'pertuz', principal_amount: 100000, transactions: { deleted_at: null, voided: true } },
      ],
      transactions: [
        { kind: 'income', amount: 9000000, rubro_id: null },
        { kind: 'expense', amount: 5400000, rubro_id: 'hogar' },
        // An adjustment is not money that came in.
        { kind: 'income', amount: 3000000, rubro_id: idDelRubroDeAjuste('h1') },
        // The yield written into a savings account is not available money
        // (phone repo, odd/tasks/rendimiento-de-ahorros.md S4).
        { kind: 'income', amount: 7347.49, rubro_id: null, cuenta: { type: 'savings' } },
      ],
    }
    const rpc = vi.fn(async () => ({ data: -124754493, error: null }))
    const sb = { from: (t: string) => consulta(tablas[t] ?? []), rpc } as unknown as SupabaseClient

    const datos = await fuenteDelPlanDeSupabase(sb, async () => 'h1').cargar()

    expect(rpc).toHaveBeenCalledWith('saldo_por_capital', expect.objectContaining({ p_account_id: 'cta-hip' }))
    expect(datos.deudas).toEqual([
      { id: 'hip', nombre: 'Hipotecario', saldo: 124754493, tasaMensual: 0.0088859305, minimo: 1286960, cargoFijo: 70040, capitaliza: false },
      { id: 'pertuz', nombre: 'Pertuz', saldo: 800000, tasaMensual: 0, minimo: 0, cargoFijo: 0, capitaliza: false },
      { id: 'tv', nombre: 'TV', saldo: 900000, tasaMensual: 0, minimo: 100000, cargoFijo: 0, capitaliza: false },
    ])
    expect(datos.sobrante).toBe(1200000)
  })
})
