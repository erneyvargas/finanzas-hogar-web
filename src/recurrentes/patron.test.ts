import { describe, expect, it } from 'vitest'
import { recurrenciaInicial, type Recurrencia } from '../core/ui/recurrencia'
import { horaDeRecurrencia, patronDeRecurrencia, recurrenciaDeRegla } from './patron'

const con = (p: Partial<Recurrencia>): Recurrencia => ({ ...recurrenciaInicial(), ...p })
const dias = (...i: number[]) => Array.from({ length: 7 }, (_, k) => i.includes(k))
const regla = { diaDelMes: null, dias: null, semanaDelMes: null, proximaFecha: '2026-11-18', horaAviso: null }

describe('from the editor to the stored rule', () => {
  it('maps each pattern to frequency, day, ISO weekdays, week and month', () => {
    expect(patronDeRecurrencia(con({ freq: 'diaria' }))).toEqual({ frecuencia: 'daily', dia: null, dias: null, semana: null, mes: null })
    expect(patronDeRecurrencia(con({ freq: 'diaria', sinFin: true }))).toMatchObject({ frecuencia: 'weekdays', dias: null })
    expect(patronDeRecurrencia(con({ freq: 'semanal', dias: dias(0, 2, 6) }))).toEqual({
      frecuencia: 'weekly', dia: null, dias: [1, 3, 7], semana: null, mes: null,
    })
    expect(patronDeRecurrencia(con({ freq: 'mensual', modoMes: 'dia', diaMes: 18 }))).toEqual({
      frecuencia: 'monthly', dia: 18, dias: null, semana: null, mes: null,
    })
    expect(patronDeRecurrencia(con({ freq: 'mensual', modoMes: 'nth', ord: 0, diaSem: 0 }))).toEqual({
      frecuencia: 'monthly', dia: null, dias: [1], semana: 1, mes: null,
    })
    expect(patronDeRecurrencia(con({ freq: 'mensual', modoMes: 'nth', ord: 4, diaSem: 4 }))).toMatchObject({ dias: [5], semana: -1 })
    expect(patronDeRecurrencia(con({ freq: 'anual', mes: 2, diaAnual: 20 }))).toEqual({
      frecuencia: 'yearly', dia: 20, dias: null, semana: null, mes: 3,
    })
  })

  it('writes the reminder time as HH:mm', () => {
    expect(horaDeRecurrencia(con({ h: 9, min: 5, pm: false }))).toBe('09:05')
    expect(horaDeRecurrencia(con({ h: 12, min: 0, pm: false }))).toBe('00:00')
    expect(horaDeRecurrencia(con({ h: 12, min: 30, pm: true }))).toBe('12:30')
    expect(horaDeRecurrencia(con({ h: 7, min: 45, pm: true }))).toBe('19:45')
  })
})

describe('from the stored rule to the editor', () => {
  it('reads each stored pattern back', () => {
    expect(recurrenciaDeRegla({ ...regla, frecuencia: 'daily' })).toMatchObject({ freq: 'diaria', sinFin: false })
    expect(recurrenciaDeRegla({ ...regla, frecuencia: 'weekdays' })).toMatchObject({ freq: 'diaria', sinFin: true })
    expect(recurrenciaDeRegla({ ...regla, frecuencia: 'weekly', dias: [1, 3] })).toMatchObject({ freq: 'semanal', dias: dias(0, 2) })
    // A legacy weekly rule without days falls on its next date's weekday (Wednesday).
    expect(recurrenciaDeRegla({ ...regla, frecuencia: 'weekly' })).toMatchObject({ freq: 'semanal', dias: dias(2) })
    expect(recurrenciaDeRegla({ ...regla, frecuencia: 'monthly', diaDelMes: 18 })).toMatchObject({ freq: 'mensual', modoMes: 'dia', diaMes: 18 })
    expect(recurrenciaDeRegla({ ...regla, frecuencia: 'monthly' })).toMatchObject({ modoMes: 'dia', diaMes: 18 })
    expect(recurrenciaDeRegla({ ...regla, frecuencia: 'monthly', dias: [5], semanaDelMes: -1 })).toMatchObject({
      freq: 'mensual', modoMes: 'nth', ord: 4, diaSem: 4,
    })
    expect(recurrenciaDeRegla({ ...regla, frecuencia: 'yearly', diaDelMes: 20, proximaFecha: '2027-03-20' })).toMatchObject({
      freq: 'anual', mes: 2, diaAnual: 20,
    })
  })

  it('reads the reminder time, 9:00 a. m. when there is none', () => {
    expect(recurrenciaDeRegla({ ...regla, frecuencia: 'daily', horaAviso: '19:45:00' })).toMatchObject({ h: 7, min: 45, pm: true })
    expect(recurrenciaDeRegla({ ...regla, frecuencia: 'daily', horaAviso: '00:10' })).toMatchObject({ h: 12, min: 10, pm: false })
    expect(recurrenciaDeRegla({ ...regla, frecuencia: 'daily' })).toMatchObject({ h: 9, min: 0, pm: false })
  })

  it('has no editor pattern for every two weeks', () => {
    expect(recurrenciaDeRegla({ ...regla, frecuencia: 'biweekly' })).toBeNull()
  })
})
