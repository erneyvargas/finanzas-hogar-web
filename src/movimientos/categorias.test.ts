import { describe, expect, it } from 'vitest'
import {
  arbolDeCategorias,
  atajosDeCategoria,
  buscarCategorias,
  opcionesDeCategoria,
  rutaCorta,
  tituloDe,
  usosPorCategoria,
  type OpcionDeCategoria,
} from './categorias'
import type { CategoriaDeMovimiento } from './reglas'

type Nivel = 'rubro' | 'category' | 'subcategory'
const cat = (
  id: string,
  nombre: string,
  nivel: Nivel,
  padreId: string | null,
  extra: Partial<CategoriaDeMovimiento> = {},
): CategoriaDeMovimiento => ({ id, nombre, tipo: 'expense', nivel, padreId, color: null, viva: true, ...extra })

const AJUSTE = 'ajuste'

const categorias: CategoriaDeMovimiento[] = [
  // Two rubros, listed out of order: sort_order decides.
  cat('auto', 'Auto', 'rubro', null, { orden: 2, color: 'marino' }),
  cat('hogar', 'Hogar', 'rubro', null, { orden: 1, color: 'musgo', foto: 'https://fotos.test/hogar.png' }),
  cat('mercado', 'Mercado', 'category', 'hogar', { orden: 2 }),
  cat('servicios', 'Servicios', 'category', 'hogar', { orden: 1 }),
  cat('luz', 'Luz', 'subcategory', 'servicios', { orden: 2 }),
  cat('agua', 'Agua', 'subcategory', 'servicios', { orden: 1 }),
  cat('serv-general', 'General', 'subcategory', 'servicios', { orden: 0 }),
  cat('lacteos', 'Lácteos', 'subcategory', 'mercado', { orden: 1 }),
  cat('gasolina-cat', 'Gasolina', 'category', 'auto', { orden: 1 }),
  cat('gasolina', 'General', 'subcategory', 'gasolina-cat'),
  // Archived category and archived rubro hide their leaves.
  cat('viejo', 'Viejo', 'category', 'hogar', { viva: false }),
  cat('viejo-sub', 'Algo', 'subcategory', 'viejo'),
  cat('karen', 'Karen', 'rubro', null, { viva: false }),
  cat('k-salud', 'Salud', 'category', 'karen'),
  cat('k-cita', 'Cita', 'subcategory', 'k-salud'),
  // The balance-adjustment rubro.
  cat(AJUSTE, 'Ajustes', 'rubro', null),
  cat('aj-cat', 'Ajuste', 'category', AJUSTE),
  cat('aj-sub', 'General', 'subcategory', 'aj-cat'),
  // An archived leaf and one of the other kind.
  cat('vieja-hoja', 'Vieja', 'subcategory', 'mercado', { viva: false }),
  cat('sueldo-rubro', 'Ingresos', 'rubro', null, { tipo: 'income' }),
  cat('sueldo-cat', 'Nómina', 'category', 'sueldo-rubro', { tipo: 'income' }),
  cat('sueldo', 'Sueldo', 'subcategory', 'sueldo-cat', { tipo: 'income' }),
]

const opciones = opcionesDeCategoria('expense', categorias, AJUSTE)
const ids = (os: OpcionDeCategoria[]) => os.map((o) => o.id)

describe('the category options', () => {
  it('are live leaves of the kind, ordered by rubro, category and subcategory sort_order', () => {
    expect(ids(opciones)).toEqual(['serv-general', 'agua', 'luz', 'lacteos', 'gasolina'])
  })

  it('hide archived parents, the adjustment rubro and the other kind', () => {
    expect(ids(opciones)).not.toContain('viejo-sub')
    expect(ids(opciones)).not.toContain('k-cita')
    expect(ids(opciones)).not.toContain('aj-sub')
    expect(ids(opcionesDeCategoria('income', categorias, AJUSTE))).toEqual(['sueldo'])
  })

  it('carry the three names, the color from the closest level and the rubro photo', () => {
    const agua = opciones.find((o) => o.id === 'agua')!
    expect(agua).toMatchObject({ rubro: 'Hogar', categoria: 'Servicios', subcategoria: 'Agua', color: 'musgo', fotoRubro: 'https://fotos.test/hogar.png' })
  })
})

describe('the tree of the picker', () => {
  const arbol = arbolDeCategorias(opciones)

  it('groups leaves by rubro and category, counting every leaf of the rubro', () => {
    expect(arbol.map((r) => [r.nombre, r.opciones])).toEqual([
      ['Hogar', 4],
      ['Auto', 1],
    ])
    expect(arbol[0].grupos.map((g) => g.nombre)).toEqual(['Servicios', 'Mercado'])
  })

  it('never offers General when the category has real subcategories', () => {
    const servicios = arbol[0].grupos[0]
    expect(ids(servicios.hojas)).toEqual(['agua', 'luz'])
  })

  it('a category whose only leaf is General is chosen in one tap, with the General id', () => {
    const gasolina = arbol[1].grupos[0]
    expect(gasolina.hojas).toEqual([])
    expect(gasolina.cara.id).toBe('gasolina')
  })
})

describe('the names shown', () => {
  const de = (id: string) => opciones.find((o) => o.id === id)!

  it('the title is the category for General, else the subcategory', () => {
    expect(tituloDe(de('gasolina'))).toBe('Gasolina')
    expect(tituloDe(de('agua'))).toBe('Agua')
  })

  it('the short path climbs to the rubro only for General', () => {
    expect(rutaCorta(de('gasolina'))).toBe('Auto › Gasolina')
    expect(rutaCorta(de('agua'))).toBe('Servicios › Agua')
  })
})

describe('the search', () => {
  it('matches rubro, category or subcategory, ignoring case and accents', () => {
    expect(ids(buscarCategorias(opciones, 'LACTEOS'))).toEqual(['lacteos'])
    expect(ids(buscarCategorias(opciones, 'servic'))).toEqual(['serv-general', 'agua', 'luz'])
    expect(ids(buscarCategorias(opciones, 'auto'))).toEqual(['gasolina'])
    expect(buscarCategorias(opciones, 'nada así')).toEqual([])
  })
})

describe('the shortcuts', () => {
  const historial = [
    { tipo: 'expense' as const, categoriaId: 'luz' },
    { tipo: 'expense' as const, categoriaId: 'lacteos' },
    { tipo: 'expense' as const, categoriaId: 'lacteos' },
    { tipo: 'income' as const, categoriaId: 'luz' },
    { tipo: 'income' as const, categoriaId: 'luz' },
    { tipo: 'expense' as const, categoriaId: null },
  ]

  it('counts the uses of each category for the kind', () => {
    expect([...usosPorCategoria(historial, 'expense')]).toEqual([
      ['luz', 1],
      ['lacteos', 2],
    ])
  })

  it('are the most used, best first, up to the limit', () => {
    const usos = usosPorCategoria(historial, 'expense')
    expect(ids(atajosDeCategoria(opciones, usos, null))).toEqual(['lacteos', 'luz'])
    expect(ids(atajosDeCategoria(opciones, usos, null, 1))).toEqual(['lacteos'])
  })

  it('with no history, one per rubro', () => {
    expect(ids(atajosDeCategoria(opciones, new Map(), null))).toEqual(['serv-general', 'gasolina'])
  })

  it('the chosen one goes first when it is not already there', () => {
    const usos = usosPorCategoria(historial, 'expense')
    expect(ids(atajosDeCategoria(opciones, usos, 'gasolina'))).toEqual(['gasolina', 'lacteos', 'luz'])
    expect(ids(atajosDeCategoria(opciones, usos, 'luz'))).toEqual(['lacteos', 'luz'])
  })

  it('keep seven at most', () => {
    const muchas: CategoriaDeMovimiento[] = [cat('r', 'R', 'rubro', null), cat('c', 'C', 'category', 'r')]
    const usos = new Map<string, number>()
    for (let i = 0; i < 9; i++) {
      muchas.push(cat(`s${i}`, `S${i}`, 'subcategory', 'c', { orden: i }))
      usos.set(`s${i}`, 20 - i)
    }
    const todas = opcionesDeCategoria('expense', muchas, null)
    expect(ids(atajosDeCategoria(todas, usos, null))).toEqual(['s0', 's1', 's2', 's3', 's4', 's5', 's6'])
    expect(ids(atajosDeCategoria(todas, usos, 's8'))).toEqual(['s8', 's0', 's1', 's2', 's3', 's4', 's5'])
  })
})
