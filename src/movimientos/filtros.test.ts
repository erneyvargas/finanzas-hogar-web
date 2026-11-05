import { describe, expect, it } from 'vitest'
import { alternar, arbolDeGastos, dentroDelRango, pasaLaSeleccion, tocarDia, type Rango } from './filtros'
import type { CategoriaDeMovimiento } from './reglas'

const cat = (id: string, nivel: string, padreId: string | null, tipo = 'expense'): CategoriaDeMovimiento => ({
  id,
  nombre: id,
  tipo,
  nivel,
  padreId,
  color: null,
  viva: true,
})

const categorias = [
  cat('hogar', 'rubro', null),
  cat('mercado', 'category', 'hogar'),
  cat('frutas', 'subcategory', 'mercado'),
  cat('servicios', 'category', 'hogar'),
  cat('luz', 'subcategory', 'servicios'),
  cat('erney', 'rubro', null),
  cat('comida', 'category', 'erney'),
  cat('ing', 'rubro', null, 'income'),
]

describe('the expense tree', () => {
  it('lists the expense rubros with their categories, without income', () => {
    expect(arbolDeGastos(categorias).map((r) => [r.id, r.categorias.map((c) => c.id)])).toEqual([
      ['hogar', ['mercado', 'servicios']],
      ['erney', ['comida']],
    ])
  })
})

describe('checking rubros and categories', () => {
  const arbol = arbolDeGastos(categorias)

  it('checking a rubro selects it whole', () => {
    expect([...alternar(new Set(), 'hogar', arbol)]).toEqual(['hogar'])
  })

  it('unchecking one category of a checked rubro keeps its other categories', () => {
    expect([...alternar(new Set(['hogar']), 'mercado', arbol)]).toEqual(['servicios'])
  })

  it('checking the last missing category turns into the whole rubro', () => {
    expect([...alternar(new Set(['servicios']), 'mercado', arbol)]).toEqual(['hogar'])
  })

  it('checking a rubro replaces its loose categories', () => {
    expect([...alternar(new Set(['mercado', 'comida']), 'hogar', arbol)].sort()).toEqual(['comida', 'hogar'])
  })

  it('unchecking a checked rubro clears it', () => {
    expect([...alternar(new Set(['hogar']), 'hogar', arbol)]).toEqual([])
  })
})

describe('what passes the selection', () => {
  it('everything passes an empty selection, even without a category', () => {
    expect(pasaLaSeleccion(new Set(), 'frutas', categorias)).toBe(true)
    expect(pasaLaSeleccion(new Set(), null, categorias)).toBe(true)
  })

  it('a movement passes when its rubro or its category is selected', () => {
    expect(pasaLaSeleccion(new Set(['hogar']), 'luz', categorias)).toBe(true)
    expect(pasaLaSeleccion(new Set(['mercado']), 'frutas', categorias)).toBe(true)
    expect(pasaLaSeleccion(new Set(['mercado']), 'luz', categorias)).toBe(false)
    expect(pasaLaSeleccion(new Set(['hogar']), null, categorias)).toBe(false)
  })
})

describe('choosing days', () => {
  it('a first tap picks one day; a second one makes the range, in any order', () => {
    const uno = tocarDia(null, '2026-11-14')
    expect(uno).toEqual({ desde: '2026-11-14', hasta: '2026-11-14' })
    expect(tocarDia(uno, '2026-11-08')).toEqual({ desde: '2026-11-08', hasta: '2026-11-14' })
  })

  it('tapping the only chosen day clears it; a tap on a range starts again', () => {
    expect(tocarDia({ desde: '2026-11-08', hasta: '2026-11-08' }, '2026-11-08')).toBeNull()
    expect(tocarDia({ desde: '2026-11-08', hasta: '2026-11-14' }, '2026-11-20')).toEqual({
      desde: '2026-11-20',
      hasta: '2026-11-20',
    })
  })

  it('the range includes both ends', () => {
    const r: Rango = { desde: '2026-11-08', hasta: '2026-11-14' }
    expect(['2026-11-07', '2026-11-08', '2026-11-14', '2026-11-15'].map((d) => dentroDelRango(r, d))).toEqual([
      false,
      true,
      true,
      false,
    ])
    expect(dentroDelRango(null, '2026-11-01')).toBe(true)
  })
})
