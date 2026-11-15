import { describe, expect, it } from 'vitest'
import { primeraFecha, proximaFecha, siguientesFechas } from './fechas'

// The same dates as supabase/tests/recurrencia_ampliada_test.sql, sections 1 and 2
// (2026-11-16 is a Monday): the web preview must agree with the server.
describe('proximaFecha, the twin of proxima_fecha_de_regla', () => {
  it.each([
    ['daily', null, null, null, '2026-11-16', '2026-11-17'],
    ['weekdays', null, null, null, '2026-11-20', '2026-11-23'],
    ['weekdays', null, null, null, '2026-11-22', '2026-11-23'],
    ['weekly', null, null, null, '2026-11-16', '2026-11-23'],
    ['biweekly', null, null, null, '2026-11-16', '2026-11-30'],
    ['monthly', 31, null, null, '2026-01-31', '2026-02-28'],
    ['monthly', 31, null, null, '2026-02-28', '2026-03-31'],
    ['monthly', null, null, null, '2026-11-15', '2026-12-15'],
    ['yearly', 29, null, null, '2028-02-29', '2029-02-28'],
    ['weekly', null, [1, 3], null, '2026-11-16', '2026-11-18'],
    ['weekly', null, [1, 3], null, '2026-11-18', '2026-11-23'],
    ['weekly', null, [6, 7], null, '2026-11-16', '2026-11-21'],
    ['monthly', null, [1], 1, '2026-11-02', '2026-12-07'],
    ['monthly', null, [5], -1, '2026-11-27', '2026-12-25'],
    ['monthly', null, [2], 4, '2026-12-22', '2027-01-26'],
    ['monthly', null, [1], 1, '2026-11-01', '2026-11-02'],
  ] as const)('%s day %s days %j week %s after %s is %s', (frecuencia, dia, dias, semana, desde, esperada) => {
    expect(proximaFecha({ frecuencia, dia, dias: dias ? [...dias] : null, semana }, desde)).toBe(esperada)
  })
})

describe('primeraFecha, the twin of primera_fecha_de_regla', () => {
  it.each([
    ['daily', null, null, null, null, '2026-11-16', '2026-11-16'],
    ['weekdays', null, null, null, null, '2026-11-21', '2026-11-23'],
    ['weekly', null, [3], null, null, '2026-11-16', '2026-11-18'],
    ['weekly', null, [1, 3], null, null, '2026-11-16', '2026-11-16'],
    ['weekly', null, null, null, null, '2026-11-19', '2026-11-19'],
    ['monthly', 15, null, null, null, '2026-11-15', '2026-11-15'],
    ['monthly', 10, null, null, null, '2026-11-15', '2026-12-10'],
    ['monthly', null, [1], 1, null, '2026-11-03', '2026-12-07'],
    ['monthly', null, [5], -1, null, '2026-11-03', '2026-11-27'],
    ['yearly', 20, null, null, 3, '2026-11-15', '2027-03-20'],
    ['yearly', 20, null, null, 12, '2026-11-15', '2026-12-20'],
  ] as const)('%s day %s days %j week %s month %s from %s is %s', (frecuencia, dia, dias, semana, mes, inicio, esperada) => {
    expect(primeraFecha({ frecuencia, dia, dias: dias ? [...dias] : null, semana, mes }, inicio)).toBe(esperada)
  })
})

describe('siguientesFechas', () => {
  it('lists the first occurrences from the start, stepping as the server does', () => {
    expect(siguientesFechas({ frecuencia: 'weekly', dia: null, dias: [1, 3], semana: null }, '2026-11-17', 4)).toEqual([
      '2026-11-18',
      '2026-11-23',
      '2026-11-25',
      '2026-11-30',
    ])
  })

  it('stops after the end date', () => {
    expect(
      siguientesFechas({ frecuencia: 'monthly', dia: 10, dias: null, semana: null }, '2026-11-15', 5, '2027-02-10'),
    ).toEqual(['2026-12-10', '2027-01-10', '2027-02-10'])
  })
})
