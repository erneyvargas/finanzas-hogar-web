import { describe, expect, it } from 'vitest'
import {
  idDelRubroDeAjuste,
  mesDe,
  mesesHasta,
  resumenDelMes,
  type Categoria,
  type Movimiento,
  type Parte,
} from './calculo'

const HOGAR = 'h1'

const cats: Categoria[] = [
  { id: 'karen', nombre: 'Karen', nivel: 'rubro', color: 'lavanda' },
  { id: 'isaac', nombre: 'Hijo Isaac', nivel: 'rubro', color: 'laguna' },
  { id: 'hogar', nombre: 'Hogar', nivel: 'rubro', color: 'musgo' },
  { id: 'k-transp', nombre: 'Transporte', nivel: 'categoria', color: null },
  { id: 'i-transp', nombre: 'Transporte', nivel: 'categoria', color: null },
  { id: 'k-salud', nombre: 'Salud', nivel: 'categoria', color: null },
  { id: 'h-mercado', nombre: 'Mercado', nivel: 'categoria', color: null },
]

let n = 0
function mov(p: Partial<Movimiento> & { monto: number; fecha: string }): Movimiento {
  return {
    id: p.id ?? `m${++n}`,
    tipo: p.tipo ?? 'expense',
    monto: p.monto,
    fecha: p.fecha,
    rubroId: p.rubroId ?? 'karen',
    categoriaId: p.categoriaId ?? 'k-transp',
    anulado: p.anulado ?? false,
  }
}

describe('months in Bogotá', () => {
  it('a movement at 11 pm of the last day belongs to that month', () => {
    // 2026-10-31 23:00 in Bogotá is 2026-11-01 04:00 UTC.
    expect(mesDe('2026-11-01T04:00:00Z')).toBe('2026-10')
    expect(mesDe('2026-11-01T05:00:00Z')).toBe('2026-11')
  })

  it('lists the six months that end in the chosen one', () => {
    expect(mesesHasta('2026-02', 6)).toEqual([
      '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02',
    ])
  })
})

describe('the balance adjustment rubro', () => {
  it('has the same id the phone app derives', () => {
    expect(idDelRubroDeAjuste(HOGAR)).toBe('df70b54d-e6e1-5c73-9525-51f47db97c19')
  })
})

describe('resumenDelMes', () => {
  it('adds the month expenses and compares with the previous month', () => {
    const r = resumenDelMes({
      movimientos: [
        mov({ monto: 100000, fecha: '2026-10-05T15:00:00Z' }),
        mov({ monto: 50000, fecha: '2026-10-20T15:00:00Z', rubroId: 'isaac', categoriaId: 'i-transp' }),
        mov({ monto: 120000, fecha: '2026-09-10T15:00:00Z' }),
        mov({ monto: 999, fecha: '2026-08-10T15:00:00Z' }),
      ],
      partes: [],
      categorias: cats,
      mes: '2026-10',
      hogarId: HOGAR,
    })

    expect(r.gastado).toBe(150000)
    expect(r.gastadoAnterior).toBe(120000)
  })

  it('compares the running month with the same days of the previous month', () => {
    const movimientos = [
      mov({ monto: 40000, fecha: '2026-11-01T15:00:00Z' }),
      mov({ monto: 30000, fecha: '2026-10-01T15:00:00Z' }),
      // 2026-10-02 at 11 pm in Bogotá: already past the first day.
      mov({ monto: 500000, fecha: '2026-10-03T04:00:00Z' }),
      mov({ monto: 900000, fecha: '2026-10-20T15:00:00Z' }),
    ]
    const base = { movimientos, partes: [], categorias: cats, mes: '2026-11', hogarId: HOGAR }

    const enCurso = resumenDelMes({ ...base, hoy: '2026-11-01' })
    expect(enCurso.gastadoAnterior).toBe(30000)
    expect(enCurso.comparadoHasta).toBe(1)

    const cerrado = resumenDelMes({ ...base, hoy: '2026-12-05' })
    expect(cerrado.gastadoAnterior).toBe(1430000)
    expect(cerrado.comparadoHasta).toBeNull()
  })

  it('leaves out voided movements, transfers and the adjustment rubro', () => {
    const r = resumenDelMes({
      movimientos: [
        mov({ monto: 10000, fecha: '2026-10-05T15:00:00Z' }),
        mov({ monto: 70000, fecha: '2026-10-05T15:00:00Z', anulado: true }),
        mov({ monto: 600000, fecha: '2026-10-05T15:00:00Z', tipo: 'transfer' }),
        mov({ monto: 5000, fecha: '2026-10-05T15:00:00Z', rubroId: idDelRubroDeAjuste(HOGAR) }),
      ],
      partes: [],
      categorias: cats,
      mes: '2026-10',
      hogarId: HOGAR,
    })

    expect(r.gastado).toBe(10000)
  })

  it('a split invoice adds each part in its own rubro, not the whole in one', () => {
    const r = resumenDelMes({
      movimientos: [
        mov({ id: 'f1', monto: 300000, fecha: '2026-10-05T15:00:00Z', rubroId: 'hogar', categoriaId: 'h-mercado' }),
      ],
      partes: [
        { movimientoId: 'f1', monto: 200000, rubroId: 'hogar', categoriaId: 'h-mercado' },
        { movimientoId: 'f1', monto: 100000, rubroId: 'karen', categoriaId: 'k-salud' },
      ] satisfies Parte[],
      categorias: cats,
      mes: '2026-10',
      hogarId: HOGAR,
    })

    expect(r.gastado).toBe(300000)
    expect(r.porRubro.map((x) => [x.nombre, x.total])).toEqual([
      ['Hogar', 200000],
      ['Karen', 100000],
    ])
  })

  it('crosses categories by name with rubros, largest first', () => {
    const r = resumenDelMes({
      movimientos: [
        mov({ monto: 30000, fecha: '2026-10-05T15:00:00Z', rubroId: 'karen', categoriaId: 'k-transp' }),
        mov({ monto: 20000, fecha: '2026-10-06T15:00:00Z', rubroId: 'isaac', categoriaId: 'i-transp' }),
        mov({ monto: 40000, fecha: '2026-10-07T15:00:00Z', rubroId: 'karen', categoriaId: 'k-salud' }),
      ],
      partes: [],
      categorias: cats,
      mes: '2026-10',
      hogarId: HOGAR,
    })

    expect(r.matriz.map((f) => [f.categoria, f.total, f.porRubro])).toEqual([
      ['Transporte', 50000, { karen: 30000, isaac: 20000 }],
      ['Salud', 40000, { karen: 40000 }],
    ])
    expect(r.porRubro[0]).toMatchObject({ id: 'karen', color: 'lavanda', total: 70000 })
  })

  it('adds the month income on its own', () => {
    const r = resumenDelMes({
      movimientos: [
        mov({ monto: 5200000, fecha: '2026-10-01T15:00:00Z', tipo: 'income' }),
        mov({ monto: 80000, fecha: '2026-10-02T15:00:00Z' }),
      ],
      partes: [],
      categorias: cats,
      mes: '2026-10',
      hogarId: HOGAR,
    })

    expect(r.ingresos).toBe(5200000)
    expect(r.gastado).toBe(80000)
  })

  it('gives the last six months by rubro for the trend', () => {
    const r = resumenDelMes({
      movimientos: [
        mov({ monto: 1000, fecha: '2026-05-10T15:00:00Z' }),
        mov({ monto: 2000, fecha: '2026-10-10T15:00:00Z', rubroId: 'hogar', categoriaId: 'h-mercado' }),
      ],
      partes: [],
      categorias: cats,
      mes: '2026-10',
      hogarId: HOGAR,
    })

    expect(r.meses.map((m) => m.mes)).toEqual([
      '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10',
    ])
    expect(r.meses[0].porRubro).toEqual({ karen: 1000 })
    expect(r.meses[5].porRubro).toEqual({ hogar: 2000 })
    expect(r.meses[5].total).toBe(2000)
  })
})
