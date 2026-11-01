/** How the app writes money and months; shared by the dashboard and the movements. */

const pesos = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

/** `$1.234.567`, without decimals, as the phone app shows pesos. */
export const dinero = (n: number) => `$${pesos.format(Math.round(n))}`

/** `1.234.567`, the amount as it is typed in a field. */
export const miles = (n: number) => pesos.format(Math.round(n))

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** `octubre` for `2026-10`. */
export const nombreDelMes = (mes: string) => MESES[Number(mes.slice(5)) - 1]

/** The color the phone app gives a rubro, from its palette key. */
export const colorDe = (clave: string | null) =>
  clave ? `var(--p-${clave}, var(--grafito))` : 'var(--grafito)'
