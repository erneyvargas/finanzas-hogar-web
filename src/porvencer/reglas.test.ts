import { describe, expect, it } from 'vitest'
import {
  diasEntre,
  esUrgente,
  fechaDeRegla,
  porPagarEn30Dias,
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
  saldoPrincipal: 1_000_000,
  gastosDelMes: [],
  transferenciasDelMes: [],
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
  it('marks a rule paid by a live expense in its category this month, and a card by a transfer into it or no debt', () => {
    const vs = vencimientos(
      datos({
        reglas: [regla({ id: 'r1' }), regla({ id: 'r2', nombre: 'Luz', categoriaId: 'c-luz', diaDelMes: 20, proximaFecha: '2026-11-20' })],
        tarjetas: [
          { id: 'bbva', nombre: 'Tarjeta BBVA', diaDePago: 17, deuda: 1238273 },
          { id: 'visa', nombre: 'Visa', diaDePago: 5, deuda: 500 },
          { id: 'cero', nombre: 'Sin deuda', diaDePago: 9, deuda: 0 },
        ],
        gastosDelMes: [{ categoriaId: 'c-internet' }],
        transferenciasDelMes: [{ haciaCuentaId: 'visa' }],
      }),
      '2026-11-15',
    ).filter((x) => x.fecha?.startsWith('2026-11'))
    const pagado = Object.fromEntries(vs.map((x) => [x.id, x.pagado]))
    expect(pagado).toEqual({ r1: true, r2: false, bbva: false, visa: true, cero: true })
  })

  it('pays a card from the principal account and adds next month items due within 30 days, unpaid', () => {
    const vs = vencimientos(
      datos({
        reglas: [regla({ id: 'r1', diaDelMes: 2, proximaFecha: '2026-11-02' })],
        tarjetas: [{ id: 'bbva', nombre: 'Tarjeta BBVA', diaDePago: 17, deuda: 100 }],
        gastosDelMes: [{ categoriaId: 'c-internet' }],
      }),
      '2026-11-15',
    )
    expect(vs.find((x) => x.id === 'bbva')?.cuentaId).toBe('nomina')
    const diciembre = vs.filter((x) => x.fecha?.startsWith('2026-12'))
    expect(diciembre.map((x) => [x.id, x.fecha, x.pagado])).toEqual([['r1', '2026-12-02', false]])
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
