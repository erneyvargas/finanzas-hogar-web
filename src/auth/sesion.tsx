import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/** The signed-in user, as much as the screens need. */
export interface Usuario {
  email: string | null
}

/**
 * The slice of supabase-js auth the app uses. Typed here, and not as the
 * whole `SupabaseClient`, so tests pass a small fake.
 */
export interface ClienteDeAuth {
  getSession(): Promise<{ data: { session: unknown } }>
  onAuthStateChange(cb: (evento: string, sesion: unknown) => void): {
    data: { subscription: { unsubscribe(): void } }
  }
  signInWithPassword(credenciales: {
    email: string
    password: string
  }): Promise<{ error: { message: string } | null }>
  signOut(): Promise<{ error: unknown }>
}

interface EstadoDeSesion {
  /** `undefined` while the stored session is still being read. */
  usuario: Usuario | null | undefined
  entrar(correo: string, clave: string): Promise<string | null>
  salir(): Promise<void>
}

const Contexto = createContext<EstadoDeSesion | null>(null)

function usuarioDe(sesion: unknown): Usuario | null {
  const s = sesion as { user?: { email?: string | null } } | null
  return s?.user ? { email: s.user.email ?? null } : null
}

/** What the user reads when signing in fails, in plain words. */
export function mensajeDeEntrada(error: string): string {
  if (/invalid login credentials/i.test(error)) return 'Correo o contraseña incorrectos.'
  if (/email not confirmed/i.test(error)) return 'Confirma tu correo antes de entrar.'
  if (/fetch|network/i.test(error)) return 'No hay conexión con el servidor. Revisa tu internet.'
  return 'No se pudo entrar. Intenta de nuevo.'
}

export function ProveedorDeSesion({
  cliente,
  children,
}: {
  cliente: ClienteDeAuth
  children: ReactNode
}) {
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined)

  useEffect(() => {
    let vivo = true
    cliente.getSession().then(({ data }) => {
      if (vivo) setUsuario(usuarioDe(data.session))
    })
    const { data } = cliente.onAuthStateChange((_, sesion) => setUsuario(usuarioDe(sesion)))
    return () => {
      vivo = false
      data.subscription.unsubscribe()
    }
  }, [cliente])

  const valor: EstadoDeSesion = {
    usuario,
    async entrar(correo, clave) {
      const { error } = await cliente.signInWithPassword({
        email: correo.trim(),
        password: clave,
      })
      return error ? mensajeDeEntrada(error.message) : null
    },
    async salir() {
      await cliente.signOut()
    },
  }

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSesion(): EstadoDeSesion {
  const s = useContext(Contexto)
  if (!s) throw new Error('useSesion needs ProveedorDeSesion above it')
  return s
}
