import { describe, expect, it } from 'vitest'
import {
  avisoDeCierre,
  comparar,
  cuotaFija,
  deudasDelPlan,
  diferidosDelPlan,
  filasDeOrden,
  lineaDeDiferencia,
  mesDelPlan,
  millones,
  recomendar,
  saldoCapitalizado,
  simular,
  sobrante,
  textoDeEsteMes,
  textoDeTasa,
  type DeudaDelPlan,
  type DiferidoCrudo,
  type ResultadoDelPlan,
} from './plan'

/*
 * Port of the phone's reference tests (test/plan_de_deudas_test.dart in
 * the Flutter repo). The reference case is the household's real balances,
 * rates, installments and insurance with a $500.000 example surplus; the
 * web engine must give the same numbers, peso for peso.
 */

const deuda = (nombre: string, saldo: number, tasa: number, minimo = 0, cargo = 0): DeudaDelPlan => ({
  id: nombre,
  nombre,
  saldo,
  tasaMensual: tasa,
  minimo,
  cargoFijo: cargo,
  capitaliza: false,
})

const referencia: DeudaDelPlan[] = [
  deuda('Hipotecario', 124754493, 0.0088859305, 1286960, 70040),
  deuda('Colsubsidio', 36642339, 0.0138955903, 882645, 42479),
  deuda('Pertuz', 10805337, 0.0064340301, 606000),
  deuda('Davivienda', 4366649, 0.0173939486, 259586, 5414),
  deuda('Terraza', 2970520, 0.03),
  deuda('Don Ciro', 10000000, 0),
  deuda('Jorge', 6000000, 0),
  deuda('Reinaldo', 3000000, 0),
  deuda('Brayan', 2800000, 0),
  deuda('Baby shower', 100000, 0),
]

const cierres = (r: ResultadoDelPlan) => r.cierres.map((c) => [c.nombre, c.mes])

describe('reference case, surplus of 500.000', () => {
  it('avalancha: 76 months, ~66.487.847 of interest and its order', () => {
    const r = simular(referencia, 500000, 'avalancha')

    expect(r.meses).toBe(76)
    expect(Math.abs(r.interesTotal - 66487847)).toBeLessThanOrEqual(2)
    expect(cierres(r)).toEqual([
      ['Terraza', 7],
      ['Davivienda', 11],
      ['Pertuz', 19],
      ['Colsubsidio', 30],
      ['Hipotecario', 70],
      ['Don Ciro', 72],
      ['Jorge', 74],
      ['Reinaldo', 75],
      ['Brayan', 76],
      ['Baby shower', 76],
    ])
    // The first month's extra goes entirely to the highest rate.
    expect(r.abonosDelMes).toEqual([{ id: 'Terraza', nombre: 'Terraza', monto: 500000 }])
  })

  it('bola de nieve: 81 months, ~85.362.704 of interest and its order', () => {
    const r = simular(referencia, 500000, 'bola_de_nieve')

    expect(r.meses).toBe(81)
    expect(Math.abs(r.interesTotal - 85362704)).toBeLessThanOrEqual(2)
    expect(cierres(r)).toEqual([
      ['Baby shower', 1],
      ['Brayan', 6],
      ['Reinaldo', 12],
      ['Davivienda', 15],
      ['Pertuz', 17],
      ['Terraza', 21],
      ['Jorge', 25],
      ['Don Ciro', 32],
      ['Colsubsidio', 43],
      ['Hipotecario', 81],
    ])
    // The smallest closes and what is left goes to the next one.
    expect(r.abonosDelMes.map((a) => [a.nombre, a.monto])).toEqual([
      ['Baby shower', 100000],
      ['Brayan', 400000],
    ])
  })

  it('recommends the one that finishes first', () => {
    expect(comparar(referencia, 500000).recomendada).toBe('avalancha')
  })
})

describe('ties', () => {
  it('at the same rate the order the debts arrive in wins', () => {
    const r = simular([deuda('A', 1000, 0), deuda('B', 1000, 0), deuda('C', 1000, 0)], 500, 'avalancha')
    expect(cierres(r)).toEqual([
      ['A', 2],
      ['B', 4],
      ['C', 6],
    ])
  })

  it('same month: the one with less interest wins', () => {
    const base = { cierres: [], abonosDelMes: [], mesAMes: [], interesPorDeuda: {} }
    const avalancha: ResultadoDelPlan = { ...base, estrategia: 'avalancha', meses: 10, interesTotal: 900 }
    const bola: ResultadoDelPlan = { ...base, estrategia: 'bola_de_nieve', meses: 10, interesTotal: 800 }
    expect(recomendar(avalancha, bola)).toBe('bola_de_nieve')
  })

  it('same month and same interest: avalancha', () => {
    const r = comparar([deuda('Única', 1000, 0.01, 100)], 0)
    expect(r.avalancha.meses).toBe(r.bolaDeNieve.meses)
    expect(r.recomendada).toBe('avalancha')
  })
})

it('surplus at zero: only the minimums run, and the freed ones roll over', () => {
  const r = simular([deuda('Corta', 300, 0, 100), deuda('Larga', 1000, 0, 100)], 0, 'avalancha')
  expect(r.abonosDelMes).toEqual([])
  // Corta closes in month 3; from month 4 Larga gets 200 a month.
  expect(cierres(r)).toEqual([
    ['Corta', 3],
    ['Larga', 7],
  ])
  expect(r.meses).toBe(7)
})

it('a debt that capitalizes with no payments never closes: the plan stops', () => {
  const r = simular([deuda('Terraza', 2800000, 0.03)], 0, 'avalancha')
  expect(r.meses).toBeNull()
  expect(cierres(r)).toEqual([['Terraza', null]])
  expect(r.mesAMes).toHaveLength(600)
})

it('a capitalizing debt adds the interest of each full month since it started', () => {
  expect(saldoCapitalizado(2800000, 0.03, '2026-10-01', '2026-12-01')).toBe(2970520)
  // A month not yet completed charges nothing.
  expect(saldoCapitalizado(2800000, 0.03, '2026-10-15', '2026-11-14')).toBe(2800000)
})

describe('from the debts to the plan', () => {
  const cruda = (o: Partial<Parameters<typeof deudasDelPlan>[0][number]> = {}) => ({
    id: 'X',
    nombre: 'X',
    saldo: 1000000,
    tasaMensual: 0,
    cuota: null,
    cargos: 0,
    inicio: null,
    nosDeben: false,
    ...o,
  })

  it('the minimum is the installment minus the insurance, which goes apart', () => {
    const [p] = deudasDelPlan([cruda({ nombre: 'Hipotecario', tasaMensual: 0.0088859305, cuota: 1357000, cargos: 70040 })], '2026-12-01')
    expect(p.minimo).toBe(1286960)
    expect(p.cargoFijo).toBe(70040)
    expect(p.capitaliza).toBe(false)
  })

  it('charges that do not fit in the installment are not subtracted', () => {
    const [p] = deudasDelPlan([cruda({ cuota: 100000, cargos: 100000 })], '2026-12-01')
    expect(p.minimo).toBe(100000)
    expect(p.cargoFijo).toBe(0)
  })

  it('with interest and no installment it capitalizes since it started', () => {
    const [p] = deudasDelPlan([cruda({ nombre: 'Terraza', saldo: 2800000, tasaMensual: 0.03, inicio: '2026-10-01' })], '2026-12-01')
    expect(p.saldo).toBe(2970520)
    expect(p.minimo).toBe(0)
    expect(p.capitaliza).toBe(true)
  })

  it('no installment and no rate: minimum 0 and rate 0; what they owe us and the settled ones stay out', () => {
    const lista = deudasDelPlan(
      [cruda({ nombre: 'Don Ciro', saldo: 10000000 }), cruda({ nombre: 'Me deben', nosDeben: true }), cruda({ nombre: 'Saldada', saldo: 0 })],
      '2026-12-01',
    )
    expect(lista.map((p) => p.nombre)).toEqual(['Don Ciro'])
    expect(lista[0].minimo).toBe(0)
    expect(lista[0].tasaMensual).toBe(0)
  })
})

describe('the surplus', () => {
  it('the average of the months, never below zero', () => {
    expect(sobrante(9000, 5500, 3)).toBe(1167)
    expect(sobrante(3000, 6000, 3)).toBe(0)
    expect(sobrante(0, 0, 3)).toBe(0)
  })
})

describe('month by month', () => {
  // The reference debts with Terraza at 2.884.000 (November 2026) and the
  // surplus the app computed on the phone.
  const reales = referencia.map((x) => (x.nombre === 'Terraza' ? deuda('Terraza', 2884000, 0.03) : x))
  const r = simular(reales, 252732, 'avalancha')

  it('month 1 matches the phone figures', () => {
    const uno = r.mesAMes[0]
    expect(uno.numero).toBe(1)
    expect(uno.extraA).toBe('Terraza')
    expect(Math.round(uno.pagado)).toBe(3405856)
    expect(Math.abs(Math.round(uno.interes) - 1849722)).toBeLessThanOrEqual(1)
    expect(Math.abs(Math.round(uno.debes) - 199914617)).toBeLessThanOrEqual(1)

    const terraza = uno.porDeuda.find((m) => m.nombre === 'Terraza')!
    expect(Math.round(terraza.interes)).toBe(86520)
    expect(Math.round(terraza.pago)).toBe(252732)
    expect(Math.round(terraza.saldo)).toBe(2717788)
    // The real installment, with insurance: what actually goes out.
    expect(Math.round(uno.porDeuda.find((m) => m.nombre === 'Davivienda')!.pago)).toBe(265000)
  })

  it('each row says how much of its payment was extra', () => {
    const uno = r.mesAMes[0]
    expect(Math.round(uno.porDeuda.find((m) => m.nombre === 'Terraza')!.extra)).toBe(252732)
    for (const m of uno.porDeuda.filter((m) => m.nombre !== 'Terraza')) expect(m.extra).toBe(0)
  })

  it('one row per month; the interest adds up to the total; it ends at 0', () => {
    expect(r.mesAMes).toHaveLength(r.meses!)
    expect(Math.round(r.mesAMes.reduce((s, m) => s + m.interes, 0))).toBe(r.interesTotal)
    expect(Math.round(r.mesAMes[r.mesAMes.length - 1].debes)).toBe(0)
  })

  it('the month a debt reaches 0 says where the extra goes', () => {
    const mesTerraza = r.cierres.find((c) => c.nombre === 'Terraza')!.mes!
    const m = r.mesAMes[mesTerraza - 1]
    expect(m.cerradas).toEqual(['Terraza'])
    expect(m.extraPasaA).toBe('Davivienda')
    expect(avisoDeCierre(m)).toBe('Terraza queda en $0 · el extra pasa a Davivienda')
    // The last month has nowhere left to pass it.
    const ultimo = r.mesAMes[r.mesAMes.length - 1]
    expect(ultimo.extraPasaA).toBeNull()
    expect(avisoDeCierre(ultimo)).toMatch(/en \$0 · ya no debes nada$/)
  })

  it('the interest per debt adds up to the total', () => {
    const suma = Object.values(r.interesPorDeuda).reduce((s, v) => s + v, 0)
    expect(Math.round(suma)).toBe(r.interesTotal)
  })
})

describe('credit card deferred purchases', () => {
  const diferido = (id: string, o: Partial<DiferidoCrudo> = {}): DiferidoCrudo => ({
    id,
    descripcion: `TV ${id}`,
    total: 1200000,
    cuotas: 12,
    cobradas: 0,
    capitalMensual: 100000,
    tasaMensual: 0,
    activo: true,
    ...o,
  })

  it('with interest: the bank charges it on the balance still owed', () => {
    const plan = diferidosDelPlan([diferido('a', { cobradas: 3, tasaMensual: 0.02 })])
    expect(plan).toHaveLength(1)
    const tv = plan[0]
    expect(tv).toMatchObject({ id: 'a', nombre: 'TV a', saldo: 900000, tasaMensual: 0.02, cargoFijo: 0, capitaliza: false })
    expect(tv.minimo).toBe(cuotaFija(900000, 0.02, 9))
    expect(simular(plan, 0, 'avalancha').cierres[0].mes).toBe(9)
  })

  it('at 0 %: the balance split over the installments left', () => {
    const [sony] = diferidosDelPlan([diferido('sony', { total: 254904, cuotas: 6, capitalMensual: 42484 })])
    expect(sony.saldo).toBe(254904)
    expect(sony.minimo).toBe(42484)
    expect(sony.tasaMensual).toBe(0)
  })

  it('finished, inactive or fully charged ones stay out', () => {
    expect(diferidosDelPlan([diferido('inactivo', { activo: false }), diferido('cobrado', { cobradas: 12 })])).toEqual([])
  })

  it('the extra closes a deferred purchase early', () => {
    expect(simular(diferidosDelPlan([diferido('a')]), 1100000, 'avalancha').cierres[0].mes).toBe(1)
  })

  it('the fixed installment rounds to cents', () => {
    expect(cuotaFija(900000, 0.02, 9)).toBe(110263.89)
    expect(cuotaFija(254904, 0, 6)).toBe(42484)
  })
})

describe('texts', () => {
  it('the current month is month 1', () => {
    expect(mesDelPlan('2026-11', 1)).toBe('nov 2026')
    expect(mesDelPlan('2026-11', 76)).toBe('feb 2033')
  })

  it('amounts from a million read in millions', () => {
    expect(millones(66487847)).toBe('$66,5 M')
    expect(millones(999999)).toBe('$999.999')
  })

  it('the rate reads as EA, monthly when it capitalizes', () => {
    expect(textoDeTasa(0.0173939486, false)).toBe('23 % EA')
    expect(textoDeTasa(0.03, true)).toBe('3 % mes')
    expect(textoDeTasa(0, false)).toBe('0 %')
  })

  it('the 0 % debts that close at the end go together in one row', () => {
    const filas = filasDeOrden(simular(referencia, 500000, 'avalancha'))
    expect(filas.map((f) => f.nombres.join(', '))).toEqual([
      'Terraza',
      'Davivienda',
      'Pertuz',
      'Colsubsidio',
      'Hipotecario',
      'Don Ciro, Jorge, Reinaldo, Brayan, Baby shower',
    ])
    expect(filas[5].mes).toBe(76)
  })

  it('the comparison line speaks of the recommended one', () => {
    expect(lineaDeDiferencia(comparar(referencia, 500000), 10)).toBe('Avalancha: 5 meses antes y $18,9 M menos')
    expect(lineaDeDiferencia(comparar([deuda('Única', 1000, 0.01, 100)], 0), 1)).toBe('Con una sola deuda, las dos dan lo mismo.')
  })

  it('this month: the extra and where it goes after the first close', () => {
    expect(textoDeEsteMes(simular(referencia, 500000, 'avalancha'), '2026-11')).toBe(
      'Este mes: $500.000 extra a Terraza. Cuando Terraza llegue a $0 en may 2027, ese dinero pasa a Davivienda.',
    )
    expect(textoDeEsteMes(simular(referencia, 500000, 'bola_de_nieve'), '2026-11')).toBe(
      'Este mes: $100.000 extra a Baby shower y $400.000 a Brayan. Cuando Baby shower llegue a $0 en nov 2026, ese dinero pasa a Brayan.',
    )
    // A debt that ends with its own cuota while the extra goes to another: its cuota
    // joins the extra, it does not «move» to where the money already was.
    expect(
      textoDeEsteMes(simular([deuda('Alkosto', 300, 0.02, 110), deuda('Terraza', 5000, 0.03, 0)], 200, 'avalancha'), '2026-11'),
    ).toBe('Este mes: $200 extra a Terraza. Cuando Alkosto termine en ene 2027, su cuota también se suma a Terraza.')
    expect(textoDeEsteMes(simular([deuda('Corta', 300, 0, 100)], 0, 'avalancha'), '2026-11')).toBe(
      'Este mes paga tus cuotas; todavía no queda extra para abonar.',
    )
  })
})
