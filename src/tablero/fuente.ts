import type { SupabaseClient } from '@supabase/supabase-js'
import { cargarTablero, hogarDelUsuario, type DatosDelTablero } from './datos'

/** Where the dashboard gets its data; tests pass a fake. */
export interface FuenteDelTablero {
  cargar(mes: string): Promise<{ hogarId: string; datos: DatosDelTablero }>
}

export function fuenteDeSupabase(sb: SupabaseClient): FuenteDelTablero {
  let hogar: Promise<string> | null = null
  return {
    async cargar(mes) {
      hogar ??= hogarDelUsuario(sb)
      const hogarId = await hogar
      return { hogarId, datos: await cargarTablero(sb, hogarId, mes) }
    },
  }
}
