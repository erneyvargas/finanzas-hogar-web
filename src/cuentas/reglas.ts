import { dinero } from '../core/formato'

/**
 * What the «Cuentas» tab needs to group, total and offer actions, the same
 * rules as the phone (CuentasState, CuentaConDetalle, orden_de_cuentas).
 * The rules that guard the money live in the server functions of
 * migration 0048; these only decide what to show and what to offer.
 */

export type TipoDeCuenta =
  | 'cash'
  | 'debit'
  | 'wallet'
  | 'voucher'
  | 'credit_card'
  | 'liability'
  | 'savings'
  | 'investment'
  | 'receivable'

export type Grupo = 'corriente' | 'credito' | 'activo'

export const GRUPO: Record<TipoDeCuenta, Grupo> = {
  cash: 'corriente',
  debit: 'corriente',
  wallet: 'corriente',
  voucher: 'corriente',
  credit_card: 'credito',
  liability: 'credito',
  savings: 'activo',
  investment: 'activo',
  receivable: 'activo',
}

/** TipoCuenta.etiqueta. */
export const ETIQUETA: Record<TipoDeCuenta, string> = {
  cash: 'Efectivo',
  debit: 'Cuenta corriente',
  wallet: 'Billetera digital',
  voucher: 'Bono',
  credit_card: 'Tarjeta de crédito',
  liability: 'Préstamo',
  savings: 'Ahorros',
  investment: 'Inversión',
  receivable: 'Por cobrar',
}

/** The types a new account can take: loans and receivables are born in Deudas. */
export const TIPOS_QUE_SE_CREAN: TipoDeCuenta[] = [
  'cash',
  'debit',
  'wallet',
  'voucher',
  'savings',
  'investment',
  'credit_card',
]

/** The six simple types `cambiar_tipo_de_cuenta` moves between. */
export const TIPOS_SIMPLES: TipoDeCuenta[] = ['cash', 'debit', 'wallet', 'voucher', 'savings', 'investment']

export const ESTILOS = [
  { id: 'platino', nombre: 'Platino' },
  { id: 'azul', nombre: 'Azul' },
  { id: 'violeta', nombre: 'Violeta' },
] as const

export interface CuentaConSaldo {
  id: string
  nombre: string
  tipo: TipoDeCuenta
  /** `saldo_por_capital` up to now: what the phone shows. */
  saldo: number
  archivada: boolean
  principal: boolean
  /** Signed link to the photo, or null. */
  foto: string | null
  /** The stored path of the photo, to delete it when replaced. */
  rutaDeFoto: string | null
  cupo: number | null
  diaDeCorte: number | null
  diaDePago: number | null
  cobraGmf: boolean
  categoriaGmf: string | null
  estilo: string | null
}

/** The debt a loan or receivable account belongs to. */
export interface DeudaDeCuenta {
  cuentaId: string
  cuotasPagadas: number
  cuotasTotales: number | null
}

export interface CategoriaDeGasto {
  id: string
  /** `Rubro › Categoría › Subcategoría`. */
  ruta: string
}

export interface DatosDeCuentas {
  hogarId: string
  cuentas: CuentaConSaldo[]
  deudas: DeudaDeCuenta[]
  /** Live expense subcategories, for the 4x1000 charge. */
  categoriasDeGasto: CategoriaDeGasto[]
}

/** A row of an account's movements: any kind that touches it. */
export interface MovimientoDeCuenta {
  id: string
  tipo: 'expense' | 'income' | 'transfer' | 'debt_payment'
  monto: number
  fecha: string
  cuentaId: string
  contracuentaId: string | null
  comercio: string | null
  nota: string | null
  /** `Rubro › Categoría › Subcategoría`, when it has one. */
  categoria?: string | null
}

/** +1 when the movement brings money into [id], −1 when it takes it out. */
export const signoDe = (m: MovimientoDeCuenta, id: string) =>
  m.tipo === 'income' || ((m.tipo === 'transfer' || m.tipo === 'debt_payment') && m.contracuentaId === id) ? 1 : -1

/** How a movement reads from [id]'s side: the other account for a transfer, else merchant or note. */
export function textoDe(m: MovimientoDeCuenta, id: string, nombre: (id: string | null) => string) {
  if (m.tipo === 'transfer' || m.tipo === 'debt_payment') {
    const palabra = m.tipo === 'transfer' ? 'Transferencia' : 'Abono'
    return m.cuentaId === id ? `${palabra} a ${nombre(m.contracuentaId)}` : `${palabra} de ${nombre(m.cuentaId)}`
  }
  return m.comercio || m.nota || (m.tipo === 'income' ? 'Ingreso' : 'Gasto')
}

export const grupoDe = (c: { tipo: TipoDeCuenta }) => GRUPO[c.tipo]

/** What is owed on a credit account; zero when it is paid or in favour. */
export const debes = (c: CuentaConSaldo) => (c.saldo < 0 ? -c.saldo : 0)

/** What is left to spend on a card, or null without a limit. */
export const disponible = (c: CuentaConSaldo) => (c.cupo == null ? null : c.cupo + c.saldo)

/** A card with 90 % or more of its limit used, or nothing left. */
export function enRojo(c: CuentaConSaldo): boolean {
  const queda = disponible(c)
  if (queda == null || c.cupo == null) return false
  return queda <= 0 || (c.cupo > 0 && -c.saldo / c.cupo >= 0.9)
}

/** A loan nothing is owed on, or a receivable nothing is owed by (esDeudaSaldada). */
export function esDeudaSaldada(c: CuentaConSaldo): boolean {
  if (c.tipo === 'liability') return -c.saldo <= 0
  if (c.tipo === 'receivable') return c.saldo <= 0
  return false
}

/** Σ balances: what Tienes − Debes gives. */
export const patrimonio = (cuentas: CuentaConSaldo[]) => cuentas.reduce((s, c) => s + c.saldo, 0)

export type Orden = 'valor' | 'nombre' | 'tipo'
export const ORDENES: { id: Orden; nombre: string }[] = [
  { id: 'valor', nombre: 'Mayor valor' },
  { id: 'nombre', nombre: 'Nombre' },
  { id: 'tipo', nombre: 'Tipo' },
]

const ORDEN_DE_TIPO = Object.keys(GRUPO) as TipoDeCuenta[]
const porNombre = (a: CuentaConSaldo, b: CuentaConSaldo) =>
  a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })

/**
 * The accounts of one group in [orden]. Credits weigh by what is owed,
 * not by their (negative) balance, so the biggest debt comes first.
 */
export function ordenar(cuentas: CuentaConSaldo[], orden: Orden): CuentaConSaldo[] {
  const valor = (c: CuentaConSaldo) => (grupoDe(c) === 'credito' ? debes(c) : c.saldo)
  const lista = [...cuentas]
  if (orden === 'nombre') return lista.sort(porNombre)
  if (orden === 'tipo') {
    return lista.sort((a, b) => ORDEN_DE_TIPO.indexOf(a.tipo) - ORDEN_DE_TIPO.indexOf(b.tipo) || porNombre(a, b))
  }
  return lista.sort((a, b) => valor(b) - valor(a) || porNombre(a, b))
}

export interface Libro {
  corrientes: CuentaConSaldo[]
  creditos: CuentaConSaldo[]
  activos: CuentaConSaldo[]
  saldadas: CuentaConSaldo[]
  archivadas: CuentaConSaldo[]
  totalCorrientes: number
  totalActivos: number
  /** Σ owed on every credit account; a card in favour does not lower it. */
  debes: number
  /** What makes Tienes − Debes = patrimonio, a card in favour included. */
  tienes: number
  patrimonio: number
}

/** The ledger: live accounts by group, settled debts and archived ones apart. */
export function libroDe(cuentas: CuentaConSaldo[], orden: Orden): Libro {
  const vivas = cuentas.filter((c) => !c.archivada)
  const enGrupo = (g: Grupo) => vivas.filter((c) => grupoDe(c) === g && !esDeudaSaldada(c))
  const suma = (l: CuentaConSaldo[], f: (c: CuentaConSaldo) => number) => l.reduce((s, c) => s + f(c), 0)
  const creditosTodos = vivas.filter((c) => grupoDe(c) === 'credito')
  const activosTodos = vivas.filter((c) => grupoDe(c) === 'activo')
  const corrientes = enGrupo('corriente')
  const deuda = suma(creditosTodos, debes)
  const total = patrimonio(vivas)
  return {
    corrientes: ordenar(corrientes, orden),
    creditos: ordenar(enGrupo('credito'), orden),
    activos: ordenar(enGrupo('activo'), orden),
    saldadas: ordenar(vivas.filter(esDeudaSaldada), orden),
    archivadas: ordenar(cuentas.filter((c) => c.archivada), 'nombre'),
    totalCorrientes: suma(corrientes, (c) => c.saldo),
    totalActivos: suma(activosTodos, (c) => c.saldo),
    debes: deuda,
    tienes: total + deuda,
    patrimonio: total,
  }
}

/** `puede_transferir_entre` of migration 0041: the server's matrix. */
export function puedeTransferir(origen: TipoDeCuenta, destino: TipoDeCuenta): boolean {
  if (origen === 'voucher') return false
  const par = `${GRUPO[origen]}>${GRUPO[destino]}`
  return ['corriente>credito', 'activo>corriente', 'corriente>corriente', 'corriente>activo', 'credito>corriente'].includes(par)
}

export interface Destino {
  cuenta: CuentaConSaldo
  /** Why it cannot be chosen; absent when it can. */
  motivo?: string
}

/**
 * The live accounts [origen] can send money to. A loan is one of them:
 * paying it records an installment (0049), as the phone's Transferir
 * does; a settled loan is left out.
 */
export function destinosPara(origen: CuentaConSaldo, cuentas: CuentaConSaldo[]): Destino[] {
  return cuentas
    .filter((c) => !c.archivada && c.id !== origen.id && puedeTransferir(origen.tipo, c.tipo))
    .filter((c) => !(c.tipo === 'liability' && esDeudaSaldada(c)))
    .map((c) => ({ cuenta: c }))
}

/** `reparto_de_cuota` (0049): how an installment to a loan splits, before paying it. */
export interface RepartoDeCuota {
  saldo: number
  /** The month's interest still unpaid. */
  interesDelMes: number
  interes: number
  capital: number
  saldoDespues: number
  /** The amount does not cover the month's interest: the server rejects it. */
  insuficiente: boolean
}

export function leerReparto(r: unknown): RepartoDeCuota | null {
  if (!r || typeof r !== 'object') return null
  const o = r as Record<string, unknown>
  const n = (k: string) => Number(o[k])
  return {
    saldo: n('saldo'),
    interesDelMes: n('interes_del_mes'),
    interes: n('interes'),
    capital: n('capital'),
    saldoDespues: n('saldo_despues'),
    insuficiente: o.insuficiente === true,
  }
}

/** The accounts a transfer can leave from: live, and with somewhere to go. */
export function origenesPosibles(cuentas: CuentaConSaldo[]): CuentaConSaldo[] {
  return cuentas.filter((c) => !c.archivada && destinosPara(c, cuentas).some((d) => !d.motivo))
}

/**
 * Where a transfer form lets money leave from: a source the matrix takes
 * (not a voucher, not a loan, not archived) that has money (balance > 0).
 */
export function origenesConSaldo(cuentas: CuentaConSaldo[]): CuentaConSaldo[] {
  return origenesPosibles(cuentas).filter((c) => c.tipo !== 'liability' && c.saldo > 0)
}

/** The form's first source: [pedida] or the principal when they qualify, else the biggest balance. */
export function origenInicial(origenes: CuentaConSaldo[], pedida?: string): CuentaConSaldo | undefined {
  return (
    origenes.find((o) => o.id === pedida) ??
    origenes.find((o) => o.principal) ??
    origenes.reduce<CuentaConSaldo | undefined>((max, o) => (!max || o.saldo > max.saldo ? o : max), undefined)
  )
}

/** Swapping is offered only when the way back is a valid transfer too. */
export const puedeInvertir = (origen: CuentaConSaldo, destino: CuentaConSaldo) =>
  origen.tipo !== 'liability' && puedeTransferir(destino.tipo, origen.tipo)

/** `gmf_de`: the 4x1000 of an amount, rounded to pesos. */
export const gmfDe = (monto: number) => (monto > 0 ? Math.round(monto * 0.004) : 0)

/** What each account is left with after the transfer; the source also pays its 4x1000. */
/** Both balances after the transfer; a loan receives only the installment's [capital]. */
export function vistaPrevia(origen: CuentaConSaldo, destino: CuentaConSaldo, monto: number, capital = monto) {
  const gmf = origen.cobraGmf && origen.categoriaGmf ? gmfDe(monto) : 0
  return { origen: origen.saldo - monto - gmf, destino: destino.saldo + capital, gmf }
}

/** Which actions an account offers, by the rules of the phone and of 0048. */
export function accionesDe(c: CuentaConSaldo) {
  const viva = !c.archivada
  return {
    transferir: viva,
    editar: viva,
    ajustar: viva && c.tipo !== 'credit_card' && c.tipo !== 'liability',
    principal: viva && grupoDe(c) === 'corriente' && c.tipo !== 'voucher' && !c.principal,
    cambiarTipo: viva && TIPOS_SIMPLES.includes(c.tipo),
    gmf: viva && ['debit', 'savings', 'wallet'].includes(c.tipo),
    estilo: viva && ['credit_card', 'debit', 'wallet'].includes(c.tipo),
    foto: viva,
    archivar: viva && !c.principal,
    desarchivar: c.archivada,
  }
}

/** `−$150.000` for a negative amount, `$150.000` otherwise. */
export const conSigno = (n: number) => (n < 0 ? `−${dinero(-n)}` : dinero(n))

/** The checks of `crear_cuenta` and `editar_tarjeta`, with the server's messages. */
export function errorDeTarjeta(cupo: number | null, corte: number | null, pago: number | null): string | null {
  if (corte == null || pago == null || Number.isNaN(corte) || Number.isNaN(pago)) {
    return 'Una tarjeta de crédito necesita día de corte y día de pago'
  }
  const fuera = (d: number) => !Number.isInteger(d) || d < 1 || d > 31
  if (fuera(corte) || fuera(pago)) return 'El día debe estar entre 1 y 31'
  if (cupo != null && (Number.isNaN(cupo) || cupo < 0)) return 'El cupo no puede ser negativo'
  return null
}
