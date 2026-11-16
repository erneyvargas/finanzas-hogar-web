import { describe, expect, it } from 'vitest'
import { explicarCambio } from './cambio'

describe('explicarCambio', () => {
  it('compares the month so far with the same days of the month before', () => {
    expect(explicarCambio(40000, 20000, '2026-10', 28)).toBe(
      'Del 1 al 28 de octubre llevas $40.000; en el mismo periodo de septiembre fueron $20.000: 100 % más.',
    )
    expect(explicarCambio(15000, 20000, '2026-10', 5)).toBe(
      'Del 1 al 5 de octubre llevas $15.000; en el mismo periodo de septiembre fueron $20.000: 25 % menos.',
    )
  })

  it('a closed month compares whole months', () => {
    expect(explicarCambio(13400, 10000, '2026-09', null)).toBe('Todo septiembre: $13.400; todo agosto: $10.000. 34 % más.')
  })

  it('says when there was no spend before, or the same amount', () => {
    expect(explicarCambio(12000, 0, '2026-10', 28)).toBe('En el mismo periodo de septiembre no hubo gasto en este rubro.')
    expect(explicarCambio(20000, 20000, '2026-10', 28)).toBe('Igual que en el mismo periodo de septiembre.')
  })
})
