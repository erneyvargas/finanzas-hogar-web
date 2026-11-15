// Ported from Vencimientos (Moxen, moxen.cl/recursos/vencimientos), used under the Moxen resource licence.

/** A month `YYYY-MM` laid out as a Monday-first grid of weeks. */

const partes = (mes: string) => mes.split('-').map(Number) as [number, number]

/** Empty cells before day 1 in a Monday-first grid of `YYYY-MM`. */
export function huecoInicial(mes: string): number {
  const [a, m] = partes(mes)
  return (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7
}

export function diasDelMes(mes: string): number {
  const [a, m] = partes(mes)
  return new Date(Date.UTC(a, m, 0)).getUTCDate()
}

/** Rows of the Monday-first grid of `YYYY-MM` (4 to 6). */
export function semanasDelMes(mes: string): number {
  return Math.ceil((huecoInicial(mes) + diasDelMes(mes)) / 7)
}

/** The row (0-based) of [dia] in the Monday-first grid of `YYYY-MM`. */
export function semanaDelDia(mes: string, dia: number): number {
  return Math.floor((huecoInicial(mes) + dia - 1) / 7)
}
