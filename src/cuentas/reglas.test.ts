import { describe, expect, it } from 'vitest'
import {
  accionesDe,
  debes,
  destinosPara,
  disponible,
  enRojo,
  errorDeTarjeta,
  esDeudaSaldada,
  libroDe,
  ordenar,
  patrimonio,
  puedeInvertir,
  puedeTransferir,
  vistaPrevia,
  type CuentaConSaldo,
} from './reglas'

const cuenta = (c: Partial<CuentaConSaldo> & Pick<CuentaConSaldo, 'id' | 'tipo' | 'saldo'>): CuentaConSaldo => ({
  nombre: c.id,
  archivada: false,
  principal: false,
  foto: null,
  rutaDeFoto: null,
  cupo: null,
  diaDeCorte: null,
  diaDePago: null,
  cobraGmf: false,
  categoriaGmf: null,
  estilo: null,
  tasaAnual: null,
  ...c,
})

const efectivo = cuenta({ id: 'Efectivo', tipo: 'cash', saldo: 10_000 })
const nequi = cuenta({ id: 'Nequi', tipo: 'wallet', saldo: 50_000, cobraGmf: true, categoriaGmf: 'gmf' })
const tarjeta = cuenta({ id: 'Visa', tipo: 'credit_card', saldo: -150_000, cupo: 2_000_000 })
const aFavor = cuenta({ id: 'Amex', tipo: 'credit_card', saldo: 5_000 })
const prestamo = cuenta({ id: 'Libranza', tipo: 'liability', saldo: -4_000_000 })
const pagado = cuenta({ id: 'Carro', tipo: 'liability', saldo: 0 })
const ahorros = cuenta({ id: 'Ahorros', tipo: 'savings', saldo: 900_000 })
const cobrado = cuenta({ id: 'Préstamo a Juan', tipo: 'receivable', saldo: 0 })
const bono = cuenta({ id: 'Bono', tipo: 'voucher', saldo: 20_000 })
const viejo = cuenta({ id: 'Viejo', tipo: 'cash', saldo: 0, archivada: true })

describe('the accounts ledger', () => {
  it('groups live accounts and leaves settled debts and archived ones apart', () => {
    const l = libroDe([efectivo, nequi, tarjeta, prestamo, pagado, ahorros, cobrado, viejo], 'nombre')
    expect(l.corrientes.map((c) => c.id)).toEqual(['Efectivo', 'Nequi'])
    expect(l.creditos.map((c) => c.id)).toEqual(['Libranza', 'Visa'])
    expect(l.activos.map((c) => c.id)).toEqual(['Ahorros'])
    expect(l.saldadas.map((c) => c.id)).toEqual(['Carro', 'Préstamo a Juan'])
    expect(l.archivadas.map((c) => c.id)).toEqual(['Viejo'])
  })

  it('totals Tienes − Debes = patrimonio, a card in favour on the Tienes side', () => {
    const l = libroDe([efectivo, tarjeta, aFavor, ahorros], 'valor')
    expect(l.totalCorrientes).toBe(10_000)
    expect(l.totalActivos).toBe(900_000)
    expect(l.debes).toBe(150_000)
    expect(l.patrimonio).toBe(765_000)
    expect(l.tienes - l.debes).toBe(l.patrimonio)
    expect(patrimonio([efectivo, tarjeta])).toBe(-140_000)
  })

  it('owes the negative balance only', () => {
    expect(debes(tarjeta)).toBe(150_000)
    expect(debes(aFavor)).toBe(0)
  })

  it('detects settled loans and receivables, never other accounts', () => {
    expect(esDeudaSaldada(pagado)).toBe(true)
    expect(esDeudaSaldada(cobrado)).toBe(true)
    expect(esDeudaSaldada(prestamo)).toBe(false)
    expect(esDeudaSaldada(cuenta({ id: 'x', tipo: 'cash', saldo: 0 }))).toBe(false)
  })
})

describe('the card line', () => {
  it('leaves the limit plus the balance to spend', () => {
    expect(disponible(tarjeta)).toBe(1_850_000)
    expect(disponible(aFavor)).toBeNull()
  })

  it('turns red at 90 % used or with nothing left', () => {
    expect(enRojo(tarjeta)).toBe(false)
    expect(enRojo({ ...tarjeta, saldo: -1_799_999 })).toBe(false)
    expect(enRojo({ ...tarjeta, saldo: -1_800_000 })).toBe(true)
    expect(enRojo({ ...tarjeta, cupo: 0, saldo: 0 })).toBe(true)
    expect(enRojo(aFavor)).toBe(false)
  })
})

describe('ordering', () => {
  const lista = [efectivo, ahorros, nequi, bono]
  it('puts the biggest value first, credits by what is owed', () => {
    expect(ordenar(lista, 'valor').map((c) => c.id)).toEqual(['Ahorros', 'Nequi', 'Bono', 'Efectivo'])
    expect(ordenar([tarjeta, prestamo], 'valor').map((c) => c.id)).toEqual(['Libranza', 'Visa'])
  })
  it('sorts by name and by type', () => {
    expect(ordenar(lista, 'nombre').map((c) => c.id)).toEqual(['Ahorros', 'Bono', 'Efectivo', 'Nequi'])
    expect(ordenar(lista, 'tipo').map((c) => c.id)).toEqual(['Efectivo', 'Nequi', 'Bono', 'Ahorros'])
  })
})

describe('transfers', () => {
  it('follows the server matrix', () => {
    expect(puedeTransferir('cash', 'credit_card')).toBe(true)
    expect(puedeTransferir('savings', 'cash')).toBe(true)
    expect(puedeTransferir('credit_card', 'cash')).toBe(true)
    expect(puedeTransferir('savings', 'investment')).toBe(false)
    expect(puedeTransferir('credit_card', 'savings')).toBe(false)
    expect(puedeTransferir('voucher', 'cash')).toBe(false)
  })

  it('lists the destinations, a loan among them: paying it is an installment (0049)', () => {
    const d = destinosPara(efectivo, [efectivo, nequi, tarjeta, prestamo, ahorros, viejo])
    expect(d.map((x) => x.cuenta.id)).toEqual(['Nequi', 'Visa', 'Libranza', 'Ahorros'])
    expect(d.filter((x) => x.motivo)).toHaveLength(0)
    expect(destinosPara(ahorros, [ahorros, efectivo, tarjeta]).map((x) => x.cuenta.id)).toEqual(['Efectivo'])
  })

  it('offers to swap only when the way back is valid', () => {
    expect(puedeInvertir(efectivo, nequi)).toBe(true)
    expect(puedeInvertir(efectivo, tarjeta)).toBe(true)
    expect(puedeInvertir(efectivo, bono)).toBe(false)
    expect(puedeInvertir(ahorros, efectivo)).toBe(true)
  })

  it('previews both balances, the source paying its 4x1000', () => {
    expect(vistaPrevia(efectivo, tarjeta, 10_000)).toEqual({ origen: 0, destino: -140_000, gmf: 0 })
    expect(vistaPrevia(nequi, efectivo, 20_000)).toEqual({ origen: 29_920, destino: 30_000, gmf: 80 })
  })
})

describe('account actions', () => {
  it('offers principal only to a current account that can pay', () => {
    expect(accionesDe(efectivo).principal).toBe(true)
    expect(accionesDe(bono).principal).toBe(false)
    expect(accionesDe(ahorros).principal).toBe(false)
    expect(accionesDe({ ...efectivo, principal: true }).principal).toBe(false)
  })
  it('offers 4x1000 only to debit, savings and wallets', () => {
    expect(accionesDe(nequi).gmf).toBe(true)
    expect(accionesDe(ahorros).gmf).toBe(true)
    expect(accionesDe(efectivo).gmf).toBe(false)
    expect(accionesDe(tarjeta).gmf).toBe(false)
  })
  it('lets an archived account only be unarchived', () => {
    const a = accionesDe(viejo)
    expect(Object.entries(a).filter(([, v]) => v).map(([k]) => k)).toEqual(['desarchivar'])
  })
})

describe('card validation', () => {
  it('uses the server messages', () => {
    expect(errorDeTarjeta(null, null, 5)).toBe('Una tarjeta de crédito necesita día de corte y día de pago')
    expect(errorDeTarjeta(null, 32, 5)).toBe('El día debe estar entre 1 y 31')
    expect(errorDeTarjeta(-1, 15, 5)).toBe('El cupo no puede ser negativo')
    expect(errorDeTarjeta(null, 15, 5)).toBeNull()
  })
})
