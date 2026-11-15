import { describe, expect, it } from 'vitest'
import { festivosDe } from './festivos'

describe('Colombian public holidays', () => {
  it('lists the 18 holidays of 2026, Ley Emiliani ones moved to Monday', () => {
    expect([...festivosDe(2026)]).toEqual([
      ['2026-01-01', 'Año Nuevo'],
      ['2026-01-12', 'Reyes Magos'],
      ['2026-03-23', 'San José'],
      ['2026-04-02', 'Jueves Santo'],
      ['2026-04-03', 'Viernes Santo'],
      ['2026-05-01', 'Día del Trabajo'],
      ['2026-05-18', 'Ascensión del Señor'],
      ['2026-06-08', 'Corpus Christi'],
      ['2026-06-15', 'Sagrado Corazón'],
      ['2026-06-29', 'San Pedro y San Pablo'],
      ['2026-07-20', 'Día de la Independencia'],
      ['2026-08-07', 'Batalla de Boyacá'],
      ['2026-08-17', 'Asunción de la Virgen'],
      ['2026-10-12', 'Día de la Raza'],
      ['2026-11-02', 'Todos los Santos'],
      ['2026-11-16', 'Independencia de Cartagena'],
      ['2026-12-08', 'Inmaculada Concepción'],
      ['2026-12-25', 'Navidad'],
    ])
  })

  it('follows Easter from year to year', () => {
    const f = festivosDe(2025)
    expect(f.get('2025-04-17')).toBe('Jueves Santo')
    expect(f.get('2025-04-18')).toBe('Viernes Santo')
    expect(f.get('2025-06-02')).toBe('Ascensión del Señor')
    expect(f.get('2025-06-23')).toBe('Corpus Christi')
  })

  it('a Monday with two holidays carries both names', () => {
    // 2025: San Pedro (Sunday 29 June) moves onto Sagrado Corazón.
    expect(festivosDe(2025).get('2025-06-30')).toBe('San Pedro y San Pablo y Sagrado Corazón')
    expect(festivosDe(2025).size).toBe(17)
  })

  it('keeps a holiday that already falls on Monday where it is', () => {
    expect(festivosDe(2026).get('2026-10-12')).toBe('Día de la Raza')
    expect(festivosDe(2026).has('2026-10-19')).toBe(false)
  })
})
