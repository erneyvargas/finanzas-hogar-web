import { MESES } from '../core/formato'
import { diasDelMes, semanaDelDia, semanasDelMes } from '../core/ui/rejillaDelMes'
import { primeraFecha } from '../recurrentes/fechas'
import { moverMes } from '../tablero/calculo'

/**
 * What is coming due: the household's active expense rules and its
 * credit cards. Read-only; paying goes through the movements panel.
 * Dates are Bogotá days as `YYYY-MM-DD`.
 */

/** An active, live `recurring_rules` row (an income one is only listed to edit). */
export interface Regla {
  id: string
  nombre: string
  monto: number
  /** `daily`, `weekly`, `biweekly`, `monthly`, `yearly`, `weekdays`. */
  frecuencia: string
  diaDelMes: number | null
  proximaFecha: string
  avisoDias: number
  cuentaId: string
  categoriaId: string | null
  /** Palette key of its category (or the nearest parent with one). */
  color: string | null
  /** A `debt_payment` rule's debt: it is paid with a payment to that debt. */
  deudaId?: string | null
  /** That debt's loan account: «Pagar» transfers into it. */
  destinoId?: string | null
  /** `recurring_rules.kind`; absent means `expense`. */
  tipo?: 'expense' | 'income' | 'debt_payment'
  /** ISO weekdays (Monday = 1): several with `weekly`, one with `week_of_month`. */
  dias?: number[] | null
  /** `week_of_month`: 1..4, or −1 for the last. */
  semanaDelMes?: number | null
  /** `reminder_time`, `HH:mm[:ss]`. */
  horaAviso?: string | null
  /** `end_date`. */
  fin?: string | null
}

/** A debt a debt rule can pay. */
export interface DeudaDeRegla {
  id: string
  nombre: string
}

/**
 * The card's last billed statement (`card_statements`, not `open`): what
 * the bank asks to pay and when.
 */
export interface Extracto {
  corte: string
  vence: string
  /** `statement_balance`: the full payment. */
  saldo: number
  /** `minimum_payment`. */
  minimo: number
  /** Marked `paid` on the phone. */
  pagado: boolean
}

/** A credit card with a payment day; [deuda] is what is owed today. */
export interface Tarjeta {
  id: string
  nombre: string
  diaDePago: number
  deuda: number
  extracto: Extracto | null
}

export interface DatosDePorVencer {
  hogarId: string
  reglas: Regla[]
  tarjetas: Tarjeta[]
  /** Live accounts, for names; the principal one pays the cards. */
  cuentas: { id: string; nombre: string; principal: boolean }[]
  /** Today's balance of each account that pays something. */
  saldos: Record<string, number>
  /** Live expenses from 10 days before this Bogotá month to its end, by day. */
  gastos: { id?: string; categoriaId: string | null; dia: string }[]
  /** Live transfers and debt payments into a card, by day. */
  pagosATarjetas: { id?: string; haciaCuentaId: string; dia: string; monto: number }[]
  /** Live debt payments of the same window, by debt and day: they pay a debt rule. */
  abonos?: { id?: string; deudaId: string; dia: string }[]
  /** The household's debts, for a debt rule's panel. */
  deudas?: DeudaDeRegla[]
}

export interface Vencimiento {
  /** Unique per occurrence (a rule can be due this month and next). */
  clave: string
  /** The rule or card id. */
  id: string
  tipo: 'regla' | 'tarjeta'
  nombre: string
  monto: number
  /** `null` when the date is unknown. */
  fecha: string | null
  avisoDias: number
  cuentaId: string | null
  categoriaId: string | null
  color: string | null
  pagado: boolean
  /** What the amount is, for a card: `pago del extracto` or `pago mínimo`. */
  detalle: string | null
  /** A card with no statement due this month: only its debt is known, kept out of totals. */
  sinExtracto: boolean
  /** What a card without a statement owes. */
  deuda: number
  /**
   * Where «Pagar» transfers to: the loan of a debt rule or the card
   * itself; `null` for an expense rule, which is paid with an expense.
   */
  destinoId: string | null
  /** A card's statement total still owed (after payments since the cut); 0 otherwise. */
  total: number
  /** The movement that paid it (the nearest one; a card's last payment), when known. */
  pagoId: string | null
}

/** How many days around the due date an expense in the category pays it. */
export const DIAS_DE_HOLGURA = 10

const DIA_MS = 86_400_000
const comoUtc = (dia: string) => Date.parse(`${dia}T00:00:00Z`)
const aDia = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const conDia = (mes: string, dia: number) => `${mes}-${String(Math.min(dia, diasDelMes(mes))).padStart(2, '0')}`

/** Calendar days from [desde] to [hasta]; negative when [hasta] is before. */
export const diasEntre = (desde: string, hasta: string) => Math.round((comoUtc(hasta) - comoUtc(desde)) / DIA_MS)

/** The last day the 30-day view reaches. */
export const limite30 = (hoy: string) => aDia(comoUtc(hoy) + 30 * DIA_MS)

/**
 * When [r] is due in [mes]: its next due date when it falls there; else a
 * monthly rule's day of the month (clamped). A non-monthly rule whose date
 * already passed without being registered has an unknown date (`null`);
 * one due later is not in the month (`undefined`).
 */
export function fechaDeRegla(r: Regla, mes: string): string | null | undefined {
  if (r.proximaFecha.startsWith(mes)) return r.proximaFecha
  // «The first Monday»: that weekday of [mes], not a fixed day.
  if (r.frecuencia === 'monthly' && r.semanaDelMes != null && r.dias?.length) {
    return primeraFecha({ frecuencia: 'monthly', dia: null, dias: r.dias, semana: r.semanaDelMes }, `${mes}-01`)
  }
  if (r.frecuencia === 'monthly') return conDia(mes, r.diaDelMes ?? Number(r.proximaFecha.slice(8)))
  return r.proximaFecha < mes ? null : undefined
}

/**
 * This month's items (unknown dates included) and next month's ones due
 * within 30 days of [hoy]. Only this month's can be paid already.
 */
export function vencimientos(d: DatosDePorVencer, hoy: string): Vencimiento[] {
  const mes = hoy.slice(0, 7)
  const siguiente = moverMes(mes, 1)
  const tope = limite30(hoy)
  const principal = d.cuentas.find((c) => c.principal)?.id ?? null
  const fuera: Vencimiento[] = []
  // What paid it: the movement nearest to the due date within the slack.
  const elMasCercano = <T extends { dia: string }>(lista: T[], fecha: string | null): T | undefined =>
    lista
      .filter((x) => (fecha === null ? x.dia.startsWith(mes) : Math.abs(diasEntre(fecha, x.dia)) <= DIAS_DE_HOLGURA))
      .sort((a, b) => (fecha === null ? 0 : Math.abs(diasEntre(fecha, a.dia)) - Math.abs(diasEntre(fecha, b.dia))))[0]
  const pagoDeGasto = (categoriaId: string | null, fecha: string | null) =>
    categoriaId === null ? undefined : elMasCercano(d.gastos.filter((g) => g.categoriaId === categoriaId), fecha)
  const pagoDeAbono = (deudaId: string, fecha: string | null) =>
    elMasCercano((d.abonos ?? []).filter((a) => a.deudaId === deudaId), fecha)
  const base = { detalle: null, sinExtracto: false, deuda: 0, total: 0, pagoId: null }

  for (const m of [mes, siguiente]) {
    const esteMes = m === mes
    for (const r of d.reglas) {
      // An income rule is nothing to pay.
      if (r.tipo === 'income') continue
      const fecha = fechaDeRegla(r, m)
      if (fecha === undefined || (!esteMes && (fecha === null || fecha > tope))) continue
      const pago = esteMes ? (r.deudaId ? pagoDeAbono(r.deudaId, fecha) : pagoDeGasto(r.categoriaId, fecha)) : undefined
      fuera.push({
        ...base,
        clave: `regla:${r.id}:${m}`,
        id: r.id,
        tipo: 'regla',
        nombre: r.nombre,
        monto: r.monto,
        fecha,
        avisoDias: r.avisoDias,
        cuentaId: r.cuentaId,
        categoriaId: r.categoriaId,
        color: r.color,
        pagado: pago !== undefined,
        pagoId: pago?.id ?? null,
        destinoId: r.deudaId ? (r.destinoId ?? null) : null,
      })
    }
    for (const t of d.tarjetas) {
      const tarjeta = {
        ...base,
        clave: `tarjeta:${t.id}:${m}`,
        id: t.id,
        tipo: 'tarjeta' as const,
        nombre: t.nombre,
        avisoDias: 1,
        cuentaId: principal,
        categoriaId: null,
        color: null,
        destinoId: t.id,
      }
      const e = t.extracto
      if (e && e.vence.startsWith(m) && (esteMes || e.vence <= tope)) {
        // As the phone's abonadoAlExtracto: payments after the cut count for this statement.
        const pagos = d.pagosATarjetas.filter((p) => p.haciaCuentaId === t.id && p.dia > e.corte)
        const abonado = pagos.reduce((a, p) => a + p.monto, 0)
        const ultimo = [...pagos].sort((a, b) => (a.dia < b.dia ? 1 : -1))[0]
        // The minimum is what is due; the statement total is shown beside it.
        const conMinimo = e.minimo > 0
        const monto = Math.max(0, (conMinimo ? e.minimo : e.saldo) - abonado)
        fuera.push({
          ...tarjeta,
          monto,
          total: Math.max(0, e.saldo - abonado),
          fecha: e.vence,
          detalle: conMinimo ? 'pago mínimo' : 'pago del extracto',
          pagado: e.pagado || monto <= 0,
          pagoId: ultimo?.id ?? null,
        })
      } else if (esteMes) {
        fuera.push({
          ...tarjeta,
          monto: 0,
          fecha: conDia(m, t.diaDePago),
          sinExtracto: true,
          deuda: Math.max(0, t.deuda),
          pagado: t.deuda <= 0,
        })
      }
    }
  }
  return fuera
}

const sumar = (vs: Vencimiento[]) => vs.reduce((a, x) => a + x.monto, 0)

/** Unpaid, with an amount that counts (a card without a statement does not). */
const cuenta = (x: Vencimiento) => !x.pagado && !x.sinExtracto

/** The month's unpaid items, overdue ones included. */
export const pendientesDelMes = (vs: Vencimiento[], mes: string) => vs.filter((x) => cuenta(x) && x.fecha?.startsWith(mes))

/** Unpaid items with a date up to 30 days from [hoy] (the badge count). */
export const porPagarEn30Dias = (vs: Vencimiento[], hoy: string) => {
  const tope = limite30(hoy)
  return vs.filter((x) => cuenta(x) && x.fecha !== null && x.fecha <= tope)
}

/**
 * What each paying account would keep after its own unpaid dated items in
 * [vs], in the order the accounts first appear.
 */
export function quedanPorCuenta(vs: Vencimiento[], saldos: Record<string, number>): { cuentaId: string; queda: number }[] {
  const porCuenta = new Map<string, number>()
  for (const x of vs) {
    if (!cuenta(x) || x.fecha === null || x.cuentaId === null || !(x.cuentaId in saldos)) continue
    porCuenta.set(x.cuentaId, (porCuenta.get(x.cuentaId) ?? 0) + x.monto)
  }
  return [...porCuenta].map(([cuentaId, suma]) => ({ cuentaId, queda: saldos[cuentaId] - suma }))
}

export const totalDelMes = (vs: Vencimiento[], mes: string) => sumar(pendientesDelMes(vs, mes))
export const totalEn30Dias = (vs: Vencimiento[], hoy: string) => sumar(porPagarEn30Dias(vs, hoy))

/** What is left to pay in each Monday-first week of [mes], and the heaviest (-1: none). */
export function semanaMasCargada(vs: Vencimiento[], mes: string): { totales: number[]; mayor: number } {
  const totales = new Array<number>(semanasDelMes(mes)).fill(0)
  for (const x of pendientesDelMes(vs, mes)) totales[semanaDelDia(mes, Number(x.fecha!.slice(8)))] += x.monto
  const max = Math.max(...totales)
  return { totales, mayor: max > 0 ? totales.indexOf(max) : -1 }
}

/** A circle's diameter: the square root of the amount against the biggest, 10–36 px. */
export function tamanoDeCirculo(monto: number, maximo: number, minimo = 10, tope = 36): number {
  if (maximo <= 0 || monto <= 0) return minimo
  return Math.round(minimo + Math.sqrt(Math.min(1, monto / maximo)) * (tope - minimo))
}

/** Unpaid and due within its reminder days (overdue included). */
export const esUrgente = (x: Vencimiento, hoy: string) =>
  !x.pagado && x.fecha !== null && diasEntre(hoy, x.fecha) <= x.avisoDias

/** `17 nov`. */
export const diaCorto = (dia: string) => `${Number(dia.slice(8))} ${MESES[Number(dia.slice(5, 7)) - 1].slice(0, 3)}`

/** `17 nov · faltan 2 días`, or how late it is. */
export function textoDeDias(x: Vencimiento, hoy: string): string {
  if (x.fecha === null) return 'fecha por confirmar'
  const n = diasEntre(hoy, x.fecha)
  const cuando =
    n === 0 ? 'vence hoy' : n === 1 ? 'falta 1 día' : n > 1 ? `faltan ${n} días` : n === -1 ? 'venció ayer' : `venció hace ${-n} días`
  return `${diaCorto(x.fecha)} · ${cuando}`
}
