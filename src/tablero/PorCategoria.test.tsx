import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProveedorDeSesion, type ClienteDeAuth } from '../auth/sesion'
import type { FuenteDeMovimientos } from '../movimientos/fuente'
import type { DatosDeMovimientos } from '../movimientos/reglas'
import type { FuenteDelTablero } from './fuente'
import { Tablero } from './Tablero'

const auth: ClienteDeAuth = {
  getSession: async () => ({ data: { session: { user: { email: 'e@example.com' } } } }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  signInWithPassword: async () => ({ error: null }),
  signInWithOAuth: async () => ({ error: null }),
  signOut: async () => ({ error: null }),
}

// The dashboard groups by level-2 category; the movements carry the subcategory.
const categorias = [
  { id: 'hogar', nombre: 'Hogar', nivel: 'rubro', color: 'musgo' },
  { id: 'mercado', nombre: 'Mercado', nivel: 'category', color: null },
  { id: 'transporte', nombre: 'Transporte', nivel: 'category', color: null },
]
const exp = (id: string, monto: number, fecha: string, categoriaId: string) => ({
  id, tipo: 'expense', monto, fecha, rubroId: 'hogar', categoriaId, anulado: false,
})
const tablero = (): FuenteDelTablero => ({
  cargar: vi.fn(async () => ({
    hogarId: 'h1',
    datos: {
      movimientos: [
        exp('m1', 30000, '2026-10-03T15:00:00Z', 'mercado'),
        exp('m2', 10000, '2026-10-05T15:00:00Z', 'transporte'),
        exp('m3', 20000, '2026-09-03T15:00:00Z', 'mercado'),
      ],
      partes: [],
      categorias,
    },
  })),
})

const datos: DatosDeMovimientos = {
  hogarId: 'h1',
  cuentas: [{ id: 'efe', nombre: 'Efectivo', tipo: 'cash', viva: true }],
  categorias: [
    { id: 'hogar', nombre: 'Hogar', tipo: 'expense', nivel: 'rubro', padreId: null, color: 'musgo', viva: true },
    { id: 'mercado', nombre: 'Mercado', tipo: 'expense', nivel: 'category', padreId: 'hogar', color: null, viva: true },
    { id: 'frutas', nombre: 'Frutas', tipo: 'expense', nivel: 'subcategory', padreId: 'mercado', color: null, viva: true },
    { id: 'transporte', nombre: 'Transporte', tipo: 'expense', nivel: 'category', padreId: 'hogar', color: null, viva: true },
    { id: 'bus', nombre: 'Bus', tipo: 'expense', nivel: 'subcategory', padreId: 'transporte', color: null, viva: true },
    { id: 'taxi', nombre: 'Taxi', tipo: 'expense', nivel: 'subcategory', padreId: 'transporte', color: null, viva: true },
  ],
  movimientos: [
    { id: 'm1', tipo: 'expense', monto: 30000, fecha: '2026-10-03T15:00:00Z', cuentaId: 'efe', categoriaId: 'frutas', rubroId: 'hogar', comercio: 'Fruver', nota: null },
    { id: 'm2', tipo: 'expense', monto: 10000, fecha: '2026-10-05T15:00:00Z', cuentaId: 'efe', categoriaId: 'bus', rubroId: 'hogar', comercio: 'Buseta', nota: null },
  ],
}

function montar(ejecutar: FuenteDeMovimientos['ejecutar'] = vi.fn(async () => {})) {
  window.localStorage.setItem('pestana-del-tablero', 'resumen')
  const m: FuenteDeMovimientos = {
    cargar: vi.fn(async () => datos),
    saldo: vi.fn(async () => null),
    ejecutar: vi.fn(ejecutar),
  }
  render(
    <ProveedorDeSesion cliente={auth}>
      <Tablero fuente={tablero()} movimientos={m} mesInicial="2026-10" ahora={() => new Date('2026-10-28T20:30:00Z')} />
    </ProveedorDeSesion>,
  )
  return m
}
const tarjeta = () => screen.findByRole('region', { name: 'Por categoría' })

describe('the Por categoría card', () => {
  it('lists each category with its amount, share of the month and change against the month before', async () => {
    montar()
    const t = await tarjeta()

    const mercado = within(t).getByRole('button', { name: /^Mercado/ })
    expect(mercado).toHaveTextContent('$30.000')
    expect(mercado).toHaveTextContent('75 %')
    expect(mercado).toHaveTextContent('↑ 50 % vs septiembre')
    expect(within(t).getByRole('button', { name: /^Transporte/ })).toHaveTextContent('Sin gasto en septiembre')
    expect(within(t).getByRole('img', { name: 'Gasto por categoría de octubre' })).toBeInTheDocument()
    expect(within(t).getByText('Gastado en octubre')).toBeInTheDocument()
  })

  it('choosing a category shows its total and only its movements; tapping again clears it', async () => {
    montar()
    const t = await tarjeta()
    await within(t).findByText('Fruver')

    const transporte = within(t).getByRole('button', { name: /^Transporte/ })
    await userEvent.click(transporte)

    expect(transporte).toHaveAttribute('aria-pressed', 'true')
    expect(within(t).getAllByText('Transporte').length).toBeGreaterThan(1)
    expect(within(t).getByText('Buseta')).toBeInTheDocument()
    expect(within(t).queryByText('Fruver')).toBeNull()

    await userEvent.click(transporte)
    expect(transporte).toHaveAttribute('aria-pressed', 'false')
    expect(within(t).getByText('Fruver')).toBeInTheDocument()
  })

  it('Escape and the filter pill clear the chosen category', async () => {
    montar()
    const t = await tarjeta()
    await userEvent.click(within(t).getByRole('button', { name: /^Transporte/ }))

    await userEvent.click(within(t).getByRole('button', { name: 'Quitar filtro Transporte' }))
    expect(within(t).getByRole('button', { name: /^Transporte/ })).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(within(t).getByRole('button', { name: /^Transporte/ }))
    await userEvent.keyboard('{Escape}')
    expect(within(t).getByRole('button', { name: /^Transporte/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('number keys choose a category by its place', async () => {
    montar()
    const t = await tarjeta()
    await userEvent.keyboard('2')
    expect(within(t).getByRole('button', { name: /^Transporte/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Añadir gasto opens the panel searching the chosen category, and Deshacer deletes what was saved', async () => {
    const m = montar()
    const t = await tarjeta()
    await within(t).findByText('Fruver')
    await userEvent.click(within(t).getByRole('button', { name: /^Transporte/ }))

    await userEvent.click(within(t).getByRole('button', { name: 'Añadir gasto' }))
    const panel = screen.getByRole('dialog')
    const selector = within(panel).getByRole('region', { name: 'Todas las categorías' })
    expect(within(selector).getByRole('searchbox', { name: 'Buscar categoría' })).toHaveValue('Transporte')
    expect(within(selector).getByRole('button', { name: /^Bus.*Hogar › Transporte/ })).toBeInTheDocument()
    await userEvent.click(within(selector).getByRole('button', { name: /^Taxi.*Hogar › Transporte/ }))
    await userEvent.type(within(panel).getByLabelText('Valor'), '8000')
    await userEvent.click(within(panel).getByRole('button', { name: /^Guardar gasto/ }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const registro = vi.mocked(m.ejecutar).mock.calls.find(([f]) => f === 'registrar_movimiento')!
    expect(registro[1]).toMatchObject({ p_category_id: 'taxi', p_amount: 8000 })
    const aviso = await screen.findByRole('status', { name: 'Gasto añadido' })

    await userEvent.click(within(aviso).getByRole('button', { name: 'Deshacer' }))
    expect(m.ejecutar).toHaveBeenLastCalledWith('borrar_movimiento', { p_id: registro[1].p_id })
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Gasto añadido' })).toBeNull())
  })

  it('a category with a single subcategory comes already chosen', async () => {
    montar()
    const t = await tarjeta()
    await within(t).findByText('Fruver')
    await userEvent.click(within(t).getByRole('button', { name: /^Mercado/ }))
    await userEvent.click(within(t).getByRole('button', { name: 'Añadir gasto' }))

    const panel = screen.getByRole('dialog')
    expect(within(panel).getByRole('button', { name: 'Frutas, de Hogar' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(panel).getByText('Mercado › Frutas')).toBeInTheDocument()
    expect(within(panel).queryByRole('region', { name: 'Todas las categorías' })).toBeNull()
  })
})
