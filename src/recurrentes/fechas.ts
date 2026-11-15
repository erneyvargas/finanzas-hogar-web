/**
 * When a recurring rule falls: the exact twin of the server's
 * `proxima_fecha_de_regla` and `primera_fecha_de_regla` (migration 0051),
 * so the panel previews the dates the server will store. Dates are
 * `YYYY-MM-DD`; all arithmetic is on UTC days, never the local clock.
 */

/** `recurring_rules.frequency`. */
export type Frecuencia = 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'

/** A rule's pattern as stored: day of month, ISO weekdays (Monday = 1) and week of month (1..4, −1 last). */
export interface PatronGuardado {
  frecuencia: Frecuencia
  dia: number | null
  dias: number[] | null
  semana: number | null
  /** The month (1..12) of a yearly rule; only the first date needs it. */
  mes?: number | null
}

const DIA_MS = 86_400_000
const aMs = (f: string) => Date.parse(`${f}T00:00:00Z`)
const aFecha = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const mas = (f: string, dias: number) => aFecha(aMs(f) + dias * DIA_MS)
/** ISO weekday, Monday = 1 … Sunday = 7. */
const isodow = (f: string) => ((new Date(aMs(f)).getUTCDay() + 6) % 7) + 1
const anio = (f: string) => Number(f.slice(0, 4))
const mesDe = (f: string) => Number(f.slice(5, 7))
const diaDe = (f: string) => Number(f.slice(8, 10))
const fecha = (a: number, m: number, d: number) => aFecha(Date.UTC(a, m - 1, d))
const diasDelMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate()

/** `dia_recortado`: day [d] of a month, clipped to its last day. */
const recortado = (a: number, m: number, d: number) => fecha(a, m, Math.min(d, diasDelMes(a, m)))

/** `dia_de_semana_del_mes`: the [semana]th (1..4, −1 last) ISO weekday [dow] of a month. */
function diaDeSemanaDelMes(a: number, m: number, dow: number, semana: number): string {
  if (semana === -1) {
    const ultimo = fecha(a, m, diasDelMes(a, m))
    return mas(ultimo, -((isodow(ultimo) - dow + 7) % 7))
  }
  const primero = fecha(a, m, 1)
  return mas(primero, ((dow - isodow(primero) + 7) % 7) + (semana - 1) * 7)
}

/** The month [n] months after the one of [f], as year and month. */
function mesMas(f: string, n: number): [number, number] {
  const t = anio(f) * 12 + mesDe(f) - 1 + n
  return [Math.floor(t / 12), (t % 12) + 1]
}

/** The next date strictly after [desde]. */
export function proximaFecha(p: PatronGuardado, desde: string): string {
  switch (p.frecuencia) {
    case 'daily':
      return mas(desde, 1)
    case 'weekdays': {
      const w = isodow(desde)
      return mas(desde, w === 5 ? 3 : w === 6 ? 2 : 1)
    }
    case 'weekly':
      if (!p.dias || p.dias.length === 0) return mas(desde, 7)
      for (let i = 1; i <= 7; i++) if (p.dias.includes(isodow(mas(desde, i)))) return mas(desde, i)
      return mas(desde, 7)
    case 'biweekly':
      return mas(desde, 14)
    case 'monthly': {
      if (p.semana != null && p.dias && p.dias.length > 0) {
        for (let i = 0; i <= 2; i++) {
          const [a, m] = mesMas(desde, i)
          const cand = diaDeSemanaDelMes(a, m, p.dias[0], p.semana)
          if (cand > desde) return cand
        }
      }
      const [a, m] = mesMas(desde, 1)
      return recortado(a, m, p.dia ?? diaDe(desde))
    }
    case 'yearly':
      return recortado(anio(desde) + 1, mesDe(desde), p.dia ?? diaDe(desde))
  }
}

/** The first occurrence on or after [inicio]. */
export function primeraFecha(p: PatronGuardado, inicio: string): string {
  switch (p.frecuencia) {
    case 'weekdays':
      return isodow(inicio) <= 5 ? inicio : proximaFecha(p, inicio)
    case 'weekly':
      if (!p.dias || p.dias.length === 0 || p.dias.includes(isodow(inicio))) return inicio
      return proximaFecha(p, inicio)
    case 'monthly': {
      if (p.semana != null) return proximaFecha(p, mas(inicio, -1))
      const dia = p.dia ?? diaDe(inicio)
      const cand = recortado(anio(inicio), mesDe(inicio), dia)
      return cand >= inicio ? cand : proximaFecha({ ...p, dia }, cand)
    }
    case 'yearly': {
      const dia = p.dia ?? diaDe(inicio)
      const cand = recortado(anio(inicio), p.mes ?? mesDe(inicio), dia)
      return cand >= inicio ? cand : recortado(anio(cand) + 1, mesDe(cand), dia)
    }
    default:
      return inicio
  }
}

/** The first [n] dates from [inicio], none after [fin]. */
export function siguientesFechas(p: PatronGuardado, inicio: string, n: number, fin?: string | null): string[] {
  const fuera: string[] = []
  for (let f = primeraFecha(p, inicio); fuera.length < n && (!fin || f <= fin); f = proximaFecha(p, f)) fuera.push(f)
  return fuera
}
