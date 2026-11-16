/**
 * The plan to get out of debt: a port of the phone's engine
 * (lib/core/finance/plan_de_deudas.dart). Same double math in the same
 * order, so both give the same months and interest peso for peso; amounts
 * are rounded to whole pesos only on the way out.
 */
import { dinero } from '../core/formato'
import { moverMes } from '../tablero/calculo'

/** How each month's extra is split between the debts. */
export type Estrategia = 'avalancha' | 'bola_de_nieve'

export const ESTRATEGIAS: { id: Estrategia; nombre: string; regla: string }[] = [
  { id: 'avalancha', nombre: 'Avalancha', regla: 'Tasa más alta primero' },
  { id: 'bola_de_nieve', nombre: 'Bola de nieve', regla: 'Más chica primero' },
]

export const nombreDe = (e: Estrategia) => ESTRATEGIAS.find((x) => x.id === e)!.nombre

/** A debt as it enters the simulation. */
export interface DeudaDelPlan {
  id: string
  nombre: string
  saldo: number
  tasaMensual: number
  /** What the installment pays to principal and interest each month. */
  minimo: number
  /** Insurance and charges: they go out every month while the debt lives and do not lower it. */
  cargoFijo: number
  /** With interest and no installment: unpaid interest is added to the debt. */
  capitaliza: boolean
}

/** When a debt reaches zero; `mes` is null when it never closes within the cap. */
export interface CierreDeDeuda {
  id: string
  nombre: string
  tasaMensual: number
  capitaliza: boolean
  /** Month of the plan, counted from 1 (the current month). */
  mes: number | null
}

/** What goes as extra to a debt in the plan's first month. */
export interface AbonoExtra {
  id: string
  nombre: string
  monto: number
}

/** What happened to one debt in one month (unrounded, like the simulation). */
export interface MovimientoDelMes {
  id: string
  nombre: string
  /** Installment with insurance plus the extra it got. */
  pago: number
  /** The part of `pago` that was extra. */
  extra: number
  interes: number
  /** What is left after the payment. */
  saldo: number
}

/** One row of «Ver mes a mes». */
export interface MesDelPlan {
  numero: number
  /** The first debt that got extra that month; null without extra. */
  extraA: string | null
  /** Minimums, insurance and extra that actually went out. */
  pagado: number
  interes: number
  /** What is still owed across all of them at the end of the month. */
  debes: number
  /** One per debt still open at the start of the month. */
  porDeuda: MovimientoDelMes[]
  /** The ones that reached $0 this month. */
  cerradas: string[]
  /** If any closed, the one that gets the extra from next month on. */
  extraPasaA: string | null
}

export interface ResultadoDelPlan {
  estrategia: Estrategia
  /** Months until debt-free; null when some debt never closes. */
  meses: number | null
  /** Whole pesos. */
  interesTotal: number
  /** In closing order; the ones that never close last, with a null month. */
  cierres: CierreDeDeuda[]
  /** The current month's extra, debt by debt, in the order it is paid. */
  abonosDelMes: AbonoExtra[]
  mesAMes: MesDelPlan[]
  /** The interest each debt paid over the whole plan, by id (unrounded). */
  interesPorDeuda: Record<string, number>
}

export interface ComparacionDePlanes {
  avalancha: ResultadoDelPlan
  bolaDeNieve: ResultadoDelPlan
  recomendada: Estrategia
}

export const resultadoDe = (c: ComparacionDePlanes, e: Estrategia) => (e === 'avalancha' ? c.avalancha : c.bolaDeNieve)

/** Fifty years: a debt that capitalizes and nobody pays grows forever. */
export const TOPE_DE_MESES = 600

/** Below half a peso a debt is settled: float leaves cents that are nobody's money. */
const SALDADA = 0.5

const comparar3 = (a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0)

/** The live debts in the order they get the extra; ties by list order. */
function orden(deudas: DeudaDelPlan[], saldos: number[], estrategia: Estrategia): number[] {
  const vivas: number[] = []
  for (let i = 0; i < deudas.length; i++) if (saldos[i] > SALDADA) vivas.push(i)
  const llave = (i: number) => (estrategia === 'avalancha' ? -deudas[i].tasaMensual : saldos[i])
  return vivas.sort((a, b) => comparar3(llave(a), llave(b)) || a - b)
}

/**
 * Follows [estrategia] month by month with [sobrante] of extra. Each month:
 * every live debt charges its interest and its fixed charges come out of
 * the budget; each pays its minimum; what is left goes to the debts in the
 * strategy's order. The budget is fixed (minimums + charges + surplus), so
 * a closed debt's installment rolls over to the next one.
 */
export function simular(deudas: DeudaDelPlan[], sobrante: number, estrategia: Estrategia): ResultadoDelPlan {
  const saldos = deudas.map((d) => d.saldo)
  const cierre: (number | null)[] = saldos.map((s) => (s <= SALDADA ? 0 : null))
  const presupuesto = deudas.reduce((suma, d) => suma + d.minimo + d.cargoFijo, 0) + sobrante

  let mes = 0
  let interes = 0
  const abonosDelMes: AbonoExtra[] = []
  const mesAMes: MesDelPlan[] = []
  const interesAcumulado = deudas.map(() => 0)
  const viva = (i: number) => saldos[i] > SALDADA

  while (mes < TOPE_DE_MESES && deudas.some((_, i) => viva(i))) {
    mes++
    let bolsa = presupuesto
    const abiertas: number[] = []
    for (let i = 0; i < deudas.length; i++) if (viva(i)) abiertas.push(i)
    const pagoDe = deudas.map(() => 0)
    const interesDe = deudas.map(() => 0)
    const extraDe = deudas.map(() => 0)
    let extraA: string | null = null
    for (let i = 0; i < deudas.length; i++) {
      if (!viva(i)) continue
      const del = saldos[i] * deudas[i].tasaMensual
      interes += del
      interesDe[i] = del
      interesAcumulado[i] += del
      saldos[i] += del
      bolsa -= deudas[i].cargoFijo
      pagoDe[i] += deudas[i].cargoFijo
    }
    for (let i = 0; i < deudas.length; i++) {
      if (!viva(i)) continue
      const p = Math.min(deudas[i].minimo, saldos[i])
      saldos[i] -= p
      bolsa -= p
      pagoDe[i] += p
    }
    for (const i of orden(deudas, saldos, estrategia)) {
      if (bolsa <= 0) break
      const p = Math.min(bolsa, saldos[i])
      saldos[i] -= p
      bolsa -= p
      pagoDe[i] += p
      extraDe[i] += p
      extraA ??= deudas[i].nombre
      if (mes === 1) abonosDelMes.push({ id: deudas[i].id, nombre: deudas[i].nombre, monto: Math.round(p) })
    }
    const cerradas: string[] = []
    for (let i = 0; i < deudas.length; i++) {
      if (!viva(i) && cierre[i] === null) {
        cierre[i] = mes
        cerradas.push(deudas[i].nombre)
      }
    }
    const siguen = orden(deudas, saldos, estrategia)
    mesAMes.push({
      numero: mes,
      extraA,
      pagado: abiertas.reduce((s, i) => s + pagoDe[i], 0),
      interes: abiertas.reduce((s, i) => s + interesDe[i], 0),
      debes: siguen.reduce((s, i) => s + saldos[i], 0),
      porDeuda: abiertas.map((i) => ({
        id: deudas[i].id,
        nombre: deudas[i].nombre,
        pago: pagoDe[i],
        interes: interesDe[i],
        saldo: viva(i) ? saldos[i] : 0,
        extra: extraDe[i],
      })),
      cerradas,
      extraPasaA: cerradas.length === 0 || siguen.length === 0 ? null : deudas[siguen[0]].nombre,
    })
  }

  // By month, and in the same month in list order.
  const indices = deudas
    .map((_, i) => i)
    .sort((a, b) => comparar3(cierre[a] ?? TOPE_DE_MESES + 1, cierre[b] ?? TOPE_DE_MESES + 1) || a - b)

  return {
    estrategia,
    meses: cierre.includes(null) ? null : mes,
    interesTotal: Math.round(interes),
    cierres: indices.map((i) => ({
      id: deudas[i].id,
      nombre: deudas[i].nombre,
      tasaMensual: deudas[i].tasaMensual,
      capitaliza: deudas[i].capitaliza,
      mes: cierre[i],
    })),
    abonosDelMes,
    mesAMes,
    interesPorDeuda: Object.fromEntries(deudas.map((d, i) => [d.id, interesAcumulado[i]])),
  }
}

/**
 * The one that finishes first; on a tie, the one with less interest; if
 * that ties too, avalancha. One that never finishes loses to any that does.
 */
export function recomendar(a: ResultadoDelPlan, b: ResultadoDelPlan): Estrategia {
  const ma = a.meses ?? TOPE_DE_MESES + 1
  const mb = b.meses ?? TOPE_DE_MESES + 1
  if (ma !== mb) return ma < mb ? a.estrategia : b.estrategia
  if (a.interesTotal !== b.interesTotal) return a.interesTotal < b.interesTotal ? a.estrategia : b.estrategia
  return 'avalancha'
}

/** Both strategies side by side and the recommended one. */
export function comparar(deudas: DeudaDelPlan[], sobrante: number): ComparacionDePlanes {
  const avalancha = simular(deudas, sobrante, 'avalancha')
  const bolaDeNieve = simular(deudas, sobrante, 'bola_de_nieve')
  return { avalancha, bolaDeNieve, recomendada: recomendar(avalancha, bolaDeNieve) }
}

/**
 * [saldo] with the interest of each full month between [desde] and [hasta]
 * (`YYYY-MM-DD`) added to it, rounded to the peso. A month counts when it
 * is completed: Oct 1 to Dec 1 is two; Oct 15 to Nov 14, none.
 */
export function saldoCapitalizado(saldo: number, tasaMensual: number, desde: string, hasta: string): number {
  const [ad, md, dd] = desde.slice(0, 10).split('-').map(Number)
  const [ah, mh, dh] = hasta.slice(0, 10).split('-').map(Number)
  let meses = (ah - ad) * 12 + mh - md
  if (dh < dd) meses--
  if (meses <= 0 || tasaMensual <= 0) return saldo
  return Math.round(saldo * Math.pow(1 + tasaMensual, meses))
}

/** A debt as the source reads it, with its balance already computed. */
export interface DeudaCruda {
  id: string
  nombre: string
  saldo: number
  tasaMensual: number
  /** `installment_amount`; null when the debt has no installment plan. */
  cuota: number | null
  /** Insurance and charges per month, summed. */
  cargos: number
  /** `start_date`, `YYYY-MM-DD`. */
  inicio: string | null
  nosDeben: boolean
}

/**
 * The household's debts as they enter the plan: what they owe us and the
 * settled ones stay out. With an installment the minimum is the
 * installment minus the charges (when they fit in it); with interest and
 * no installment it capitalizes since it started until [hoy]; else rate 0.
 */
export function deudasDelPlan(deudas: DeudaCruda[], hoy: string): DeudaDelPlan[] {
  const plan: DeudaDelPlan[] = []
  for (const d of deudas) {
    if (d.nosDeben || d.saldo <= 0) continue
    const base = { id: d.id, nombre: d.nombre, minimo: 0, cargoFijo: 0, capitaliza: false }
    if (d.cuota != null && d.cuota > 0) {
      const caben = d.cargos > 0 && d.cargos < d.cuota
      plan.push({
        ...base,
        saldo: d.saldo,
        tasaMensual: d.tasaMensual,
        minimo: caben ? d.cuota - d.cargos : d.cuota,
        cargoFijo: caben ? d.cargos : 0,
      })
    } else if (d.tasaMensual > 0) {
      const saldo = d.inicio == null ? d.saldo : saldoCapitalizado(d.saldo, d.tasaMensual, d.inicio, hoy)
      plan.push({ ...base, saldo, tasaMensual: d.tasaMensual, capitaliza: true })
    } else {
      plan.push({ ...base, saldo: d.saldo, tasaMensual: 0 })
    }
  }
  return plan
}

/** A credit card deferred purchase (`card_installment_plans`). */
export interface DiferidoCrudo {
  id: string
  descripcion: string
  total: number
  cuotas: number
  cobradas: number
  capitalMensual: number
  tasaMensual: number
  activo: boolean
}

/** French-system fixed installment, rounded to cents; at 0 % the capital split evenly. */
export function cuotaFija(capital: number, tasaMensual: number, cuotas: number): number {
  if (tasaMensual === 0) return Number((capital / cuotas).toFixed(2))
  const factor = 1 - Math.pow(1 + tasaMensual, -cuotas)
  return Number(((capital * tasaMensual) / factor).toFixed(2))
}

/**
 * The cards' deferred purchases as they enter the plan: only the ones with
 * installments left. The balance is the capital still owed; the minimum is
 * the fixed installment that closes it in the installments left.
 */
export function diferidosDelPlan(diferidos: DiferidoCrudo[]): DeudaDelPlan[] {
  const plan: DeudaDelPlan[] = []
  for (const p of diferidos) {
    const restantes = p.cuotas - p.cobradas
    if (!p.activo || restantes <= 0) continue
    // In cents, as the phone's Decimal: no float residue in the balance.
    const saldo = Math.round(p.total * 100 - p.capitalMensual * 100 * p.cobradas) / 100
    if (saldo <= 0) continue
    plan.push({
      id: p.id,
      nombre: p.descripcion,
      saldo,
      tasaMensual: p.tasaMensual,
      minimo: cuotaFija(saldo, p.tasaMensual, restantes),
      cargoFijo: 0,
      capitaliza: false,
    })
  }
  return plan
}

/**
 * What is left each month: (income − expenses) of the window averaged
 * over [meses], to the peso and never below zero.
 */
export function sobrante(ingresos: number, gastos: number, meses: number): number {
  if (meses <= 0) return 0
  return Math.max(0, Math.round((ingresos - gastos) / meses)) || 0
}

// ---------------------------------------------------------------------
// Texts, as the phone writes them.

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** «mar 2033»: month [n] of the plan, [mesUno] (`YYYY-MM`) being month 1. */
export function mesDelPlan(mesUno: string, n: number): string {
  const mes = moverMes(mesUno, n - 1)
  return `${MESES_CORTOS[Number(mes.slice(5)) - 1]} ${mes.slice(0, 4)}`
}

/** «$66,5 M» from a million; below it, the whole figure. */
export function millones(valor: number): string {
  if (Math.abs(valor) < 1_000_000) return dinero(valor)
  return `$${(valor / 1_000_000).toFixed(1).replace('.', ',')} M`
}

/** «23 % EA», or «3 % mes» when it capitalizes (agreed monthly). One decimal only when it adds. */
export function textoDeTasa(tasaMensual: number, capitaliza: boolean): string {
  const pct = (f: number) => {
    const t = (f * 100).toFixed(1)
    return (t.endsWith('.0') ? t.slice(0, -2) : t).replace('.', ',')
  }
  if (tasaMensual <= 0) return '0 %'
  if (capitaliza) return `${pct(tasaMensual)} % mes`
  return `${pct(Math.pow(1 + tasaMensual, 12) - 1)} % EA`
}

export interface FilaDeOrden {
  ids: string[]
  nombres: string[]
  tasa: string
  mes: number | null
}

/**
 * One row per debt in closing order. The 0 % debts that close at the end,
 * after every debt with interest, go together in one row with the month of
 * the last one: they are the informal ones.
 */
export function filasDeOrden(r: ResultadoDelPlan): FilaDeOrden[] {
  const cierres = r.cierres
  let corte = cierres.length
  while (corte > 0 && cierres[corte - 1].tasaMensual === 0 && cierres[corte - 1].mes !== null) corte--
  const filas: FilaDeOrden[] = cierres.slice(0, corte).map((c) => ({
    ids: [c.id],
    nombres: [c.nombre],
    tasa: textoDeTasa(c.tasaMensual, c.capitaliza),
    mes: c.mes,
  }))
  const cola = cierres.slice(corte)
  if (cola.length > 0) {
    filas.push({ ids: cola.map((c) => c.id), nombres: cola.map((c) => c.nombre), tasa: '0 %', mes: cola[cola.length - 1].mes })
  }
  return filas
}

/** The line under the strategy toggle: how much sooner and cheaper the recommended one is. */
export function lineaDeDiferencia(c: ComparacionDePlanes, deudas: number): string {
  if (deudas === 1) return 'Con una sola deuda, las dos dan lo mismo.'
  const r = resultadoDe(c, c.recomendada)
  const o = resultadoDe(c, c.recomendada === 'avalancha' ? 'bola_de_nieve' : 'avalancha')
  const nr = nombreDe(r.estrategia)
  if (r.meses === null) return 'Con este abono, ninguna alcanza a cerrar todas las deudas.'
  if (o.meses === null) return `${nombreDe(o.estrategia)} no alcanza a cerrar todas las deudas; ${nr.toLowerCase()} sí.`
  const meses = o.meses - r.meses
  const ahorro = o.interesTotal - r.interesTotal
  if (meses > 0) {
    const antes = meses === 1 ? '1 mes antes' : `${meses} meses antes`
    return ahorro > 0 ? `${nr}: ${antes} y ${millones(ahorro)} menos` : `${nr}: ${antes}`
  }
  if (ahorro > 0) return `${nr}: el mismo mes y ${millones(ahorro)} menos`
  return 'Las dos dan lo mismo con tus deudas de hoy.'
}

const enLista = (xs: string[]) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)

/** «Terraza queda en $0 · el extra pasa a Davivienda»; null when nothing closed. */
export function avisoDeCierre(mes: MesDelPlan): string | null {
  const cerradas = mes.cerradas
  if (cerradas.length === 0) return null
  const verbo = cerradas.length === 1 ? 'queda' : 'quedan'
  const cola = mes.extraPasaA ? ` · el extra pasa a ${mes.extraPasaA}` : Math.round(mes.debes) === 0 ? ' · ya no debes nada' : ''
  return `${enLista(cerradas)} ${verbo} en $0${cola}`
}

/**
 * «Este mes: $X extra a Y. Cuando Y llegue a $0 en mmm aaaa, ese dinero
 * pasa a Z.», from the month-1 extras and the plan's first close.
 */
export function textoDeEsteMes(r: ResultadoDelPlan, mesUno: string): string {
  const abonos = r.abonosDelMes
  if (abonos.length === 0) return 'Este mes paga tus cuotas; todavía no queda extra para abonar.'
  const partes = abonos.map((a, i) => (i === 0 ? `${dinero(a.monto)} extra a ${a.nombre}` : `${dinero(a.monto)} a ${a.nombre}`))
  let texto = `Este mes: ${enLista(partes)}.`
  const primero = r.mesAMes.find((m) => m.cerradas.length > 0)
  if (primero) {
    const llegue = primero.cerradas.length === 1 ? 'llegue' : 'lleguen'
    const cuando = `Cuando ${enLista(primero.cerradas)} ${llegue} a $0 en ${mesDelPlan(mesUno, primero.numero)}`
    const destino = abonos[0].nombre
    if (primero.extraPasaA && primero.extraPasaA === destino && !primero.cerradas.includes(destino)) {
      // It ended with its own cuota; the extra already goes to [destino], so the freed cuota joins it.
      const termine = primero.cerradas.length === 1 ? 'termine' : 'terminen'
      const su = primero.cerradas.length === 1 ? 'su cuota también se suma' : 'sus cuotas también se suman'
      texto += ` Cuando ${enLista(primero.cerradas)} ${termine} en ${mesDelPlan(mesUno, primero.numero)}, ${su} a ${destino}.`
    } else {
      texto += primero.extraPasaA ? ` ${cuando}, ese dinero pasa a ${primero.extraPasaA}.` : ` ${cuando}, ya no debes nada.`
    }
  }
  return texto
}
