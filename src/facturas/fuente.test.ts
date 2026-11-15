import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { fuenteDeFacturasDeSupabase } from './fuente'

/** A query builder that records every call and resolves to [filas]. */
function consulta(filas: unknown[], llamadas: unknown[][]) {
  const cadena: Record<string, unknown> = {}
  for (const metodo of ['select', 'eq', 'neq', 'is', 'order']) {
    cadena[metodo] = (...args: unknown[]) => {
      llamadas.push([metodo, ...args])
      return cadena
    }
  }
  cadena.then = (listo: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve(listo({ data: filas, error: null }))
  return cadena
}

describe('the open debts a payslip can pay', () => {
  it('reads the live active debts the household owes, by start date', async () => {
    const llamadas: unknown[][] = []
    const sb = {
      from: (tabla: string) => {
        llamadas.push(['from', tabla])
        return consulta(
          [
            { id: 'col', name: 'Libranza Colsubsidio', installments_total: 24, installments_paid: 6 },
            { id: 'dav', name: 'Crédito Davivienda', installments_total: null, installments_paid: 0 },
          ],
          llamadas,
        )
      },
    } as unknown as SupabaseClient
    const fuente = fuenteDeFacturasDeSupabase(sb, async () => 'h1')

    const deudas = await fuente.deudas!()

    expect(deudas).toEqual([
      { id: 'col', nombre: 'Libranza Colsubsidio', cuotasRestantes: 18 },
      { id: 'dav', nombre: 'Crédito Davivienda', cuotasRestantes: null },
    ])
    expect(llamadas).toEqual([
      ['from', 'debts'],
      ['select', 'id, name, installments_total, installments_paid'],
      ['eq', 'household_id', 'h1'],
      ['is', 'deleted_at', null],
      ['eq', 'status', 'active'],
      // Debts owed to us are collected, not paid from a payslip.
      ['neq', 'direction', 'owed_to_me'],
      ['order', 'start_date'],
    ])
  })
})
