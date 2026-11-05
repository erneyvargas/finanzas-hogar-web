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

function movimientos(
  ejecutar: FuenteDeMovimientos['ejecutar'] = vi.fn(async () => {}),
  cargados: DatosDeMovimientos = datos,
): FuenteDeMovimientos {
  return {
    cargar: vi.fn(async () => cargados),
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
  const abrirLista = async () => {
    montar(movimientos())
    return screen.findByRole('region', { name: 'Movimientos de octubre' })
  }
  const filasDe = (lista: HTMLElement) => within(lista).getAllByRole('listitem')

  it('groups the movements by day, newest first, with each day subtotal', async () => {
    const lista = await abrirLista()

    const dias = await within(lista).findAllByRole('heading', { level: 3 })
    expect(dias.map((d) => d.textContent)).toEqual([
      'Martes 27 oct−$2.600',
      'Sábado 24 oct−$5.000',
      'Jueves 1 oct+$100.000',
    ])
  })

  it('shows merchant (or category), path without the person, person, account and signed amount', async () => {
    const lista = await abrirLista()

    const filas = filasDe(lista)
    expect(filas).toHaveLength(3)
    expect(filas[0]).toHaveTextContent('Aseo')
    expect(filas[0]).toHaveTextContent('Efectivo')
    expect(filas[1]).toHaveTextContent('Aguacate')
    expect(filas[1]).toHaveTextContent('Mercado › Frutas y verduras · Hogar · Master Card BBVA')
    expect(filas[1]).toHaveTextContent('−$5.000')
    expect(filas[2]).toHaveTextContent('+$100.000')
  })

  it('sums what it shows', async () => {
    const lista = await abrirLista()

    expect(within(lista).getByText('3 movimientos')).toBeInTheDocument()
    expect(within(lista).getByText('−$7.600')).toBeInTheDocument()
    expect(within(lista).getByText('+$100.000', { selector: '.resumen b' })).toBeInTheDocument()
  })

  it('filters by kind', async () => {
    const lista = await abrirLista()

    await userEvent.click(within(lista).getByRole('button', { name: 'Gastos' }))

    expect(within(lista).getByRole('button', { name: 'Gastos' })).toHaveAttribute('aria-pressed', 'true')
    expect(filasDe(lista)).toHaveLength(2)
    expect(within(lista).getByText('2 movimientos')).toBeInTheDocument()

    await userEvent.click(within(lista).getByRole('button', { name: 'Ingresos' }))
    expect(filasDe(lista)).toHaveLength(1)
  })

  it('searches merchant, category and account, without caring for accents or case', async () => {
    const lista = await abrirLista()
    const buscar = within(lista).getByRole('searchbox', { name: 'Buscar movimientos' })

    await userEvent.type(buscar, 'MASTER')
    expect(filasDe(lista)).toHaveLength(1)
    expect(filasDe(lista)[0]).toHaveTextContent('Aguacate')

    await userEvent.clear(buscar)
    await userEvent.type(buscar, 'mercado')
    expect(filasDe(lista)).toHaveLength(2)

    await userEvent.clear(buscar)
    await userEvent.type(buscar, 'sueldó')
    expect(filasDe(lista)).toHaveLength(1)

    await userEvent.clear(buscar)
    await userEvent.type(buscar, 'zzz')
    expect(within(lista).queryAllByRole('listitem')).toHaveLength(0)
    expect(within(lista).getByText('Ningún movimiento coincide.')).toBeInTheDocument()
  })

  it('shows the note as the title and the merchant below, as the phone does', async () => {
    const m = movimientos()
    m.cargar = vi.fn(async (): Promise<DatosDeMovimientos> => ({
      ...datos,
      categorias: [
        ...datos.categorias,
        { id: 'alm', nombre: 'Almuerzos', tipo: 'expense', nivel: 'category', padreId: 'hogar', color: null, viva: true },
        { id: 'alm-g', nombre: 'General', tipo: 'expense', nivel: 'subcategory', padreId: 'alm', color: null, viva: true },
      ],
      movimientos: [
        { id: 'n1', tipo: 'expense', monto: 12580, fecha: '2026-10-20T15:00:00Z', cuentaId: 'efe', categoriaId: 'aseo', rubroId: 'hogar', comercio: 'Uber', nota: 'Charquito - Apartamento' },
        { id: 'n2', tipo: 'expense', monto: 23000, fecha: '2026-10-19T15:00:00Z', cuentaId: 'efe', categoriaId: 'alm-g', rubroId: 'hogar', comercio: null, nota: null },
      ],
    }))
    montar(m)

    const lista = await screen.findByRole('region', { name: 'Movimientos de octubre' })
    const [conNota, sinNada] = await within(lista).findAllByRole('listitem')
    expect(conNota.querySelector('.fila-titulo')).toHaveTextContent(/^Charquito - Apartamento$/)
    expect(conNota.querySelector('.fila-detalle')).toHaveTextContent(/^Uber · Mercado › Aseo · Hogar · Efectivo$/)
    // Without merchant or note the title is the category, never the «General» filler.
    expect(sinNada.querySelector('.fila-titulo')).toHaveTextContent(/^Almuerzos$/)
    expect(sinNada.querySelector('.fila-detalle')).toHaveTextContent(/^Hogar · Efectivo$/)
  })

  it('does not repeat the merchant or a repeated level in the path', async () => {
    const m = movimientos()
    m.cargar = vi.fn(async (): Promise<DatosDeMovimientos> => ({
      ...datos,
      categorias: [
        ...datos.categorias,
        { id: 'aj', nombre: 'Ajuste de saldo', tipo: 'income', nivel: 'rubro', padreId: null, color: null, viva: true },
        { id: 'aj-c', nombre: 'Corrección', tipo: 'income', nivel: 'category', padreId: 'aj', color: null, viva: true },
        { id: 'aj-s', nombre: 'Corrección', tipo: 'income', nivel: 'subcategory', padreId: 'aj-c', color: null, viva: true },
      ],
      movimientos: [
        { id: 'a1', tipo: 'income', monto: 59800, fecha: '2026-10-20T15:00:00Z', cuentaId: 'efe', categoriaId: 'aj-s', rubroId: 'aj', comercio: 'Corrección', nota: null },
      ],
    }))
    montar(m)

    const lista = await screen.findByRole('region', { name: 'Movimientos de octubre' })
    const [fila] = await within(lista).findAllByRole('listitem')
    expect(fila.querySelector('.fila-detalle')).toHaveTextContent(/^Ajuste de saldo · Efectivo$/)
  })

  it('shows the account photo when it has one, and its initials when not', async () => {
    const lista = await abrirLista()

    const filas = filasDe(lista)
    expect(filas[1].querySelector('img.cara')).toHaveAttribute('src', 'https://fotos.test/tc.png')
    expect(filas[0].querySelector('img.cara')).toBeNull()
    expect(filas[0].querySelector('.cara')).toHaveTextContent('E')
  })
})

describe('the filter panel', () => {
  // Two rubros, two categories under Hogar, and four days of October.
  const conRubros: DatosDeMovimientos = {
    ...datos,
    categorias: [
      ...datos.categorias,
      { id: 'servicios', nombre: 'Servicios', tipo: 'expense', nivel: 'category', padreId: 'hogar', color: null, viva: true },
      { id: 'luz', nombre: 'Luz', tipo: 'expense', nivel: 'subcategory', padreId: 'servicios', color: null, viva: true },
      { id: 'erney', nombre: 'Erney', tipo: 'expense', nivel: 'rubro', padreId: null, color: 'cielo', viva: true },
      { id: 'comida', nombre: 'Comida', tipo: 'expense', nivel: 'category', padreId: 'erney', color: null, viva: true },
      { id: 'almuerzo', nombre: 'Almuerzo', tipo: 'expense', nivel: 'subcategory', padreId: 'comida', color: null, viva: true },
    ],
    movimientos: [
      ...datos.movimientos,
      { id: 'm4', tipo: 'expense', monto: 142300, fecha: '2026-10-14T15:00:00Z', cuentaId: 'efe', categoriaId: 'luz', rubroId: 'hogar', comercio: 'Factura de luz', nota: null },
      { id: 'm5', tipo: 'expense', monto: 87400, fecha: '2026-10-17T18:00:00Z', cuentaId: 'tc', categoriaId: 'almuerzo', rubroId: 'erney', comercio: 'Frisby', nota: null },
    ],
  }
  const abrir = async () => {
    montar(movimientos(undefined, conRubros))
    return screen.findByRole('region', { name: 'Movimientos de octubre' })
  }
  const comercios = (lista: HTMLElement) =>
    within(lista)
      .getAllByRole('listitem')
      .map((f) => f.querySelector('.fila-titulo')?.textContent)

  it('lists each expense rubro with its categories and what each one spent', async () => {
    const lista = await abrir()

    const panel = within(lista).getByRole('group', { name: 'Rubros y categorías' })
    expect(within(panel).getByRole('checkbox', { name: 'Hogar' })).not.toBeChecked()
    expect(within(panel).getByText('$149.900')).toBeInTheDocument()
    expect(within(panel).getByRole('checkbox', { name: 'Servicios' })).toBeInTheDocument()
    expect(within(panel).getByRole('checkbox', { name: 'Erney' })).toBeInTheDocument()
    expect(within(panel).queryByRole('checkbox', { name: 'Ingresos' })).toBeNull()
  })

  it('a rubro shows only its movements; a category, only the ones under it', async () => {
    const lista = await abrir()

    await userEvent.click(within(lista).getByRole('checkbox', { name: 'Erney' }))
    expect(comercios(lista)).toEqual(['Frisby'])

    await userEvent.click(within(lista).getByRole('checkbox', { name: 'Erney' }))
    await userEvent.click(within(lista).getByRole('checkbox', { name: 'Servicios' }))
    expect(comercios(lista)).toEqual(['Factura de luz'])
    expect(within(lista).getByText('1 movimiento')).toBeInTheDocument()
  })

  it('unchecking one category of a checked rubro keeps the rest of the rubro', async () => {
    const lista = await abrir()

    await userEvent.click(within(lista).getByRole('checkbox', { name: 'Hogar' }))
    expect(within(lista).getByRole('checkbox', { name: 'Servicios' })).toBeChecked()
    await userEvent.click(within(lista).getByRole('checkbox', { name: 'Servicios' }))

    expect(comercios(lista)).toEqual(['Aseo', 'Aguacate'])
    expect(within(lista).getByRole('checkbox', { name: 'Hogar' })).toHaveAttribute('aria-checked', 'mixed')
  })

  it('two taps on the calendar choose the days between them', async () => {
    const lista = await abrir()

    await userEvent.click(within(lista).getByRole('button', { name: '24 de octubre' }))
    expect(comercios(lista)).toEqual(['Aguacate'])

    await userEvent.click(within(lista).getByRole('button', { name: '14 de octubre' }))
    expect(comercios(lista)).toEqual(['Aguacate', 'Frisby', 'Factura de luz'])
    expect(within(lista).getByRole('button', { name: '17 de octubre' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('says what is filtered and clears it all at once', async () => {
    const lista = await abrir()

    await userEvent.click(within(lista).getByRole('checkbox', { name: 'Hogar' }))
    await userEvent.click(within(lista).getByRole('button', { name: '14 de octubre' }))
    await userEvent.click(within(lista).getByRole('button', { name: '27 de octubre' }))
    expect(within(lista).getByText('Hogar · 14 al 27 oct')).toBeInTheDocument()

    await userEvent.click(within(lista).getByRole('button', { name: 'Quitar filtros' }))

    expect(within(lista).getAllByRole('listitem')).toHaveLength(5)
    expect(within(lista).queryByRole('button', { name: 'Quitar filtros' })).toBeNull()
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
    await userEvent.click(await within(lista).findByRole('button', { name: /Aguacate/ }))
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

  it('moves the focus into the panel and back to what opened it', async () => {
    montar(movimientos())
    const registrar = await screen.findByRole('button', { name: '+ Registrar' })
    await waitFor(() => expect(registrar).toBeEnabled())

    await userEvent.click(registrar)
    await screen.findByRole('dialog')
    expect(panel()).toContainElement(document.activeElement as HTMLElement)
    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(registrar).toHaveFocus())
  })
})
