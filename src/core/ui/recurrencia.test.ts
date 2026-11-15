import { describe, expect, it } from 'vitest'
import { cronDe, fraseDe, recurrenciaInicial, relativo, textoDeFrase, type Recurrencia } from './recurrencia'

const con = (p: Partial<Recurrencia>): Recurrencia => ({ ...recurrenciaInicial(), ...p })
const plano = (r: Recurrencia) => textoDeFrase(fraseDe(r)).replace(/\u00A0/g, ' ')
const dias = (...i: number[]) => Array.from({ length: 7 }, (_, k) => i.includes(k))

describe('the cron chip: min hora día mes semana', () => {
  it('a weekly rule lists its days, Sunday as 0, runs of three or more as a range', () => {
    expect(cronDe(con({ freq: 'semanal', dias: dias(0, 2) })).join(' ')).toBe('0 9 * * 1,3')
    expect(cronDe(con({ freq: 'semanal', dias: dias(0, 1, 2, 3, 4) })).join(' ')).toBe('0 9 * * 1-5')
    expect(cronDe(con({ freq: 'semanal', dias: dias(6) })).join(' ')).toBe('0 9 * * 0')
    expect(cronDe(con({ freq: 'semanal', dias: dias(0, 1, 2, 3, 4, 5, 6) })).join(' ')).toBe('0 9 * * *')
  })

  it('a daily rule is every day, or 1-5 without weekends', () => {
    expect(cronDe(con({ freq: 'diaria' })).join(' ')).toBe('0 9 * * *')
    expect(cronDe(con({ freq: 'diaria', sinFin: true })).join(' ')).toBe('0 9 * * 1-5')
  })

  it('a monthly rule is a day of the month, or 1#1 for the first Monday and 1L for the last', () => {
    expect(cronDe(con({ freq: 'mensual', modoMes: 'dia', diaMes: 15 })).join(' ')).toBe('0 9 15 * *')
    expect(cronDe(con({ freq: 'mensual', modoMes: 'nth', ord: 0, diaSem: 0 })).join(' ')).toBe('0 9 * * 1#1')
    expect(cronDe(con({ freq: 'mensual', modoMes: 'nth', ord: 4, diaSem: 0 })).join(' ')).toBe('0 9 * * 1L')
    expect(cronDe(con({ freq: 'mensual', modoMes: 'nth', ord: 2, diaSem: 6 })).join(' ')).toBe('0 9 * * 0#3')
  })

  it('a yearly rule is a day and a month; the hour is 24h', () => {
    expect(cronDe(con({ freq: 'anual', mes: 2, diaAnual: 15 })).join(' ')).toBe('0 9 15 3 *')
    expect(cronDe(con({ freq: 'anual', h: 2, min: 30, pm: true })).slice(0, 2)).toEqual(['30', '14'])
    expect(cronDe(con({ h: 12, min: 0, pm: false })).slice(0, 2)).toEqual(['0', '0'])
  })
})

describe('the sentence', () => {
  it('says the pattern and the hour in plain Spanish', () => {
    expect(plano(con({ freq: 'semanal', dias: dias(0, 2) }))).toBe('Se repite cada semana, los lunes y miércoles, a las 9:00 a. m.')
    expect(plano(con({ freq: 'semanal', dias: dias(4) }))).toBe('Se repite cada viernes, a las 9:00 a. m.')
    expect(plano(con({ freq: 'semanal', dias: dias(5, 6) }))).toBe('Se repite los fines de semana, a las 9:00 a. m.')
    expect(plano(con({ freq: 'diaria', sinFin: true, h: 1, pm: true }))).toBe('Se repite de lunes a viernes, a la 1:00 p. m.')
    expect(plano(con({ freq: 'mensual', modoMes: 'nth', ord: 0, diaSem: 0 }))).toBe('Se repite el primer lunes de cada mes, a las 9:00 a. m.')
    expect(plano(con({ freq: 'mensual', modoMes: 'dia', diaMes: 31 }))).toBe(
      'Se repite el día 31 de cada mes (o el último día), a las 9:00 a. m.',
    )
    expect(plano(con({ freq: 'anual', mes: 2, diaAnual: 15 }))).toBe('Se repite el 15 de marzo de cada año, a las 9:00 a. m.')
  })

  it('marks the parts that change', () => {
    const resaltados = fraseDe(con({ freq: 'mensual', modoMes: 'nth', ord: 4, diaSem: 4 }))
      .filter(([, r]) => r)
      .map(([t]) => t.replace(/\u00A0/g, ' '))
    expect(resaltados).toEqual(['el último viernes', 'cada mes', '9:00 a. m.'])
  })
})

describe('relativo', () => {
  it('says how far a date is', () => {
    expect(relativo('2026-11-15', '2026-11-15')).toBe('hoy')
    expect(relativo('2026-11-16', '2026-11-15')).toBe('mañana')
    expect(relativo('2026-11-25', '2026-11-15')).toBe('en 10 días')
    expect(relativo('2027-03-15', '2026-11-15')).toBe('en 4 meses')
  })
})
