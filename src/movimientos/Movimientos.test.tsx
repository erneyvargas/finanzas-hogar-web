import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProveedorDeSesion, type ClienteDeAuth } from '../auth/sesion'
import { Tablero } from '../tablero/Tablero'
import type { FuenteDelTablero } from '../tablero/fuente'
import type { FuenteDeMovimientos } from './fuente'
import { ErrorDelServidor, MENSAJE_GENERICO, type DatosDeMovimientos } from './reglas'

const auth: ClienteDeAuth = {
  getSession: async () => ({ data: { session: { user: { email: 'erney@example.com' } } } }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  signInWithPassword: async () => ({ error: null }),
  signInWithOAuth: async () => ({ error: null }),
  signOut: async () => ({ error: null }),
}

const tablero = (): FuenteDelTablero => ({
  cargar: vi.fn(async () => ({ hogarId: 'h1', datos: { movimientos: [], partes: [], categorias: [] } })),
})

const datos: DatosDeMovimientos = {
  hogarId: 'h1',
  cuentas: [
    { id: 'efe', nombre: 'Efectivo', tipo: 'cash', viva: true },
    { id: 'nequi', nombre: 'Nequi', tipo: 'wallet', viva: true },
    { id: 'tc', nombre: 'Master Card BBVA', tipo: 'credit_card', viva: true, foto: 'https://fotos.test/tc.png' },
    { id: 'aho', nombre: 'Ahorros', tipo: 'savings', viva: true },
  ],
  categorias: [
    { id: 'hogar', nombre: 'Hogar', tipo: 'expense', nivel: 'rubro', padreId: null, color: 'musgo', viva: true },
    { id: 'mercado', nombre: 'Mercado', tipo: 'expense', nivel: 'category', padreId: 'hogar', color: null, viva: true },
    { id: 'frutas', nombre: 'Frutas y verduras', tipo: 'expense', nivel: 'subcategory', padreId: 'mercado', color: null, viva: true },
    { id: 'aseo', nombre: 'Aseo', tipo: 'expense', nivel: 'subcategory', padreId: 'mercado', color: null, viva: true },
    { id: 'ing', nombre: 'Ingresos', tipo: 'income', nivel: 'rubro', padreId: null, color: 'marino', viva: true },
    { id: 'sueldo', nombre: 'Sueldo', tipo: 'income', nivel: 'subcategory', padreId: 'ing', color: null, viva: true },
  ],
  movimientos: [
    { id: 'm1', tipo: 'expense', monto: 5000, fecha: '2026-10-24T20:00:00Z', cuentaId: 'tc', categoriaId: 'frutas', rubroId: 'hogar', comercio: 'Aguacate', nota: null },
    { id: 'm2', tipo: 'expense', monto: 2600, fecha: '2026-10-27T13:00:00Z', cuentaId: 'efe', categoriaId: 'aseo', rubroId: 'hogar', comercio: null, nota: null },
    { id: 'm3', tipo: 'income', monto: 100000, fecha: '2026-10-01T15:00:00Z', cuentaId: 'aho', categoriaId: 'sueldo', rubroId: 'ing', comercio: 'Empresa', nota: null },
  ],
}

function movimientos(ejecutar: FuenteDeMovimientos['ejecutar'] = vi.fn(async () => {})): FuenteDeMovimientos {
  return {
    cargar: vi.fn(async () => datos),
    saldo: vi.fn(async (id: string) => ({ efe: 80000, tc: -150000, nequi: 30000, aho: 900000 })[id] ?? null),
    ejecutar: vi.fn(ejecutar),
  }
}

// 20:30 UTC on Oct 28 is 15:30 in Bogotá.
const ahora = () => new Date('2026-10-28T20:30:00Z')

function montar(m: FuenteDeMovimientos, t: FuenteDelTablero = tablero()) {
  render(
    <ProveedorDeSesion cliente={auth}>
      <Tablero fuente={t} movimientos={m} mesInicial="2026-10" ahora={ahora} />
    </ProveedorDeSesion>,
  )
  return t
}

const panel = () => screen.getByRole('dialog')
const guardar = (p: HTMLElement) => within(p).getByRole('button', { name: /^Guardar (gasto|ingreso)/ })

async function registrarGasto() {
  await userEvent.click(await screen.findByRole('button', { name: '+ Registrar' }))
  const p = panel()
  await userEvent.type(within(p).getByLabelText('Valor'), '12.000')
  await userEvent.type(within(p).getByLabelText('Categoría'), 'fruta')
  await userEvent.click(within(p).getByRole('option', { name: 'Hogar › Mercado › Frutas y verduras' }))
  await userEvent.type(within(p).getByLabelText('Comercio'), 'Fruver')
  return p
}

describe('the movements of the month', () => {
  it('lists the month movements with merchant or category, path, account and signed amount', async () => {
    montar(movimientos())

    const lista = await screen.findByRole('region', { name: 'Movimientos de octubre' })
    const filas = await within(lista).findAllByRole('row')
    expect(filas).toHaveLength(4)
    expect(filas[1]).toHaveTextContent('27 oct')
    expect(filas[1]).toHaveTextContent('Aseo')
    expect(filas[1]).toHaveTextContent('Efectivo')
    expect(filas[2]).toHaveTextContent('Aguacate')
    expect(filas[2]).toHaveTextContent('Hogar › Mercado › Frutas y verduras')
    expect(filas[2]).toHaveTextContent('−$5.000')
    expect(filas[3]).toHaveTextContent('+$100.000')
  })

  it('shows the account photo when it has one, and its initials when not', async () => {
    montar(movimientos())

    const lista = await screen.findByRole('region', { name: 'Movimientos de octubre' })
    const filas = await within(lista).findAllByRole('row')
    expect(filas[2].querySelector('img.cara')).toHaveAttribute('src', 'https://fotos.test/tc.png')
    expect(filas[1].querySelector('img.cara')).toBeNull()
    expect(filas[1].querySelector('.cara')).toHaveTextContent('E')
  })
})

describe('registering a movement', () => {
  it('saves through registrar_movimiento with every field, then closes and reloads', async () => {
    const m = movimientos()
    const t = montar(m)
    const p = await registrarGasto()
    await userEvent.clear(within(p).getByLabelText('Fecha'))
    await userEvent.type(within(p).getByLabelText('Fecha'), '2026-10-25')
    await userEvent.type(within(p).getByLabelText('Observaciones'), 'Para la semana')

    await userEvent.click(guardar(p))

    expect(m.ejecutar).toHaveBeenCalledWith('registrar_movimiento', {
      p_household_id: 'h1',
      p_account_id: 'efe',
      p_kind: 'expense',
      p_amount: 12000,
      p_category_id: 'frutas',
      p_occurred_at: '2026-10-25T15:30:00-05:00',
      p_note: 'Para la semana',
      p_merchant_name: 'Fruver',
      p_guardar_igual: false,
      p_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(m.cargar).toHaveBeenCalledTimes(2))
    expect(t.cargar).toHaveBeenCalledTimes(2)
  })

  it('shows the amount large and grouped, and says what Guardar saves', async () => {
    montar(movimientos())
    await userEvent.click(await screen.findByRole('button', { name: '+ Registrar' }))
    const p = panel()
    expect(within(p).getByRole('button', { name: 'Guardar gasto' })).toBeInTheDocument()

    await userEvent.type(within(p).getByLabelText('Valor'), '14500')

    expect(within(p).getByLabelText('Valor')).toHaveValue('14.500')
    expect(within(p).getByRole('button', { name: 'Guardar gasto · $14.500' })).toBeInTheDocument()
    await userEvent.click(within(p).getByRole('button', { name: 'Ingreso' }))
    expect(within(p).getByRole('button', { name: 'Guardar ingreso · $14.500' })).toBeInTheDocument()
  })

  it('shows the chosen category as leaf and path, and Cambiar opens the search', async () => {
    montar(movimientos())
    const p = await registrarGasto()

    const elegida = within(p).getByRole('button', { name: /Frutas y verduras.*Hogar › Mercado.*Cambiar/ })
    expect(within(p).queryByLabelText('Categoría')).not.toBeInTheDocument()
    await userEvent.click(elegida)

    expect(within(p).getByLabelText('Categoría')).toHaveFocus()
  })

  it('offers the accounts that accept the kind, the most used first, with its balance', async () => {
    montar(movimientos())
    await userEvent.click(await screen.findByRole('button', { name: '+ Registrar' }))
    const p = panel()

    const sale = within(p).getByRole('group', { name: 'Sale de' })
    expect(sale).toHaveTextContent('Efectivo')
    expect(await within(sale).findByText('saldo $80.000')).toBeInTheDocument()
    expect(within(sale).getByRole('button', { name: 'Master Card BBVA' })).toBeInTheDocument()
    expect(within(sale).queryByRole('button', { name: 'Ahorros' })).not.toBeInTheDocument()
    await userEvent.click(within(sale).getByRole('button', { name: 'Otra…' }))
    const otras = within(sale).getByLabelText('Otra cuenta')
    expect(within(otras).queryByRole('option', { name: 'Ahorros' })).not.toBeInTheDocument()
    expect(within(otras).getByRole('option', { name: 'Nequi' })).toBeInTheDocument()

    await userEvent.click(within(p).getByRole('button', { name: 'Ingreso' }))
    const entra = within(p).getByRole('group', { name: 'Entra a' })
    expect(entra).toHaveTextContent('Ahorros')
    expect(within(entra).queryByRole('button', { name: 'Master Card BBVA' })).not.toBeInTheDocument()
  })

  it('shows a rule of the server inside the panel and keeps it open', async () => {
    const m = movimientos(async () => {
      throw new ErrorDelServidor('No te alcanza el saldo de Efectivo.', 'saldo_insuficiente')
    })
    montar(m)
    const p = await registrarGasto()

    await userEvent.click(guardar(p))

    expect(await within(p).findByRole('alert')).toHaveTextContent('No te alcanza el saldo de Efectivo.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(m.cargar).toHaveBeenCalledTimes(1)
  })

  it('a possible duplicate can be saved anyway', async () => {
    const m = movimientos(async (_f, params) => {
      if (!params.p_guardar_igual) {
        throw new ErrorDelServidor('Ya registraste «Fruver» ese día.', 'posible_duplicado', {
          movimientoId: 'm9', fecha: '2026-10-28T13:00:00Z', comercio: 'Fruver',
        })
      }
    })
    montar(m)
    const p = await registrarGasto()
    await userEvent.click(guardar(p))
    expect(await within(p).findByRole('alert')).toHaveTextContent('Ya registraste «Fruver» ese día.')

    await userEvent.click(within(p).getByRole('button', { name: 'Guardar igual' }))

    expect(m.ejecutar).toHaveBeenLastCalledWith(
      'registrar_movimiento',
      expect.objectContaining({ p_guardar_igual: true, p_merchant_name: 'Fruver', p_amount: 12000 }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('saving again after a failure', () => {
  it('retries with the same id, so a save that did land is not doubled', async () => {
    const ejecutar = vi
      .fn<FuenteDeMovimientos['ejecutar']>()
      .mockRejectedValueOnce(new ErrorDelServidor(MENSAJE_GENERICO, null))
      .mockResolvedValueOnce(undefined)
    const m = movimientos(ejecutar)
    montar(m)
    const p = await registrarGasto()

    await userEvent.click(guardar(p))
    expect(await within(p).findByRole('alert')).toHaveTextContent(MENSAJE_GENERICO)
    await userEvent.click(guardar(p))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const ids = vi.mocked(m.ejecutar).mock.calls.map(([, params]) => params.p_id)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(ids[1])
  })

  it('takes "already exists" on a retry as saved', async () => {
    const ejecutar = vi
      .fn<FuenteDeMovimientos['ejecutar']>()
      .mockRejectedValueOnce(new ErrorDelServidor(MENSAJE_GENERICO, null))
      .mockRejectedValueOnce(new ErrorDelServidor(MENSAJE_GENERICO, 'ya_existe'))
    const m = movimientos(ejecutar)
    montar(m)
    const p = await registrarGasto()

    await userEvent.click(guardar(p))
    await within(p).findByRole('alert')
    await userEvent.click(guardar(p))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(m.cargar).toHaveBeenCalledTimes(2))
  })
})

describe('closing the panel', () => {
  it('closes with Escape', async () => {
    montar(movimientos())
    await userEvent.click(await screen.findByRole('button', { name: '+ Registrar' }))
    expect(panel()).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not close with Escape while saving', async () => {
    let terminar: () => void = () => {}
    const m = movimientos(() => new Promise<void>((ok) => (terminar = ok)))
    montar(m)
    const p = await registrarGasto()
    await userEvent.click(guardar(p))

    await userEvent.keyboard('{Escape}')
    expect(panel()).toBeInTheDocument()

    terminar()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('correcting a movement', () => {
  async function abrirAguacate(m: FuenteDeMovimientos) {
    montar(m)
    const lista = await screen.findByRole('region', { name: 'Movimientos de octubre' })
    await userEvent.click(await within(lista).findByRole('row', { name: /Aguacate/ }))
    return panel()
  }

  it('opens the panel filled, titled Corregir movimiento', async () => {
    const p = await abrirAguacate(movimientos())

    expect(within(p).getByRole('heading', { name: 'Corregir movimiento' })).toBeInTheDocument()
    expect(within(p).getByLabelText('Valor')).toHaveValue('5.000')
    expect(within(p).getByRole('button', { name: /Frutas y verduras.*Hogar › Mercado/ })).toBeInTheDocument()
    expect(within(p).getByRole('group', { name: 'Sale de' })).toHaveTextContent('Master Card BBVA')
    expect(within(p).getByLabelText('Fecha')).toHaveValue('2026-10-24')
    expect(within(p).getByLabelText('Comercio')).toHaveValue('Aguacate')
  })

  it('saving calls only the functions of the fields that changed', async () => {
    const m = movimientos()
    const p = await abrirAguacate(m)
    const valor = within(p).getByLabelText('Valor')
    await userEvent.clear(valor)
    await userEvent.type(valor, '6000')
    await userEvent.type(within(p).getByLabelText('Observaciones'), 'Dos')

    await userEvent.click(within(p).getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(m.ejecutar).toHaveBeenCalledTimes(2)
    expect(m.ejecutar).toHaveBeenCalledWith('cambiar_monto', { p_id: 'm1', p_amount: 6000 })
    expect(m.ejecutar).toHaveBeenCalledWith('cambiar_nota', { p_id: 'm1', p_note: 'Dos' })
    await waitFor(() => expect(m.cargar).toHaveBeenCalledTimes(2))
  })

  it('Borrar asks inside the panel before calling borrar_movimiento', async () => {
    const m = movimientos()
    const p = await abrirAguacate(m)

    await userEvent.click(within(p).getByRole('button', { name: 'Borrar' }))
    expect(m.ejecutar).not.toHaveBeenCalled()
    expect(within(p).getByText('¿Borrar este movimiento?')).toBeInTheDocument()
    await userEvent.click(within(p).getByRole('button', { name: 'Sí, borrar' }))

    expect(m.ejecutar).toHaveBeenCalledWith('borrar_movimiento', { p_id: 'm1' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
