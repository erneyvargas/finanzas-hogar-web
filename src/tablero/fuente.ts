import type { SupabaseClient } from '@supabase/supabase-js'
import { cargarTablero, hogarDelUsuario, type DatosDelTablero } from './datos'

/** Where the dashboard gets its data; tests pass a fake. */
export interface FuenteDelTablero {
  cargar(mes: string): Promise<{ hogarId: string; datos: DatosDelTablero }>
}

/**
 * The user's household, asked once and shared by every source. A
 * failed lookup is forgotten so the next load asks again.
 */
export function hogarEnCache(sb: SupabaseClient): () => Promise<string> {
  let hogar: Promise<string> | null = null
  return () => {
    hogar ??= hogarDelUsuario(sb).catch((e: unknown) => {
      hogar = null
      throw e
    })
    return hogar
  }
}

export function fuenteDeSupabase(
  sb: SupabaseClient,
  hogar: () => Promise<string> = hogarEnCache(sb),
): FuenteDelTablero {
  return {
    async cargar(mes) {
      const hogarId = await hogar()
      return { hogarId, datos: await cargarTablero(sb, hogarId, mes) }
    },
  }
}
