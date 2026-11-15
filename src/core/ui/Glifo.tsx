import { glifoDe } from './glifos'

/**
 * A Material Symbols glyph by stored icon name. The ligature is drawn
 * from `data-glifo` by CSS (`.glifo::before`), so it never becomes part of
 * a button's text or accessible name.
 */
export function Glifo({ nombre, clase = 'glifo' }: { nombre: string | null | undefined; clase?: string }) {
  return <span className={clase} aria-hidden="true" data-glifo={glifoDe(nombre)} />
}
