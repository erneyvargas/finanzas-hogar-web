import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProveedorDeSesion, type ClienteDeAuth } from '../auth/sesion'
import { Tablero } from './Tablero'
import type { FuenteDelTablero } from './fuente'

const auth: ClienteDeAuth = {
  getSession: async () => ({ data: { session: { user: { email: 'erney@example.com' } } } }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  signInWithPassword: async () => ({ error: null }),
  signInWithOAuth: async () => ({ error: null }),
  signOut: async () => ({ error: null }),
}

function fuente(): FuenteDelTablero {
  return {
    cargar: vi.fn(async () => ({
      hogarId: 'h1',
      datos: {
        categorias: [
          { id: 'karen', nombre: 'Karen', nivel: 'rubro', color: 'lavanda' },
          { id: 'hogar', nombre: 'Hogar', nivel: 'rubro', color: 'musgo' },
          { id: 'k-salud', nombre: 'Salud', nivel: 'categoria', color: null },
          { id: 'h-mercado', nombre: 'Mercado', nivel: 'categoria', color: null },
        ],
        partes: [],
        movimientos: [
          { id: '1', tipo: 'expense', monto: 23000, fecha: '2026-10-28T15:00:00Z', rubroId: 'karen', categoriaId: 'k-salud', anulado: false },
          { id: '2', tipo: 'expense', monto: 5000, fecha: '2026-10-24T15:00:00Z', rubroId: 'hogar', categoriaId: 'h-mercado', anulado: false },
          { id: '3', tipo: 'expense', monto: 20000, fecha: '2026-09-10T15:00:00Z', rubroId: 'hogar', categoriaId: 'h-mercado', anulado: false },
          { id: '4', tipo: 'income', monto: 100000, fecha: '2026-10-01T15:00:00Z', rubroId: null, categoriaId: null, anulado: false },
        ],
      },
    })),
  }
}

function montar(f: FuenteDelTablero) {
  return render(
    <ProveedorDeSesion cliente={auth}>
      <Tablero fuente={f} mesInicial="2026-10" />
    </ProveedorDeSesion>,
  )
}

describe('the month dashboard', () => {
  it('shows what was spent in the month against the month before', async () => {
    montar(fuente())

    const gastado = await screen.findByRole('region', { name: 'Gastado en octubre' })
    expect(within(gastado).getByText('$28.000')).toBeInTheDocument()
    expect(within(gastado).getByText(/40 %/)).toBeInTheDocument()
    expect(within(gastado).getByText(/septiembre/)).toBeInTheDocument()
  })

  it('splits the month by person and shows the income left', async () => {
    montar(fuente())

    const personas = await screen.findByRole('region', { name: 'Por persona' })
    expect(within(personas).getByText('Karen')).toBeInTheDocument()
    expect(within(personas).getByText('$23.000')).toBeInTheDocument()
    const ingresos = screen.getByRole('region', { name: 'Ingresos del mes' })
    expect(within(ingresos).getByText('$100.000')).toBeInTheDocument()
    expect(within(ingresos).getByText('$72.000')).toBeInTheDocument()
  })

  it('crosses categories with persons in a table', async () => {
    montar(fuente())

    const tabla = await screen.findByRole('table')
    const filas = within(tabla).getAllByRole('row')
    expect(filas[0]).toHaveTextContent('Karen')
    expect(filas[1]).toHaveTextContent('Salud')
    expect(filas[2]).toHaveTextContent('Mercado')
  })

  it('goes to the previous month with the arrow', async () => {
    const f = fuente()
    montar(f)
    await screen.findByRole('region', { name: 'Gastado en octubre' })

    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))

    expect(await screen.findByRole('region', { name: 'Gastado en septiembre' })).toBeInTheDocument()
    expect(f.cargar).toHaveBeenLastCalledWith('2026-09')
  })

  it('says so when the data cannot be loaded', async () => {
    montar({ cargar: vi.fn(async () => Promise.reject(new Error('Failed to fetch'))) })

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el mes')
  })
})
