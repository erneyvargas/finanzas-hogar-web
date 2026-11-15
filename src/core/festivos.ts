/**
 * Colombian public holidays (Ley 51 de 1983, "Ley Emiliani"), computed
 * with no network: six fixed dates, seven moved to the next Monday, and
 * five tied to Easter (three of them moved to Monday as well).
 */

const FIJOS: [number, number, string][] = [
  [1, 1, 'Año Nuevo'],
  [5, 1, 'Día del Trabajo'],
  [7, 20, 'Día de la Independencia'],
  [8, 7, 'Batalla de Boyacá'],
  [12, 8, 'Inmaculada Concepción'],
  [12, 25, 'Navidad'],
]

const AL_LUNES: [number, number, string][] = [
  [1, 6, 'Reyes Magos'],
  [3, 19, 'San José'],
  [6, 29, 'San Pedro y San Pablo'],
  [8, 15, 'Asunción de la Virgen'],
  [10, 12, 'Día de la Raza'],
  [11, 1, 'Todos los Santos'],
  [11, 11, 'Independencia de Cartagena'],
]

/** Days after Easter Sunday; the Monday ones are already counted to Monday. */
const DE_PASCUA: [number, string][] = [
  [-3, 'Jueves Santo'],
  [-2, 'Viernes Santo'],
  [43, 'Ascensión del Señor'],
  [64, 'Corpus Christi'],
  [71, 'Sagrado Corazón'],
]

/** Easter Sunday of [anio] (anonymous Gregorian algorithm), in UTC. */
function pascua(anio: number): Date {
  const a = anio % 19
  const b = Math.floor(anio / 100)
  const c = anio % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(anio, mes - 1, dia))
}

const clave = (f: Date) => f.toISOString().slice(0, 10)
const masDias = (f: Date, n: number) => new Date(f.getTime() + n * 86_400_000)
/** The same day when it is a Monday, else the Monday after it. */
const alLunes = (f: Date) => masDias(f, (8 - f.getUTCDay()) % 7)

const cache = new Map<number, Map<string, string>>()

/** `YYYY-MM-DD` → holiday name for [anio], in date order. */
export function festivosDe(anio: number): Map<string, string> {
  const guardado = cache.get(anio)
  if (guardado) return guardado
  const dias: [string, string][] = [
    ...FIJOS.map(([m, d, n]): [string, string] => [clave(new Date(Date.UTC(anio, m - 1, d))), n]),
    ...AL_LUNES.map(([m, d, n]): [string, string] => [clave(alLunes(new Date(Date.UTC(anio, m - 1, d)))), n]),
    ...DE_PASCUA.map(([n, nombre]): [string, string] => [clave(masDias(pascua(anio), n)), nombre]),
  ]
  dias.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const festivos = new Map<string, string>()
  // Two holidays can land on the same Monday; the day then carries both names.
  for (const [dia, nombre] of dias) {
    const previo = festivos.get(dia)
    festivos.set(dia, previo ? `${previo} y ${nombre}` : nombre)
  }
  cache.set(anio, festivos)
  return festivos
}

/** The holiday name of a `YYYY-MM-DD` day, or `undefined`. */
export const festivoDe = (dia: string) => festivosDe(Number(dia.slice(0, 4))).get(dia)
