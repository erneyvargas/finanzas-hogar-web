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

// The card groups by rubro (the user's words: «este quiero que sea por rubro»);
// the movements carry the level-2 category.
const categorias = [
  { id: 'hogar', nombre: 'Hogar', nivel: 'rubro', color: 'musgo' },
  { id: 'erney', nombre: 'Erney', nivel: 'rubro', color: 'lavanda' },
  { id: 'mercado', nombre: 'Mercado', nivel: 'category', color: null },
  { id: 'transporte', nombre: 'Transporte', nivel: 'category', color: null },
  { id: 'almuerzo', nombre: 'Almuerzo', nivel: 'category', color: null },
]
const exp = (id: string, monto: number, fecha: string, categoriaId: string, rubroId = 'hogar') => ({
  id, tipo: 'expense', monto, fecha, rubroId, categoriaId, anulado: false,
})
const tablero = (): FuenteDelTablero => ({
  cargar: vi.fn(async () => ({
    hogarId: 'h1',
    datos: {
      movimientos: [
        exp('m1', 30000, '2026-10-03T15:00:00Z', 'mercado'),
        exp('m2', 10000, '2026-10-05T15:00:00Z', 'transporte'),
        exp('m4', 12000, '2026-10-06T17:00:00Z', 'almuerzo', 'erney'),
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
    { id: 'erney', nombre: 'Erney', tipo: 'expense', nivel: 'rubro', padreId: null, color: 'lavanda', viva: true },
    { id: 'almuerzo', nombre: 'Almuerzo', tipo: 'expense', nivel: 'category', padreId: 'erney', color: null, viva: true },
    { id: 'casino', nombre: 'Casino', tipo: 'expense', nivel: 'subcategory', padreId: 'almuerzo', color: null, viva: true },
  ],
  movimientos: [
    { id: 'm1', tipo: 'expense', monto: 30000, fecha: '2026-10-03T15:00:00Z', cuentaId: 'efe', categoriaId: 'frutas', rubroId: 'hogar', comercio: 'Fruver', nota: null },
    { id: 'm2', tipo: 'expense', monto: 10000, fecha: '2026-10-05T15:00:00Z', cuentaId: 'efe', categoriaId: 'bus', rubroId: 'hogar', comercio: 'Buseta', nota: null },
    { id: 'm4', tipo: 'expense', monto: 12000, fecha: '2026-10-06T17:00:00Z', cuentaId: 'efe', categoriaId: 'casino', rubroId: 'erney', comercio: 'Casino MCT', nota: null },
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
const tarjeta = () => screen.findByRole('region', { name: 'Por rubro' })

describe('the Por rubro card', () => {
  it('lists each rubro with its amount, share of the month and change against the month before', async () => {
    montar()
    const t = await tarjeta()

    const hogar = within(t).getByRole('button', { name: /^Hogar/ })
    expect(hogar).toHaveTextContent('$40.000')
    expect(hogar).toHaveTextContent('77 %')
    expect(hogar).toHaveTextContent('↑ 100 % vs septiembre')
    expect(within(t).getByRole('button', { name: /^Erney/ })).toHaveTextContent('Sin gasto en septiembre')
    expect(within(t).queryByRole('button', { name: /^Mercado/ })).toBeNull()
    expect(within(t).getByRole('img', { name: 'Gasto por rubro de octubre' })).toBeInTheDocument()
    expect(within(t).getByText('2 rubros')).toBeInTheDocument()
  })

  it('choosing a rubro shows its total and only its movements; tapping again clears it', async () => {
    montar()
    const t = await tarjeta()
    await within(t).findByText('Fruver')

    const erney = within(t).getByRole('button', { name: /^Erney/ })
    await userEvent.click(erney)

    expect(erney).toHaveAttribute('aria-pressed', 'true')
    expect(within(t).getByText('Casino MCT')).toBeInTheDocument()
    expect(within(t).queryByText('Fruver')).toBeNull()
    expect(within(t).queryByText('Buseta')).toBeNull()

    await userEvent.click(erney)
    expect(erney).toHaveAttribute('aria-pressed', 'false')
    expect(within(t).getByText('Fruver')).toBeInTheDocument()
  })

  it('Escape and the filter pill clear the chosen rubro', async () => {
    montar()
    const t = await tarjeta()
    await userEvent.click(within(t).getByRole('button', { name: /^Erney/ }))

    await userEvent.click(within(t).getByRole('button', { name: 'Quitar filtro Erney' }))
    expect(within(t).getByRole('button', { name: /^Erney/ })).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(within(t).getByRole('button', { name: /^Erney/ }))
    await userEvent.keyboard('{Escape}')
    expect(within(t).getByRole('button', { name: /^Erney/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('number keys choose a rubro by its place', async () => {
    montar()
    const t = await tarjeta()
    await userEvent.keyboard('2')
    expect(within(t).getByRole('button', { name: /^Erney/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Añadir gasto opens the panel searching the chosen rubro, and Deshacer deletes what was saved', async () => {
    const m = montar()
    const t = await tarjeta()
    await within(t).findByText('Fruver')
    await userEvent.click(within(t).getByRole('button', { name: /^Hogar/ }))

    await userEvent.click(within(t).getByRole('button', { name: 'Añadir gasto' }))
    const panel = screen.getByRole('dialog')
    const selector = within(panel).getByRole('region', { name: 'Todas las categorías' })
    expect(within(selector).getByRole('searchbox', { name: 'Buscar categoría' })).toHaveValue('Hogar')
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

  it('a rubro with a single subcategory comes already chosen', async () => {
    montar()
    const t = await tarjeta()
    await within(t).findByText('Fruver')
    await userEvent.click(within(t).getByRole('button', { name: /^Erney/ }))
    await userEvent.click(within(t).getByRole('button', { name: 'Añadir gasto' }))

    const panel = screen.getByRole('dialog')
    expect(within(panel).getByRole('button', { name: 'Casino, de Erney' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(panel).getByText('Almuerzo › Casino')).toBeInTheDocument()
    expect(within(panel).queryByRole('region', { name: 'Todas las categorías' })).toBeNull()
  })
})
