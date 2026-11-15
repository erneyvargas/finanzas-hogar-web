import { fraseDe, recurrenciaInicial, textoDeFrase, type Recurrencia } from '../core/ui/recurrencia'
import type { PatronGuardado } from './fechas'

/**
 * Between the editor's [Recurrencia] and a stored `recurring_rules` row
 * (migration 0051): several weekdays are `weekly` + `weekdays`, «el
 * primer lunes» is `monthly` + one weekday + `week_of_month`. Every two
 * weeks (`biweekly`) has no control in the editor.
 */

/** The stored fields the editor reads. */
export interface ReglaParaEditar {
  frecuencia: string
  diaDelMes: number | null
  /** ISO weekdays, Monday = 1. */
  dias: number[] | null
  /** 1..4, or −1 for the last. */
  semanaDelMes: number | null
  proximaFecha: string
  /** `HH:mm` or `HH:mm:ss`. */
  horaAviso: string | null
}

const isodow = (f: string) => ((new Date(`${f}T00:00:00Z`).getUTCDay() + 6) % 7) + 1

/** The editor's pattern of a stored rule; `null` for `biweekly`. */
export function recurrenciaDeRegla(r: ReglaParaEditar): Recurrencia | null {
  const base = recurrenciaInicial()
  if (r.horaAviso) {
    const [hh, mm] = r.horaAviso.split(':').map(Number)
    base.h = hh % 12 || 12
    base.min = mm
    base.pm = hh >= 12
  }
  const diaDeLaFecha = Number(r.proximaFecha.slice(8, 10))
  switch (r.frecuencia) {
    case 'daily':
      return { ...base, freq: 'diaria', sinFin: false }
    case 'weekdays':
      return { ...base, freq: 'diaria', sinFin: true }
    case 'weekly': {
      const iso = r.dias && r.dias.length > 0 ? r.dias : [isodow(r.proximaFecha)]
      return { ...base, freq: 'semanal', dias: Array.from({ length: 7 }, (_, i) => iso.includes(i + 1)) }
    }
    case 'monthly':
      if (r.semanaDelMes != null && r.dias && r.dias.length > 0) {
        return { ...base, freq: 'mensual', modoMes: 'nth', ord: r.semanaDelMes === -1 ? 4 : r.semanaDelMes - 1, diaSem: r.dias[0] - 1 }
      }
      return { ...base, freq: 'mensual', modoMes: 'dia', diaMes: r.diaDelMes ?? diaDeLaFecha }
    case 'yearly':
      return { ...base, freq: 'anual', mes: Number(r.proximaFecha.slice(5, 7)) - 1, diaAnual: r.diaDelMes ?? diaDeLaFecha }
    default:
      return null
  }
}

/** What the server stores for the editor's pattern. */
export function patronDeRecurrencia(r: Recurrencia): PatronGuardado & { mes: number | null } {
  const nada = { dia: null, dias: null, semana: null, mes: null }
  switch (r.freq) {
    case 'diaria':
      return { ...nada, frecuencia: r.sinFin ? 'weekdays' : 'daily' }
    case 'semanal':
      return { ...nada, frecuencia: 'weekly', dias: r.dias.flatMap((v, i) => (v ? [i + 1] : [])) }
    case 'mensual':
      return r.modoMes === 'dia'
        ? { ...nada, frecuencia: 'monthly', dia: r.diaMes }
        : { ...nada, frecuencia: 'monthly', dias: [r.diaSem + 1], semana: r.ord < 4 ? r.ord + 1 : -1 }
    case 'anual':
      return { ...nada, frecuencia: 'yearly', dia: r.diaAnual, mes: r.mes + 1 }
  }
}

/** The reminder time as `HH:mm`. */
export function horaDeRecurrencia(r: Pick<Recurrencia, 'h' | 'min' | 'pm'>): string {
  const h = (r.h % 12) + (r.pm ? 12 : 0)
  return `${String(h).padStart(2, '0')}:${String(r.min).padStart(2, '0')}`
}

/** The rule in one plain sentence, for lists: «Se repite el día 18 de cada mes, a las 9:00 a. m.». */
export function fraseDeRegla(r: ReglaParaEditar): string {
  const rec = recurrenciaDeRegla(r)
  return (rec ? textoDeFrase(fraseDe(rec)) : 'Se repite cada dos semanas').replace(/\u00A0/g, ' ')
}
