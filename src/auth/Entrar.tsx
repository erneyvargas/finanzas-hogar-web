import { useState, type FormEvent } from 'react'
import { useSesion } from './sesion'

/** Sign in with the same email and password as the phone app. */
export function Entrar() {
  const { entrar } = useSesion()
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setEntrando(true)
    setError(null)
    const fallo = await entrar(correo, clave)
    setEntrando(false)
    if (fallo) setError(fallo)
  }

  return (
    <main className="entrar">
      <form className="tarjeta-entrar" onSubmit={enviar}>
        <h1>Finanzas del hogar</h1>
        <p className="apagado">Entra con la misma cuenta de la app del teléfono.</p>

        <label htmlFor="correo">Correo</label>
        <input
          id="correo"
          type="email"
          autoComplete="email"
          required
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
        />

        <label htmlFor="clave">Contraseña</label>
        <input
          id="clave"
          type="password"
          autoComplete="current-password"
          required
          value={clave}
          onChange={(e) => setClave(e.target.value)}
        />

        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}

        <button type="submit" disabled={entrando}>
          {entrando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
