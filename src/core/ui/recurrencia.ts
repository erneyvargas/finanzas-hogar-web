// Ported from Recurrencia (Moxen, moxen.cl/recursos/recurrencia), used under the Moxen resource licence.

/**
 * The pure half of the recurrence editor: what the controls hold, the
 * five-field cron expression and the plain-Spanish sentence. Domain-free:
 * the page maps its own rule to and from a [Recurrencia].
 */

export type FrecuenciaDeRecurrencia = 'diaria' | 'semanal' | 'mensual' | 'anual'

export interface Recurrencia {
  freq: FrecuenciaDeRecurrencia
  /** Monday … Sunday, for `semanal`. */
  dias: boolean[]
  /** `diaria` without Saturday and Sunday. */
  sinFin: boolean
  /** `mensual`: «el día N» or «el primer lunes». */
  modoMes: 'dia' | 'nth'
  diaMes: number
  /** 0..3 first to fourth, 4 the last. */
  ord: number
  /** 0 Monday … 6 Sunday. */
  diaSem: number
  /** `anual`: month 0..11 and its day. */
  mes: number
  diaAnual: number
  /** The hour on a 12-hour dial (1..12), its minutes and whether it is p. m. */
  h: number
  min: number
  pm: boolean
}

export const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const DIAS_PL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos']
export const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
export const ORDINALES = ['primer', 'segundo', 'tercer', 'cuarto', 'último']
export const ATAJOS = {
  habiles: [true, true, true, true, true, false, false],
  finde: [false, false, false, false, false, true, true],
  todos: [true, true, true, true, true, true, true],
}

/** Monday and Wednesday at 9:00 a. m., as the Moxen demo starts. */
export const recurrenciaInicial = (): Recurrencia => ({
  freq: 'semanal',
  dias: [true, false, true, false, false, false, false],
  sinFin: false,
  modoMes: 'dia',
  diaMes: 15,
  ord: 0,
  diaSem: 0,
  mes: 2,
  diaAnual: 15,
  h: 9,
  min: 0,
  pm: false,
})

const dos = (n: number) => String(n).padStart(2, '0')
const lista = (a: string[]) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} y ${a[a.length - 1]}`)

/** The hour 0..23. */
export const hora24 = (r: Pick<Recurrencia, 'h' | 'pm'>) => (r.h % 12) + (r.pm ? 12 : 0)
export const textoDeHora = (r: Pick<Recurrencia, 'h' | 'min'>) => `${r.h}:${dos(r.min)}`
export const textoAmPm = (pm: boolean) => (pm ? 'p. m.' : 'a. m.')

/** Minute, hour, day of month, month and weekday; `1#1` the first Monday, `1L` the last. */
export function cronDe(r: Recurrencia): string[] {
  let dom = '*'
  let mon = '*'
  let dow = '*'
  if (r.freq === 'diaria') dow = r.sinFin ? '1-5' : '*'
  else if (r.freq === 'semanal') {
    const n = r.dias
      .map((v, i) => (v ? (i + 1) % 7 : -1))
      .filter((v) => v >= 0)
      .sort((a, b) => a - b)
    if (n.length < 7) {
      const partes: string[] = []
      for (let i = 0; i < n.length; ) {
        let j = i
        while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++
        if (j - i >= 2) partes.push(`${n[i]}-${n[j]}`)
        else for (let k = i; k <= j; k++) partes.push(String(n[k]))
        i = j + 1
      }
      dow = partes.join(',')
    }
  } else if (r.freq === 'mensual') {
    if (r.modoMes === 'dia') dom = String(r.diaMes)
    else dow = `${(r.diaSem + 1) % 7}${r.ord < 4 ? `#${r.ord + 1}` : 'L'}`
  } else {
    dom = String(r.diaAnual)
    mon = String(r.mes + 1)
  }
  return [String(r.min), String(hora24(r)), dom, mon, dow]
}

/** The sentence as pieces `[text, highlighted]`. */
export type Frase = [string, boolean][]

export function fraseDe(r: Recurrencia): Frase {
  const seg: Frase = [['Se repite ', false]]
  const sel = r.dias.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)
  const clave = sel.join('')
  if (r.freq === 'diaria') seg.push([r.sinFin ? 'de lunes a viernes' : 'todos los días', true])
  else if (r.freq === 'semanal') {
    if (sel.length === 7) seg.push(['todos los días', true])
    else if (clave === '01234') seg.push(['de lunes a viernes', true])
    else if (clave === '56') seg.push(['los fines de semana', true])
    else if (sel.length === 1) seg.push([`cada ${DIAS[sel[0]]}`, true])
    else seg.push(['cada semana', true], [', ', false], [`los\u00A0${lista(sel.map((i) => DIAS_PL[i]))}`, true])
  } else if (r.freq === 'mensual') {
    seg.push([r.modoMes === 'dia' ? `el día ${r.diaMes}` : `el ${ORDINALES[r.ord]} ${DIAS[r.diaSem]}`, true])
    seg.push([' de ', false], ['cada mes', true])
    if (r.modoMes === 'dia' && r.diaMes > 28) seg.push([' (o el último día)', false])
  } else seg.push([`el ${r.diaAnual} de ${MESES_LARGOS[r.mes]}`, true], [' de ', false], ['cada año', true])
  // Hard spaces: «a las 9:00 a. m.» never breaks across lines.
  seg.push(
    [`,\u00A0a\u00A0${r.h === 1 ? 'la' : 'las'}\u00A0`, false],
    [`${textoDeHora(r)}\u00A0${textoAmPm(r.pm).replace(' ', '\u00A0')}`, true],
  )
  return seg
}

export const textoDeFrase = (f: Frase) => f.map(([t]) => t).join('')

const DIA_MS = 86_400_000

/** `hoy`, `mañana`, `en 10 días`, `en 4 meses`. */
export function relativo(dia: string, hoy: string): string {
  const d = Math.round((Date.parse(`${dia}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / DIA_MS)
  if (d === 0) return 'hoy'
  if (d === 1) return 'mañana'
  if (d < 0) return d === -1 ? 'ayer' : `hace ${-d} días`
  return d < 60 ? `en ${d} días` : `en ${Math.round(d / 30.4)} meses`
}
