/**
 * Merchant and note suggestions from the household's own history, with
 * the phone app's rules (`HistorialDeTextos` in
 * lib/core/finance/historial_de_textos.dart): a match starts any word,
 * case and accents are ignored, the most used come first, ties go to the
 * most recent, and what was used with the chosen category goes first.
 */

export interface TextoUsado {
  comercio: string | null
  nota: string | null
  categoriaId: string | null
  /** ISO timestamp. */
  fecha: string
}

interface Entrada {
  /** The most recent spelling, which is the one shown. */
  texto: string
  ultima: string
  usos: number
  porCategoria: Set<string>
}

export type Indice = Map<string, Entrada>

/** Lower case, without accents, trimmed, single spaces; `null` when empty. */
export function normalizarNombre(texto: string | null | undefined): string | null {
  if (!texto) return null
  const limpio = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
  return limpio || null
}

function indexar(usados: TextoUsado[], campo: (u: TextoUsado) => string | null): Indice {
  const indice: Indice = new Map()
  for (const u of usados) {
    const texto = campo(u)?.trim()
    const clave = normalizarNombre(texto)
    if (!texto || !clave) continue
    const e = indice.get(clave) ?? { texto, ultima: u.fecha, usos: 0, porCategoria: new Set<string>() }
    e.usos += 1
    if (u.fecha >= e.ultima) {
      e.ultima = u.fecha
      e.texto = texto
    }
    if (u.categoriaId) e.porCategoria.add(u.categoriaId)
    indice.set(clave, e)
  }
  return indice
}

export function historialDeTextos(usados: TextoUsado[]): { comercios: Indice; notas: Indice } {
  return { comercios: indexar(usados, (u) => u.comercio), notas: indexar(usados, (u) => u.nota) }
}

/** Up to [limite] texts that start a word with [escrito], best first. */
export function sugerir(indice: Indice, escrito: string, categoriaId?: string | null, limite = 5): string[] {
  const buscado = normalizarNombre(escrito)
  if (!buscado) return []
  return [...indice.entries()]
    .filter(([clave]) => clave !== buscado && (clave.startsWith(buscado) || clave.includes(` ${buscado}`)))
    .map(([, e]) => e)
    .sort((a, b) => {
      if (categoriaId) {
        const enA = a.porCategoria.has(categoriaId)
        const enB = b.porCategoria.has(categoriaId)
        if (enA !== enB) return enA ? -1 : 1
      }
      if (a.usos !== b.usos) return b.usos - a.usos
      return a.ultima < b.ultima ? 1 : a.ultima > b.ultima ? -1 : 0
    })
    .slice(0, limite)
    .map((e) => e.texto)
}
