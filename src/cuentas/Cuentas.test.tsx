import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProveedorDeSesion, type ClienteDeAuth } from '../auth/sesion'
import { Tablero } from '../tablero/Tablero'
import type { FuenteDelTablero } from '../tablero/fuente'
import type { FuenteDeMovimientos } from '../movimientos/fuente'
import { ErrorDelServidor } from '../movimientos/reglas'
import type { FuenteDeCuentas } from './fuente'
import type { CuentaConSaldo, DatosDeCuentas } from './reglas'

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

const movimientos = (): FuenteDeMovimientos => ({
  cargar: vi.fn(async () => ({ hogarId: 'h1', movimientos: [], cuentas: [], categorias: [] })),
  saldo: vi.fn(async () => null),
  ejecutar: vi.fn(async () => {}),
})

const cuenta = (c: Partial<CuentaConSaldo> & Pick<CuentaConSaldo, 'id' | 'nombre' | 'tipo' | 'saldo'>): CuentaConSaldo => ({
  archivada: false,
  principal: false,
  foto: null,
  rutaDeFoto: null,
  cupo: null,
  diaDeCorte: null,
  diaDePago: null,
  cobraGmf: false,
  categoriaGmf: null,
  estilo: null,
  ...c,
})

const datos: DatosDeCuentas = {
  hogarId: 'h1',
  cuentas: [
    cuenta({ id: 'efe', nombre: 'Efectivo', tipo: 'cash', saldo: 10_250, principal: true }),
    cuenta({ id: 'nequi', nombre: 'Nequi Karen', tipo: 'wallet', saldo: 47_890, cobraGmf: true, categoriaGmf: 'gmf' }),
    cuenta({ id: 'bono', nombre: 'Bono alimentación', tipo: 'voucher', saldo: 210_000 }),
    cuenta({ id: 'tc', nombre: 'Master Card BBVA', tipo: 'credit_card', saldo: -150_000, cupo: 2_000_000, diaDeCorte: 15, diaDePago: 5 }),
    cuenta({ id: 'visa', nombre: 'Visa Falabella', tipo: 'credit_card', saldo: -950_000, cupo: 1_000_000, diaDeCorte: 1, diaDePago: 20 }),
    cuenta({ id: 'lib', nombre: 'Libranza Davivienda', tipo: 'liability', saldo: -4_967_500 }),
    cuenta({ id: 'carro', nombre: 'Crédito carro', tipo: 'liability', saldo: 0 }),
    cuenta({ id: 'aho', nombre: 'Ahorros', tipo: 'savings', saldo: 900_000 }),
    cuenta({ id: 'vieja', nombre: 'Davivienda vieja', tipo: 'debit', saldo: 0, archivada: true }),
  ],
  deudas: [{ cuentaId: 'lib', cuotasPagadas: 13, cuotasTotales: 36 }],
  categoriasDeGasto: [{ id: 'gmf', ruta: 'Hogar › Impuestos › 4x1000' }],
}

function fuente(ejecutar: FuenteDeCuentas['ejecutar'] = async () => null): FuenteDeCuentas {
  return {
    cargar: vi.fn(async () => datos),
    movimientos: vi.fn(async () => [
      { id: 'm1', tipo: 'expense' as const, monto: 2_600, fecha: '2026-10-14T15:00:00Z', cuentaId: 'nequi', contracuentaId: null, comercio: 'Buseta', nota: null },
      { id: 'm2', tipo: 'transfer' as const, monto: 20_000, fecha: '2026-10-12T15:00:00Z', cuentaId: 'nequi', contracuentaId: 'efe', comercio: null, nota: null },
      { id: 'm3', tipo: 'transfer' as const, monto: 100_000, fecha: '2026-10-02T15:00:00Z', cuentaId: 'aho', contracuentaId: 'nequi', comercio: null, nota: null },
    ]),
    ejecutar: vi.fn(ejecutar),
    subirFoto: vi.fn(async () => 'h1/efe-1.png'),
    borrarFoto: vi.fn(async () => {}),
  }
}

const ahora = () => new Date('2026-10-28T20:30:00Z')

async function montar(f: FuenteDeCuentas = fuente(), pestana = 'cuentas') {
  window.localStorage.setItem('pestana-del-tablero', pestana)
  render(
    <ProveedorDeSesion cliente={auth}>
      <Tablero fuente={tablero()} movimientos={movimientos()} cuentas={f} mesInicial="2026-10" ahora={ahora} />
    </ProveedorDeSesion>,
  )
  if (pestana === 'cuentas') await screen.findByRole('table', { name: 'Cuentas' })
  else await screen.findByRole('tab', { name: 'Cuentas' })
  return f
}

const grupo = (nombre: string) => screen.getByRole('rowgroup', { name: nombre })
const fila = (nombre: string) => screen.getByRole('button', { name: nombre }).closest('tr')!
const nombresDe = (g: HTMLElement) =>
  within(g)
    .queryAllByRole('button')
    .map((b) => b.lastElementChild?.textContent)
const panel = () => screen.getByRole('dialog')

async function abrir(nombre: string) {
  await userEvent.click(screen.getByRole('button', { name: nombre }))
  return panel()
}

async function masAcciones(p: HTMLElement) {
  await userEvent.click(within(p).getByRole('button', { name: 'Más acciones' }))
}

describe('the accounts tab', () => {
  it('groups the accounts with their totals and the net worth equation', async () => {
    await montar()

    const resumen = screen.getByRole('region', { name: 'Patrimonio' })
    expect(within(resumen).getByText('$1.168.140')).toBeInTheDocument()
    expect(within(resumen).getByText('$6.067.500')).toBeInTheDocument()
    expect(within(resumen).getByText('−$4.899.360')).toBeInTheDocument()
    expect(within(grupo('Corrientes')).getByText('Tienes $268.140')).toBeInTheDocument()
    expect(within(grupo('Créditos')).getByText('Debes $6.067.500')).toBeInTheDocument()
    expect(within(grupo('Activos')).getAllByRole('row')[0]).toHaveTextContent('Activos$900.000')
    expect(nombresDe(grupo('Corrientes'))).toEqual(['Bono alimentación', 'Nequi Karen', 'Efectivo'])
    expect(within(fila('Efectivo')).getByText('Principal')).toBeInTheDocument()
    expect(within(fila('Master Card BBVA')).getByText('−$150.000')).toBeInTheDocument()
    expect(screen.getByText(/Saldos al 28 de octubre/)).toBeInTheDocument()
  })

  it('shows what is left on a card, in red when almost used up, and the loan installments', async () => {
    await montar()

    const mc = within(fila('Master Card BBVA')).getByText('Cupo $2.000.000 · Te quedan $1.850.000')
    expect(mc).not.toHaveClass('gasto')
    expect(within(fila('Master Card BBVA')).getByText(/Paga el día 5/)).toBeInTheDocument()
    expect(within(fila('Visa Falabella')).getByText('Cupo $1.000.000 · Te quedan $50.000')).toHaveClass('gasto')
    expect(within(fila('Libranza Davivienda')).getByText('Debes $4.967.500 · Cuota 14 de 36')).toBeInTheDocument()
  })

  it('keeps settled debts and archived accounts behind their buttons', async () => {
    await montar()

    expect(screen.queryByRole('button', { name: 'Crédito carro' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Davivienda vieja' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ver deudas saldadas (1)' }))
    expect(nombresDe(grupo('Deudas saldadas'))).toEqual(['Crédito carro'])
    await userEvent.click(screen.getByRole('button', { name: 'Ver archivadas (1)' }))
    expect(nombresDe(grupo('Archivadas'))).toEqual(['Davivienda vieja'])
  })

  it('orders each group by value, name or type', async () => {
    await montar()

    await userEvent.click(screen.getByRole('button', { name: 'Nombre' }))
    expect(nombresDe(grupo('Corrientes'))).toEqual(['Bono alimentación', 'Efectivo', 'Nequi Karen'])
    expect(nombresDe(grupo('Créditos'))).toEqual(['Libranza Davivienda', 'Master Card BBVA', 'Visa Falabella'])
    await userEvent.click(screen.getByRole('button', { name: 'Tipo' }))
    expect(nombresDe(grupo('Corrientes'))).toEqual(['Efectivo', 'Nequi Karen', 'Bono alimentación'])
    expect(screen.getByRole('button', { name: 'Tipo' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens an account with its balance and the month movements from either side', async () => {
    const f = await montar()

    const p = await abrir('Nequi Karen')
    expect(within(p).getByRole('heading', { name: 'Nequi Karen' })).toBeInTheDocument()
    expect(within(p).getByText('$47.890')).toBeInTheDocument()
    expect(f.movimientos).toHaveBeenCalledWith('nequi', '2026-10')
    const lista = await within(p).findByRole('list', { name: 'Movimientos de octubre' })
    const filas = within(lista).getAllByRole('listitem')
    expect(filas.map((li) => li.textContent)).toEqual([
      expect.stringMatching(/Buseta.*−\$2\.600/),
      expect.stringMatching(/Transferencia a Efectivo.*−\$20\.000/),
      expect.stringMatching(/Transferencia de Ahorros.*\+\$100\.000/),
    ])
    expect(within(p).getByRole('button', { name: 'Transferir' })).toBeInTheDocument()
    expect(within(p).getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    expect(within(p).getByRole('button', { name: 'Ajustar saldo' })).toBeInTheDocument()
  })
})

describe('creating an account', () => {
  it('validates the card fields and sends what was typed', async () => {
    const f = await montar()

    await userEvent.click(screen.getByRole('button', { name: 'Nueva cuenta' }))
    const p = panel()
    await userEvent.type(within(p).getByLabelText('Nombre'), 'Visa nueva')
    await userEvent.selectOptions(within(p).getByLabelText('Tipo'), 'Tarjeta de crédito')
    await userEvent.click(within(p).getByRole('button', { name: 'Crear cuenta' }))
    expect(within(p).getByRole('alert')).toHaveTextContent('Una tarjeta de crédito necesita día de corte y día de pago')
    await userEvent.type(within(p).getByLabelText('Día de corte'), '40')
    await userEvent.type(within(p).getByLabelText('Día de pago'), '5')
    await userEvent.click(within(p).getByRole('button', { name: 'Crear cuenta' }))
    expect(within(p).getByRole('alert')).toHaveTextContent('El día debe estar entre 1 y 31')
    expect(f.ejecutar).not.toHaveBeenCalled()

    await userEvent.clear(within(p).getByLabelText('Día de corte'))
    await userEvent.type(within(p).getByLabelText('Día de corte'), '15')
    await userEvent.type(within(p).getByLabelText('Cupo'), '3000000')
    await userEvent.type(within(p).getByLabelText('Deuda actual'), '200000')
    await userEvent.click(within(p).getByRole('button', { name: 'Crear cuenta' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(f.ejecutar).toHaveBeenCalledWith('crear_cuenta', {
      p_household_id: 'h1',
      p_name: 'Visa nueva',
      p_type: 'credit_card',
      p_opening_balance: 200_000,
      p_credit_limit: 3_000_000,
      p_cut_day: 15,
      p_due_day: 5,
      p_id: expect.any(String),
    })
    expect(f.cargar).toHaveBeenCalledTimes(2)
  })

  it('sends a plain account without card fields and shows a server rejection', async () => {
    const f = await montar(
      fuente(async () => {
        throw new ErrorDelServidor('Ya tienes una cuenta que se llama «Efectivo»', 'nombre_repetido')
      }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Nueva cuenta' }))
    const p = panel()
    expect(within(p).queryByLabelText('Cupo')).not.toBeInTheDocument()
    await userEvent.type(within(p).getByLabelText('Nombre'), 'Efectivo')
    await userEvent.click(within(p).getByRole('button', { name: 'Crear cuenta' }))

    expect(await within(p).findByRole('alert')).toHaveTextContent('Ya tienes una cuenta que se llama «Efectivo»')
    expect(f.ejecutar).toHaveBeenCalledWith('crear_cuenta', {
      p_household_id: 'h1',
      p_name: 'Efectivo',
      p_type: 'cash',
      p_opening_balance: 0,
      p_credit_limit: null,
      p_cut_day: null,
      p_due_day: null,
      p_id: expect.any(String),
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('asks for a name before calling the server', async () => {
    const f = await montar()
    await userEvent.click(screen.getByRole('button', { name: 'Nueva cuenta' }))
    await userEvent.click(within(panel()).getByRole('button', { name: 'Crear cuenta' }))
    expect(within(panel()).getByRole('alert')).toHaveTextContent('La cuenta necesita nombre')
    expect(f.ejecutar).not.toHaveBeenCalled()
  })
})

describe('editing an account', () => {
  it('renames and edits the card in one save', async () => {
    const f = await montar()

    const p = await abrir('Master Card BBVA')
    await userEvent.click(within(p).getByRole('button', { name: 'Editar' }))
    const nombre = within(p).getByLabelText('Nombre')
    await userEvent.clear(nombre)
    await userEvent.type(nombre, 'Mastercard BBVA')
    const cupo = within(p).getByLabelText('Cupo')
    await userEvent.clear(cupo)
    await userEvent.type(cupo, '2500000')
    await userEvent.click(within(p).getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(f.ejecutar).toHaveBeenCalledTimes(2))
    expect(f.ejecutar).toHaveBeenCalledWith('renombrar_cuenta', {
      p_household_id: 'h1',
      p_account_id: 'tc',
      p_name: 'Mastercard BBVA',
    })
    expect(f.ejecutar).toHaveBeenCalledWith('editar_tarjeta', {
      p_household_id: 'h1',
      p_account_id: 'tc',
      p_credit_limit: 2_500_000,
      p_cut_day: 15,
      p_due_day: 5,
    })
    expect(await within(panel()).findByRole('heading', { name: 'Master Card BBVA' })).toBeInTheDocument()
  })

  it('shows the server reason when an account cannot be archived', async () => {
    const f = await montar(
      fuente(async () => {
        throw new ErrorDelServidor('Para archivar «Ahorros» su saldo tiene que estar en cero; hoy es $900.000.', 'saldo_no_cero')
      }),
    )

    const p = await abrir('Ahorros')
    await masAcciones(p)
    await userEvent.click(within(p).getByRole('button', { name: 'Archivar' }))
    await userEvent.click(within(p).getByRole('button', { name: 'Sí, archivar' }))

    expect(await within(p).findByRole('alert')).toHaveTextContent('su saldo tiene que estar en cero')
    expect(f.ejecutar).toHaveBeenCalledWith('archivar_cuenta', { p_household_id: 'h1', p_account_id: 'aho' })
  })

  it('offers principal and 4x1000 only where they apply', async () => {
    const f = await montar()

    let p = await abrir('Efectivo')
    await masAcciones(p)
    expect(within(p).queryByRole('button', { name: 'Marcar como principal' })).not.toBeInTheDocument()
    expect(within(p).queryByRole('button', { name: '4x1000' })).not.toBeInTheDocument()
    expect(within(p).queryByRole('button', { name: 'Archivar' })).not.toBeInTheDocument()

    await userEvent.click(within(p).getByRole('button', { name: 'Cerrar' }))
    p = await abrir('Master Card BBVA')
    await masAcciones(p)
    expect(within(p).queryByRole('button', { name: 'Marcar como principal' })).not.toBeInTheDocument()
    expect(within(p).queryByRole('button', { name: '4x1000' })).not.toBeInTheDocument()
    expect(within(p).getByRole('button', { name: 'Estilo de tarjeta' })).toBeInTheDocument()
    expect(within(p).queryByRole('button', { name: 'Ajustar saldo' })).not.toBeInTheDocument()

    await userEvent.click(within(p).getByRole('button', { name: 'Cerrar' }))
    p = await abrir('Nequi Karen')
    await masAcciones(p)
    expect(within(p).getByRole('button', { name: '4x1000' })).toBeInTheDocument()
    await userEvent.click(within(p).getByRole('button', { name: 'Marcar como principal' }))
    expect(f.ejecutar).toHaveBeenCalledWith('marcar_cuenta_principal', { p_household_id: 'h1', p_account_id: 'nequi' })
  })

  it('turns the 4x1000 off', async () => {
    const f = await montar()
    const p = await abrir('Nequi Karen')
    await masAcciones(p)
    await userEvent.click(within(p).getByRole('button', { name: '4x1000' }))
    await userEvent.click(within(p).getByRole('button', { name: 'Dejar de cobrar 4x1000' }))
    expect(f.ejecutar).toHaveBeenCalledWith('cambiar_gmf_de_cuenta', {
      p_household_id: 'h1',
      p_account_id: 'nequi',
      p_cobra: false,
      p_category_id: null,
    })
  })

  it('adjusts the balance to what was counted', async () => {
    const f = await montar()

    const p = await abrir('Efectivo')
    await userEvent.click(within(p).getByRole('button', { name: 'Ajustar saldo' }))
    await userEvent.type(within(p).getByLabelText('Saldo real'), '12.000')
    await userEvent.click(within(p).getByRole('button', { name: 'Ajustar' }))

    await waitFor(() =>
      expect(f.ejecutar).toHaveBeenCalledWith('ajustar_saldo_de_cuenta', {
        p_household_id: 'h1',
        p_account_id: 'efe',
        p_saldo_real: 12_000,
        p_id: expect.any(String),
      }),
    )
  })

  it('uploads a photo to the phone path and stores it', async () => {
    const f = await montar()
    const p = await abrir('Efectivo')
    await masAcciones(p)
    await userEvent.click(within(p).getByRole('button', { name: 'Foto' }))
    const archivo = new File(['x'], 'cara.png', { type: 'image/png' })
    await userEvent.upload(within(p).getByLabelText('Elegir foto'), archivo)

    await waitFor(() =>
      expect(f.ejecutar).toHaveBeenCalledWith('cambiar_foto_de_cuenta', {
        p_household_id: 'h1',
        p_account_id: 'efe',
        p_image_path: 'h1/efe-1.png',
      }),
    )
    expect(f.subirFoto).toHaveBeenCalledWith('h1', 'efe', archivo)
  })
})

describe('transfers', () => {
  async function abrirTransferir() {
    await userEvent.click(screen.getByRole('button', { name: 'Transferir' }))
    return panel()
  }

  it('sends the transfer and previews both balances', async () => {
    const f = await montar()

    const p = await abrirTransferir()
    await userEvent.selectOptions(within(p).getByLabelText('De'), 'nequi')
    await userEvent.selectOptions(within(p).getByLabelText('A'), 'efe')
    await userEvent.type(within(p).getByLabelText('Monto'), '20000')
    expect(within(p).getByText('Nequi Karen queda')).toBeInTheDocument()
    expect(within(p).getByText('$27.810')).toBeInTheDocument()
    expect(within(p).getByText('Efectivo queda')).toBeInTheDocument()
    expect(within(p).getByText('$30.250')).toBeInTheDocument()
    await userEvent.click(within(p).getByRole('button', { name: 'Transferir $20.000' }))

    await waitFor(() =>
      expect(f.ejecutar).toHaveBeenCalledWith('registrar_transferencia', {
        p_household_id: 'h1',
        p_origen_id: 'nequi',
        p_destino_id: 'efe',
        p_amount: 20_000,
        p_id: expect.any(String),
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('offers only the destinations the server takes, a loan disabled', async () => {
    await montar()

    const p = await abrirTransferir()
    await userEvent.selectOptions(within(p).getByLabelText('De'), 'efe')
    const destinos = within(within(p).getByLabelText('A')).getAllByRole('option')
    expect(destinos.map((o) => o.getAttribute('value'))).toEqual(['nequi', 'bono', 'tc', 'visa', 'lib', 'aho'])
    expect(within(p).getByRole('option', { name: /Libranza Davivienda.*Un préstamo se paga desde Deudas/ })).toBeDisabled()

    await userEvent.selectOptions(within(p).getByLabelText('De'), 'aho')
    const desdeAhorros = within(within(p).getByLabelText('A')).getAllByRole('option')
    expect(desdeAhorros.map((o) => o.getAttribute('value'))).toEqual(['efe', 'nequi', 'bono'])
  })

  it('swaps the accounts only when the way back is allowed', async () => {
    await montar()

    const p = await abrirTransferir()
    await userEvent.selectOptions(within(p).getByLabelText('De'), 'efe')
    await userEvent.selectOptions(within(p).getByLabelText('A'), 'tc')
    await userEvent.click(within(p).getByRole('button', { name: 'Invertir' }))
    expect(within(p).getByLabelText('De')).toHaveValue('tc')
    expect(within(p).getByLabelText('A')).toHaveValue('efe')

    await userEvent.selectOptions(within(p).getByLabelText('De'), 'efe')
    await userEvent.selectOptions(within(p).getByLabelText('A'), 'bono')
    expect(within(p).queryByRole('button', { name: 'Invertir' })).not.toBeInTheDocument()
  })

  it('shows a balance rejection from the server', async () => {
    await montar(
      fuente(async () => {
        throw new ErrorDelServidor('Saldo insuficiente en Efectivo: tienes $10.250 y el pago es de $50.000.', 'saldo_insuficiente')
      }),
    )

    const p = await abrirTransferir()
    await userEvent.selectOptions(within(p).getByLabelText('De'), 'efe')
    await userEvent.selectOptions(within(p).getByLabelText('A'), 'nequi')
    await userEvent.type(within(p).getByLabelText('Monto'), '50000')
    await userEvent.click(within(p).getByRole('button', { name: 'Transferir $50.000' }))

    expect(await within(p).findByRole('alert')).toHaveTextContent('Saldo insuficiente en Efectivo')
  })

  it('starts from the open account', async () => {
    await montar()
    const p = await abrir('Nequi Karen')
    await userEvent.click(within(p).getByRole('button', { name: 'Transferir' }))
    expect(within(panel()).getByLabelText('De')).toHaveValue('nequi')
  })
})

describe('the tabs with accounts', () => {
  it('adds Cuentas next to the other tabs and remembers it', async () => {
    await montar(fuente(), 'resumen')
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent)
    expect(tabs).toEqual(['Resumen', 'Movimientos', 'Cuentas'])
    await userEvent.click(screen.getByRole('tab', { name: 'Movimientos' }))
    expect(await screen.findByRole('region', { name: 'Movimientos de octubre' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Cuentas' }))
    expect(await screen.findByRole('table', { name: 'Cuentas' })).toBeInTheDocument()
    expect(window.localStorage.getItem('pestana-del-tablero')).toBe('cuentas')
    expect(screen.queryByRole('button', { name: 'Nueva cuenta' })).toBeInTheDocument()
  })
})
