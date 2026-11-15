import { MESES } from '../core/formato'
import { diasDelMes, semanaDelDia, semanasDelMes } from '../core/ui/rejillaDelMes'
import { moverMes } from '../tablero/calculo'

/**
 * What is coming due: the household's active expense rules and its
 * credit cards. Read-only; paying goes through the movements panel.
 * Dates are Bogotá days as `YYYY-MM-DD`.
 */

/** An active, live `recurring_rules` row of kind expense. */
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
}

/** A credit card with a payment day; [deuda] is what is owed today. */
export interface Tarjeta {
  id: string
  nombre: string
  diaDePago: number
  deuda: number
}

export interface DatosDePorVencer {
  hogarId: string
  reglas: Regla[]
  tarjetas: Tarjeta[]
  /** Live accounts, for names; the principal one pays the cards. */
  cuentas: { id: string; nombre: string; principal: boolean }[]
  /** Today's balance of the principal account, when there is one. */
  saldoPrincipal: number | null
  /** This Bogotá month's live expenses. */
  gastosDelMes: { categoriaId: string | null }[]
  /** This Bogotá month's live transfers into a card. */
  transferenciasDelMes: { haciaCuentaId: string }[]
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
}

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
  const categoriasPagadas = new Set(d.gastosDelMes.map((g) => g.categoriaId))
  const tarjetasPagadas = new Set(d.transferenciasDelMes.map((t) => t.haciaCuentaId))
  const fuera: Vencimiento[] = []

  for (const m of [mes, siguiente]) {
    const esteMes = m === mes
    for (const r of d.reglas) {
      const fecha = fechaDeRegla(r, m)
      if (fecha === undefined || (!esteMes && (fecha === null || fecha > tope))) continue
      fuera.push({
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
        pagado: esteMes && r.categoriaId !== null && categoriasPagadas.has(r.categoriaId),
      })
    }
    for (const t of d.tarjetas) {
      const fecha = conDia(m, t.diaDePago)
      if (!esteMes && fecha > tope) continue
      fuera.push({
        clave: `tarjeta:${t.id}:${m}`,
        id: t.id,
        tipo: 'tarjeta',
        nombre: t.nombre,
        monto: Math.max(0, t.deuda),
        fecha,
        avisoDias: 1,
        cuentaId: principal,
        categoriaId: null,
        color: null,
        pagado: esteMes && (t.deuda <= 0 || tarjetasPagadas.has(t.id)),
      })
    }
  }
  return fuera
}

const sumar = (vs: Vencimiento[]) => vs.reduce((a, x) => a + x.monto, 0)

/** The month's unpaid items, overdue ones included. */
export const pendientesDelMes = (vs: Vencimiento[], mes: string) =>
  vs.filter((x) => !x.pagado && x.fecha?.startsWith(mes))

/** Unpaid items with a date up to 30 days from [hoy] (the badge count). */
export const porPagarEn30Dias = (vs: Vencimiento[], hoy: string) => {
  const tope = limite30(hoy)
  return vs.filter((x) => !x.pagado && x.fecha !== null && x.fecha <= tope)
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
