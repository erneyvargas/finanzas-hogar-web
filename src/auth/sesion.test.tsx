import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import type { ClienteDeAuth } from './sesion'
import type { FuenteDelTablero } from '../tablero/fuente'

const sinDatos: FuenteDelTablero = {
  cargar: async () => ({ hogarId: 'h1', datos: { movimientos: [], partes: [], categorias: [] } }),
}

/** A fake of the slice of supabase-js auth the app uses. */
function clienteFalso(opciones: { conSesion?: boolean; error?: string } = {}) {
  let alCambiar: ((sesion: unknown) => void) | null = null
  const sesion = { user: { email: 'erney@example.com' } }
  const cliente: ClienteDeAuth = {
    getSession: vi.fn(async () => ({
      data: { session: opciones.conSesion ? sesion : null },
    })),
    onAuthStateChange: vi.fn((cb) => {
      alCambiar = (s) => cb('SIGNED_IN', s)
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    }),
    signInWithPassword: vi.fn(async () => {
      if (opciones.error) return { error: { message: opciones.error } }
      alCambiar?.(sesion)
      return { error: null }
    }),
    signInWithOAuth: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => {
      alCambiar?.(null)
      return { error: null }
    }),
  }
  return cliente
}

describe('signing in', () => {
  it('without a session shows the sign-in form, not the dashboard', async () => {
    render(<App cliente={clienteFalso()} fuente={sinDatos} />)

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.queryByText(/erney@example.com/)).not.toBeInTheDocument()
  })

  it('signs in with the same email and password as the phone app', async () => {
    const cliente = clienteFalso()
    render(<App cliente={cliente} fuente={sinDatos} />)

    await userEvent.type(await screen.findByLabelText('Correo'), 'erney@example.com')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreta')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(cliente.signInWithPassword).toHaveBeenCalledWith({
      email: 'erney@example.com',
      password: 'secreta',
    })
    expect(await screen.findByText(/erney@example.com/)).toBeInTheDocument()
  })

  it('says plainly when the email or password is wrong', async () => {
    render(<App cliente={clienteFalso({ error: 'Invalid login credentials' })} fuente={sinDatos} />)

    await userEvent.type(await screen.findByLabelText('Correo'), 'erney@example.com')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Correo o contraseña incorrectos.',
    )
  })

  it('an existing session goes straight in, and signing out comes back', async () => {
    const cliente = clienteFalso({ conSesion: true })
    render(<App cliente={cliente} fuente={sinDatos} />)

    expect(await screen.findByText(/erney@example.com/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Salir' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument(),
    )
    expect(cliente.signOut).toHaveBeenCalled()
  })

  it('signs in with Google and comes back to the web', async () => {
    const cliente = clienteFalso()
    render(<App cliente={cliente} fuente={sinDatos} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Entrar con Google' }))

    expect(cliente.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
    })
  })

  it('says so when Google sign-in cannot start', async () => {
    const cliente = clienteFalso()
    cliente.signInWithOAuth = vi.fn(async () => ({
      error: { message: 'Unsupported provider: provider is not enabled' },
    }))
    render(<App cliente={cliente} fuente={sinDatos} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Entrar con Google' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La entrada con Google no está activada todavía.',
    )
  })
})
