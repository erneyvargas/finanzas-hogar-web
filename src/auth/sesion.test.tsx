import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import type { ClienteDeAuth } from './sesion'

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
    signOut: vi.fn(async () => {
      alCambiar?.(null)
      return { error: null }
    }),
  }
  return cliente
}

describe('signing in', () => {
  it('without a session shows the sign-in form, not the dashboard', async () => {
    render(<App cliente={clienteFalso()} />)

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.queryByText(/erney@example.com/)).not.toBeInTheDocument()
  })

  it('signs in with the same email and password as the phone app', async () => {
    const cliente = clienteFalso()
    render(<App cliente={cliente} />)

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
    render(<App cliente={clienteFalso({ error: 'Invalid login credentials' })} />)

    await userEvent.type(await screen.findByLabelText('Correo'), 'erney@example.com')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Correo o contraseña incorrectos.',
    )
  })

  it('an existing session goes straight in, and signing out comes back', async () => {
    const cliente = clienteFalso({ conSesion: true })
    render(<App cliente={cliente} />)

    expect(await screen.findByText(/erney@example.com/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Salir' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument(),
    )
    expect(cliente.signOut).toHaveBeenCalled()
  })
})
