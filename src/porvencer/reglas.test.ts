import { describe, expect, it } from 'vitest'
import {
  diasEntre,
  esUrgente,
  fechaDeRegla,
  porPagarEn30Dias,
  quedanPorCuenta,
  semanaMasCargada,
  tamanoDeCirculo,
  textoDeDias,
  totalDelMes,
  totalEn30Dias,
  vencimientos,
  type DatosDePorVencer,
  type Regla,
  type Vencimiento,
} from './reglas'

const regla = (r: Partial<Regla>): Regla => ({
  id: 'r1',
  nombre: 'Internet',
  monto: 101000,
  frecuencia: 'monthly',
  diaDelMes: 18,
  proximaFecha: '2026-11-18',
  avisoDias: 3,
  cuentaId: 'nomina',
  categoriaId: 'c-internet',
  color: 'petroleo',
  ...r,
})

const datos = (d: Partial<DatosDePorVencer>): DatosDePorVencer => ({
  hogarId: 'h1',
  reglas: [],
  tarjetas: [],
  cuentas: [{ id: 'nomina', nombre: 'Nómina', principal: true }],
  saldos: { nomina: 1_000_000 },
  gastos: [],
  pagosATarjetas: [],
  ...d,
})

const v = (x: Partial<Vencimiento>): Vencimiento => ({
  clave: x.id ?? 'v',
  id: 'v',
  tipo: 'regla',
  nombre: 'X',
  monto: 0,
  fecha: '2026-11-18',
  avisoDias: 1,
  cuentaId: null,
  categoriaId: null,
  color: null,
  pagado: false,
  detalle: null,
  sinExtracto: false,
  deuda: 0,
  destinoId: null,
  total: 0,
  ...x,
})

describe('the due date of a rule in the shown month', () => {
  it('is its next due date when that falls in the month', () => {
    expect(fechaDeRegla(regla({ proximaFecha: '2026-11-20', diaDelMes: 18 }), '2026-11')).toBe('2026-11-20')
  })

  it('is its day of the month for a monthly rule due another month, clamped to the last day', () => {
    expect(fechaDeRegla(regla({ proximaFecha: '2026-12-18' }), '2026-11')).toBe('2026-11-18')
    expect(fechaDeRegla(regla({ diaDelMes: 31, proximaFecha: '2026-12-31' }), '2026-11')).toBe('2026-11-30')
    expect(fechaDeRegla(regla({ diaDelMes: null, proximaFecha: '2026-10-07' }), '2026-11')).toBe('2026-11-07')
  })

  it('is unknown (null) for a non-monthly rule whose date already passed, and absent when it is due later', () => {
    expect(fechaDeRegla(regla({ frecuencia: 'yearly', proximaFecha: '2026-09-01' }), '2026-11')).toBeNull()
    expect(fechaDeRegla(regla({ frecuencia: 'yearly', proximaFecha: '2027-03-01' }), '2026-11')).toBeUndefined()
  })
})

describe('days left', () => {
  it('counts calendar days between two dates, negative when past', () => {
    expect(diasEntre('2026-11-15', '2026-11-17')).toBe(2)
    expect(diasEntre('2026-11-15', '2026-12-01')).toBe(16)
    expect(diasEntre('2026-11-15', '2026-11-12')).toBe(-3)
  })

  it('reads as «{día} · faltan N días», «hoy», «falta 1 día» or «venció hace N días»', () => {
    expect(textoDeDias(v({ fecha: '2026-11-17' }), '2026-11-15')).toBe('17 nov · faltan 2 días')
    expect(textoDeDias(v({ fecha: '2026-11-16' }), '2026-11-15')).toBe('16 nov · falta 1 día')
    expect(textoDeDias(v({ fecha: '2026-11-15' }), '2026-11-15')).toBe('15 nov · vence hoy')
    expect(textoDeDias(v({ fecha: '2026-11-12' }), '2026-11-15')).toBe('12 nov · venció hace 3 días')
    expect(textoDeDias(v({ fecha: null }), '2026-11-15')).toBe('fecha por confirmar')
  })
})

describe('paid detection', () => {
  const pagados = (gastos: DatosDePorVencer['gastos'], reglas: Regla[]) =>
    Object.fromEntries(
      vencimientos(datos({ reglas, gastos }), '2026-11-15')
        .filter((x) => x.fecha?.startsWith('2026-11'))
        .map((x) => [x.id, x.pagado]),
    )

  it('keeps Gas paid: due on the 5th, paid on Nov 2', () => {
    const gas = regla({ id: 'gas', nombre: 'Gas', categoriaId: 'c-gas', diaDelMes: 5, proximaFecha: '2026-12-05' })
    expect(pagados([{ categoriaId: 'c-gas', dia: '2026-11-02' }], [gas])).toEqual({ gas: true })
  })

  it('keeps Administración paid: due on the 5th, paid on Nov 2', () => {
    const admin = regla({ id: 'admin', nombre: 'Administración', categoriaId: 'c-admin', diaDelMes: 5, proximaFecha: '2026-12-05' })
    expect(pagados([{ categoriaId: 'c-admin', dia: '2026-11-02' }], [admin])).toEqual({ admin: true })
  })

  it('leaves Luz unpaid: due on the 20th, its last payment on Nov 5 was October’s bill', () => {
    const luz = regla({ id: 'luz', nombre: 'Luz', categoriaId: 'c-luz', diaDelMes: 20, proximaFecha: '2026-11-20' })
    expect(pagados([{ categoriaId: 'c-luz', dia: '2026-11-05' }], [luz])).toEqual({ luz: false })
  })

  it('adds next month items due within 30 days, unpaid', () => {
    const vs = vencimientos(
      datos({ reglas: [regla({ id: 'r1', diaDelMes: 2, proximaFecha: '2026-11-02' })], gastos: [{ categoriaId: 'c-internet', dia: '2026-11-02' }] }),
      '2026-11-15',
    )
    expect(vs.map((x) => [x.id, x.fecha, x.pagado])).toEqual([
      ['r1', '2026-11-02', true],
      ['r1', '2026-12-02', false],
    ])
  })
})

describe('a card', () => {
  const extracto = { corte: '2026-10-28', vence: '2026-11-17', saldo: 900_000, minimo: 90_000, pagado: false }
  const tarjeta = (t: Partial<DatosDePorVencer['tarjetas'][number]>) => ({
    id: 'bbva',
    nombre: 'Master Card BBVA',
    diaDePago: 17,
    deuda: 6_709_182,
    extracto: null,
    ...t,
  })
  const delMes = (d: Partial<DatosDePorVencer>) =>
    vencimientos(datos(d), '2026-11-15').filter((x) => x.fecha?.startsWith('2026-11'))

  it('is due its minimum payment, less what was paid after the cut, with the statement total beside it, paid from the principal account', () => {
    const [v] = delMes({
      tarjetas: [tarjeta({ extracto })],
      pagosATarjetas: [
        { haciaCuentaId: 'bbva', dia: '2026-10-20', monto: 50_000 },
        { haciaCuentaId: 'bbva', dia: '2026-11-03', monto: 30_000 },
      ],
    })
    expect(v).toMatchObject({ monto: 60_000, total: 870_000, fecha: '2026-11-17', detalle: 'pago mínimo', pagado: false, sinExtracto: false, cuentaId: 'nomina' })
  })

  it('is paid when the statement is marked paid or the minimum is covered after the cut', () => {
    expect(delMes({ tarjetas: [tarjeta({ extracto: { ...extracto, pagado: true } })] })[0].pagado).toBe(true)
    expect(
      delMes({ tarjetas: [tarjeta({ extracto })], pagosATarjetas: [{ haciaCuentaId: 'bbva', dia: '2026-11-10', monto: 90_000 }] })[0].pagado,
    ).toBe(true)
  })

  it('falls back to the statement payment when the statement has no minimum', () => {
    const [v] = delMes({ tarjetas: [tarjeta({ extracto: { ...extracto, minimo: 0 } })] })
    expect(v).toMatchObject({ monto: 900_000, total: 900_000, detalle: 'pago del extracto' })
  })

  it('without a statement this month keeps its debt apart, out of every total', () => {
    const vs = vencimientos(datos({ tarjetas: [tarjeta({})] }), '2026-11-15')
    expect(vs).toHaveLength(1)
    expect(vs[0]).toMatchObject({ fecha: '2026-11-17', monto: 0, deuda: 6_709_182, sinExtracto: true, pagado: false })
    expect(totalDelMes(vs, '2026-11')).toBe(0)
    expect(totalEn30Dias(vs, '2026-11-15')).toBe(0)
    expect(porPagarEn30Dias(vs, '2026-11-15')).toEqual([])
    expect(semanaMasCargada(vs, '2026-11').mayor).toBe(-1)
  })
})

describe('what is left per paying account', () => {
  it('subtracts only each account’s unpaid dated items from its balance', () => {
    const vs = [
      v({ monto: 300, cuentaId: 'nomina', fecha: '2026-11-17' }),
      v({ monto: 50, cuentaId: 'nomina', fecha: '2026-11-18', pagado: true }),
      v({ monto: 900, cuentaId: 'efe', fecha: '2026-11-20' }),
      v({ monto: 70, cuentaId: 'efe', fecha: null }),
      v({ monto: 0, deuda: 5000, cuentaId: 'efe', fecha: '2026-11-21', sinExtracto: true }),
    ]
    expect(quedanPorCuenta(vs, { nomina: 1000, efe: 200 })).toEqual([
      { cuentaId: 'nomina', queda: 700 },
      { cuentaId: 'efe', queda: -700 },
    ])
  })
})

describe('the totals', () => {
  const vs = [
    v({ id: 'a', monto: 100, fecha: '2026-11-17' }),
    v({ id: 'b', monto: 50, fecha: '2026-11-05' }),
    v({ id: 'c', monto: 30, fecha: '2026-11-20', pagado: true }),
    v({ id: 'd', monto: 7, fecha: '2026-12-10' }),
    v({ id: 'e', monto: 1000, fecha: '2026-12-20' }),
    v({ id: 'f', monto: 9, fecha: null }),
  ]

  it('adds the month’s unpaid items, overdue ones included', () => {
    expect(totalDelMes(vs, '2026-11')).toBe(150)
  })

  it('adds the unpaid items due up to 30 days from today, and counts them for the badge', () => {
    expect(totalEn30Dias(vs, '2026-11-15')).toBe(157)
    expect(porPagarEn30Dias(vs, '2026-11-15').map((x) => x.id)).toEqual(['a', 'b', 'd'])
  })
})

describe('the heaviest week', () => {
  it('sums the month’s unpaid items by Monday-first week and marks the biggest', () => {
    // November 2026 starts on a Sunday: week 1 is only the 1st.
    const s = semanaMasCargada(
      [
        v({ monto: 10, fecha: '2026-11-01' }),
        v({ monto: 40, fecha: '2026-11-17' }),
        v({ monto: 5, fecha: '2026-11-22' }),
        v({ monto: 99, fecha: '2026-11-18', pagado: true }),
        v({ monto: 20, fecha: '2026-11-23' }),
      ],
      '2026-11',
    )
    expect(s.totales).toEqual([10, 0, 0, 45, 20, 0])
    expect(s.mayor).toBe(3)
  })

  it('marks none when nothing is left to pay', () => {
    expect(semanaMasCargada([], '2026-11').mayor).toBe(-1)
  })
})

describe('the circle size', () => {
  it('grows with the square root of the amount, between a floor and a ceiling', () => {
    expect(tamanoDeCirculo(100, 100)).toBe(36)
    expect(tamanoDeCirculo(25, 100)).toBe(23)
    expect(tamanoDeCirculo(0, 100)).toBe(10)
    expect(tamanoDeCirculo(5, 0)).toBe(10)
  })
})

describe('urgency', () => {
  it('is an unpaid item due within its reminder days, overdue included', () => {
    expect(esUrgente(v({ fecha: '2026-11-17', avisoDias: 3 }), '2026-11-15')).toBe(true)
    expect(esUrgente(v({ fecha: '2026-11-18', avisoDias: 3 }), '2026-11-15')).toBe(true)
    expect(esUrgente(v({ fecha: '2026-11-19', avisoDias: 3 }), '2026-11-15')).toBe(false)
    expect(esUrgente(v({ fecha: '2026-11-10', avisoDias: 1 }), '2026-11-15')).toBe(true)
    expect(esUrgente(v({ fecha: '2026-11-16', avisoDias: 3, pagado: true }), '2026-11-15')).toBe(false)
    expect(esUrgente(v({ fecha: null }), '2026-11-15')).toBe(false)
  })
})

describe('a debt installment rule and a card are paid with a transfer', () => {
  const deuda = regla({
    id: 'escrituras',
    nombre: 'Deuda escrituras',
    monto: 606000,
    diaDelMes: 15,
    proximaFecha: '2026-12-15',
    categoriaId: null,
    deudaId: 'd-pertuz',
    destinoId: 'pertuz',
  })

  it('a debt rule is paid by a payment to its debt within the slack, and points at the loan', () => {
    const [v] = vencimientos(datos({ reglas: [deuda], abonos: [{ deudaId: 'd-pertuz', dia: '2026-11-15' }] }), '2026-11-15')
    expect(v).toMatchObject({ fecha: '2026-11-15', pagado: true, destinoId: 'pertuz' })
    const [sinPagar] = vencimientos(datos({ reglas: [deuda], abonos: [{ deudaId: 'otra', dia: '2026-11-15' }] }), '2026-11-15')
    expect(sinPagar.pagado).toBe(false)
  })

  it('an expense rule has no destination, and a card points at itself', () => {
    const vs = vencimientos(
      datos({
        reglas: [regla({})],
        tarjetas: [
          {
            id: 'bbva',
            nombre: 'BBVA',
            diaDePago: 15,
            deuda: 100,
            extracto: { corte: '2026-10-28', vence: '2026-11-15', saldo: 100, minimo: 10, pagado: false },
          },
        ],
      }),
      '2026-11-10',
    )
    expect(vs.find((x) => x.id === 'r1')?.destinoId).toBeNull()
    expect(vs.find((x) => x.id === 'bbva')?.destinoId).toBe('bbva')
  })
})

