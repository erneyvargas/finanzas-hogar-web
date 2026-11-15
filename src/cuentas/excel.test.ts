import { describe, expect, it } from 'vitest'
import { filasParaExcel, nombreDelArchivo } from './excel'
import type { MovimientoDeCuenta } from './reglas'

const mov = (m: Partial<MovimientoDeCuenta> & Pick<MovimientoDeCuenta, 'id' | 'tipo' | 'monto' | 'fecha'>): MovimientoDeCuenta => ({
  cuentaId: 'nomina',
  contracuentaId: null,
  comercio: null,
  nota: null,
  ...m,
})
const nombres: Record<string, string> = { nomina: 'Nómina', efe: 'Efectivo', pertuz: 'Pertuz' }
const nombre = (id: string | null) => (id ? (nombres[id] ?? 'otra cuenta') : 'otra cuenta')

describe('the account movements as Excel rows', () => {
  // Newest first, as the panel lists them.
  const movs = [
    mov({ id: 'a', tipo: 'debt_payment', monto: 606000, fecha: '2026-11-15T19:58:51Z', contracuentaId: 'pertuz' }),
    mov({ id: 'b', tipo: 'expense', monto: 61250, fecha: '2026-11-15T18:00:00Z', comercio: 'Celular Karen', nota: 'Claro', categoria: 'Karen › Celular' }),
    mov({ id: 'c', tipo: 'transfer', monto: 200000, fecha: '2026-11-14T13:00:00Z', cuentaId: 'efe', contracuentaId: 'nomina' }),
    mov({ id: 'd', tipo: 'income', monto: 4271600, fecha: '2026-11-13T18:15:34Z', comercio: 'MCT S.A.S.', categoria: 'Ingresos › Sueldo' }),
  ]

  it('gives each movement its Bogotá date, description, category, type, note, signed amount and the balance after it', () => {
    const filas = filasParaExcel(movs, { id: 'nomina', tipo: 'debit' }, 1_000_000, nombre)
    expect(filas).toEqual([
      { fecha: new Date(Date.UTC(2026, 10, 15)), descripcion: 'Abono a Pertuz', categoria: '', tipo: 'Abono a deuda', nota: '', monto: -606000, saldo: 1_000_000 },
      { fecha: new Date(Date.UTC(2026, 10, 15)), descripcion: 'Celular Karen', categoria: 'Karen › Celular', tipo: 'Gasto', nota: 'Claro', monto: -61250, saldo: 1_606_000 },
      { fecha: new Date(Date.UTC(2026, 10, 14)), descripcion: 'Transferencia de Efectivo', categoria: '', tipo: 'Transferencia', nota: '', monto: 200000, saldo: 1_667_250 },
      { fecha: new Date(Date.UTC(2026, 10, 13)), descripcion: 'MCT S.A.S.', categoria: 'Ingresos › Sueldo', tipo: 'Ingreso', nota: '', monto: 4271600, saldo: 1_467_250 },
    ])
  })

  it('leaves the balance out for a loan, whose installments only lower it by their capital', () => {
    const filas = filasParaExcel([movs[0]], { id: 'pertuz', tipo: 'liability' }, -9_662_859, nombre)
    expect(filas[0]).toMatchObject({ descripcion: 'Abono de Nómina', monto: 606000, saldo: null })
  })

  it('names the file after the account and the month', () => {
    expect(nombreDelArchivo('Nomina Banco de Bogotá', '2026-11')).toBe('Nomina Banco de Bogotá - noviembre 2026.xlsx')
    expect(nombreDelArchivo('Cuenta/rara:*', '2026-01')).toBe('Cuenta rara - enero 2026.xlsx')
  })
  it('rounds the running balance to cents and drops a General leaf from the category', () => {
    const [, segunda] = filasParaExcel(
      [
        mov({ id: 'x', tipo: 'expense', monto: 0.1, fecha: '2026-11-15T18:00:00Z', categoria: 'Hogar › Mercado › General' }),
        mov({ id: 'y', tipo: 'expense', monto: 0.2, fecha: '2026-11-15T17:00:00Z', categoria: 'Hogar › Vivienda › Internet' }),
      ],
      { id: 'nomina', tipo: 'debit' },
      2_577_369.01,
      nombre,
    )
    expect(segunda.saldo).toBe(2_577_369.11)
    expect(filasParaExcel([mov({ id: 'x', tipo: 'expense', monto: 1, fecha: '2026-11-15T18:00:00Z', categoria: 'Hogar › Mercado › General' })], { id: 'nomina', tipo: 'debit' }, 0, nombre)[0].categoria).toBe('Hogar › Mercado')
    expect(segunda.categoria).toBe('Hogar › Vivienda › Internet')
  })
})
