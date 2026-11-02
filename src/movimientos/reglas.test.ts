import { describe, expect, it } from 'vitest'
import {
  ErrorDelServidor,
  cambiosDe,
  categoriasPara,
  cuentasPara,
  fechaParaServidor,
  masUsadas,
  rutaDeCategoria,
  traducirError,
  type CategoriaDeMovimiento,
  type Cuenta,
  type FilaDeMovimiento,
} from './reglas'

const cuentas: Cuenta[] = [
  { id: 'efe', nombre: 'Efectivo', tipo: 'cash', viva: true },
  { id: 'tc', nombre: 'Master Card BBVA', tipo: 'credit_card', viva: true },
  { id: 'aho', nombre: 'Ahorros', tipo: 'savings', viva: true },
  { id: 'vieja', nombre: 'Vieja', tipo: 'debit', viva: false },
  { id: 'prestamo', nombre: 'Préstamo', tipo: 'loan', viva: true },
]

const categorias: CategoriaDeMovimiento[] = [
  { id: 'hogar', nombre: 'Hogar', tipo: 'expense', nivel: 'rubro', padreId: null, color: 'musgo', viva: true },
  { id: 'mercado', nombre: 'Mercado', tipo: 'expense', nivel: 'category', padreId: 'hogar', color: null, viva: true },
  { id: 'frutas', nombre: 'Frutas y verduras', tipo: 'expense', nivel: 'subcategory', padreId: 'mercado', color: null, viva: true },
  { id: 'carnes', nombre: 'Carnes', tipo: 'expense', nivel: 'subcategory', padreId: 'mercado', color: null, viva: false },
  { id: 'sueldo', nombre: 'Sueldo', tipo: 'income', nivel: 'subcategory', padreId: null, color: null, viva: true },
]

function fila(parcial: Partial<FilaDeMovimiento>): FilaDeMovimiento {
  return {
    id: 'm1', tipo: 'expense', monto: 5000, fecha: '2026-10-24T20:00:00Z', cuentaId: 'tc',
    categoriaId: 'frutas', rubroId: 'hogar', comercio: 'Aguacate', nota: null, ...parcial,
  }
}

describe('accounts offered for a movement', () => {
  it('an expense goes out of cash, debit, wallet, voucher or credit card accounts that are alive', () => {
    expect(cuentasPara('expense', cuentas).map((c) => c.id)).toEqual(['efe', 'tc'])
  })

  it('an income goes into cash, savings and the other income accounts, never a credit card', () => {
    expect(cuentasPara('income', cuentas).map((c) => c.id)).toEqual(['efe', 'aho'])
  })

  it('the most used are the accounts that appear most in the movements of that kind', () => {
    const movs = [
      fila({ cuentaId: 'tc' }), fila({ cuentaId: 'efe' }), fila({ cuentaId: 'efe' }),
      fila({ cuentaId: 'aho', tipo: 'income' }), fila({ cuentaId: 'aho', tipo: 'income' }),
      fila({ cuentaId: 'aho', tipo: 'income' }),
    ]
    expect(masUsadas(movs, 'expense', cuentasPara('expense', cuentas))).toEqual(['efe', 'tc'])
  })
})

describe('categories', () => {
  it('offers only live subcategories of the kind', () => {
    expect(categoriasPara('expense', categorias).map((c) => c.id)).toEqual(['frutas'])
  })

  it('names a category with its whole path', () => {
    expect(rutaDeCategoria('frutas', categorias)).toEqual({
      texto: 'Hogar › Mercado › Frutas y verduras',
      color: 'musgo',
    })
  })
})

describe('dates', () => {
  it('sends the chosen Bogotá day at the time of day of the reference', () => {
    // 20:30 UTC is 15:30 in Bogotá.
    expect(fechaParaServidor('2026-10-25', new Date('2026-10-28T20:30:05Z'))).toBe(
      '2026-10-25T15:30:05-05:00',
    )
  })
})

describe('changes of a correction', () => {
  const original = fila({})
  const igual = { monto: 5000, categoriaId: 'frutas', cuentaId: 'tc', dia: '2026-10-24', nota: '' }

  it('without changes there is nothing to call', () => {
    expect(cambiosDe(original, igual)).toEqual([])
  })

  it('each changed field calls only its function', () => {
    expect(cambiosDe(original, { ...igual, monto: 6000, nota: 'Para el desayuno' })).toEqual([
      { funcion: 'cambiar_monto', params: { p_id: 'm1', p_amount: 6000 } },
      { funcion: 'cambiar_nota', params: { p_id: 'm1', p_note: 'Para el desayuno' } },
    ])
    expect(cambiosDe(original, { ...igual, categoriaId: 'otra', cuentaId: 'efe', dia: '2026-10-20' })).toEqual([
      { funcion: 'cambiar_categoria', params: { p_id: 'm1', p_category_id: 'otra' } },
      { funcion: 'cambiar_cuenta', params: { p_id: 'm1', p_account_id: 'efe' } },
      { funcion: 'cambiar_fecha', params: { p_id: 'm1', p_occurred_at: '2026-10-20T15:00:00-05:00' } },
    ])
  })
})

describe('server errors', () => {
  it('a rule of the server keeps its message and its code', () => {
    const e = traducirError({ code: 'P0001', message: 'No te alcanza el saldo.', details: 'saldo_insuficiente' })
    expect(e).toBeInstanceOf(ErrorDelServidor)
    expect(e.message).toBe('No te alcanza el saldo.')
    expect(e.codigo).toBe('saldo_insuficiente')
  })

  it('a possible duplicate carries the twin', () => {
    const e = traducirError({
      code: 'P0001',
      message: 'Ya registraste «Bus» ese día.',
      details: 'posible_duplicado',
      hint: '{"movimiento_id":"t9","fecha":"2026-10-27T13:00:00Z","comercio":"Bus"}',
    })
    expect(e.duplicado).toEqual({ movimientoId: 't9', fecha: '2026-10-27T13:00:00Z', comercio: 'Bus' })
  })

  it('anything else shows a plain message without technical details', () => {
    const e = traducirError({ code: '42501', message: 'permission denied for table transactions' })
    expect(e.codigo).toBeNull()
    expect(e.message).toBe('No se pudo guardar. Intenta de nuevo en un momento.')
  })

  it('a duplicate key keeps the plain message and is marked ya_existe', () => {
    const e = traducirError({ code: '23505', message: 'duplicate key value violates unique constraint' })
    expect(e.codigo).toBe('ya_existe')
    expect(e.message).toBe('No se pudo guardar. Intenta de nuevo en un momento.')
  })
})
