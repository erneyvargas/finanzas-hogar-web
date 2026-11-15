import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProveedorDeSesion, type ClienteDeAuth } from '../auth/sesion'
import { Tablero } from './Tablero'
import type { FuenteDelTablero } from './fuente'
import type { FuenteDeFacturas } from '../facturas/fuente'
import type { FuenteDeMovimientos } from '../movimientos/fuente'
import type { DatosDeMovimientos } from '../movimientos/reglas'

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

  it('compares a running month with the same days of the month before', async () => {
    render(
      <ProveedorDeSesion cliente={auth}>
        <Tablero fuente={fuente()} mesInicial="2026-10" ahora={() => new Date('2026-10-05T15:00:00Z')} />
      </ProveedorDeSesion>,
    )

    const gastado = await screen.findByRole('region', { name: 'Gastado en octubre' })
    expect(within(gastado).getByText(/Sin gastos en septiembre hasta el día 5 para comparar/)).toBeInTheDocument()
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

  it('the left and right keys change the month and the name slides that way', async () => {
    const f = fuente()
    montar(f)
    await screen.findByRole('region', { name: 'Gastado en octubre' })

    await userEvent.keyboard('{ArrowLeft}')
    expect(await screen.findByRole('region', { name: 'Gastado en septiembre' })).toBeInTheDocument()
    expect(f.cargar).toHaveBeenLastCalledWith('2026-09')
    expect(screen.getByText('Septiembre 2026')).toHaveAttribute('data-dir', 'atras')

    await userEvent.keyboard('{ArrowRight}')
    expect(await screen.findByRole('region', { name: 'Gastado en octubre' })).toBeInTheDocument()
    expect(screen.getByText('Octubre 2026')).toHaveAttribute('data-dir', 'adelante')
  })

  it('the month keys leave a field alone', async () => {
    const f = fuente()
    montar(f)
    await screen.findByRole('region', { name: 'Gastado en octubre' })
    const campo = document.createElement('input')
    document.body.appendChild(campo)
    campo.focus()

    await userEvent.keyboard('{ArrowLeft}')

    expect(f.cargar).not.toHaveBeenCalledWith('2026-09')
    campo.remove()
  })

  it('says so when the data cannot be loaded', async () => {
    montar({ cargar: vi.fn(async () => Promise.reject(new Error('Failed to fetch'))) })

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el mes')
  })

  it('retries a failed load from the error itself', async () => {
    const buena = fuente()
    const cargar = vi
      .fn<FuenteDelTablero['cargar']>()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockImplementation(buena.cargar)
    montar({ cargar })

    const alerta = await screen.findByRole('alert')
    await userEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('region', { name: 'Gastado en octubre' })).toBeInTheDocument()
    expect(cargar).toHaveBeenCalledTimes(2)
  })

  it('shows the dashboard shape while the month loads', async () => {
    let soltar: () => void = () => {}
    const buena = fuente()
    const cargar = vi.fn<FuenteDelTablero['cargar']>(
      (mes) => new Promise((ok) => (soltar = () => ok(buena.cargar(mes)))),
    )
    montar({ cargar })

    expect(screen.getByRole('status')).toHaveTextContent('Cargando octubre…')
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()

    soltar()
    expect(await screen.findByRole('region', { name: 'Gastado en octubre' })).toBeInTheDocument()
  })

  it('in the first days of a month shows the day instead of a percentage', async () => {
    const buena = fuente()
    const cargar = vi.fn<FuenteDelTablero['cargar']>(async (mes) => {
      const r = await buena.cargar(mes)
      r.datos.movimientos.push({
        id: '9', tipo: 'expense', monto: 20000, fecha: '2026-09-01T15:00:00Z',
        rubroId: 'hogar', categoriaId: 'h-mercado', anulado: false,
      })
      return r
    })
    render(
      <ProveedorDeSesion cliente={auth}>
        <Tablero fuente={{ cargar }} mesInicial="2026-10" ahora={() => new Date('2026-10-02T15:00:00Z')} />
      </ProveedorDeSesion>,
    )

    const gastado = await screen.findByRole('region', { name: 'Gastado en octubre' })
    expect(within(gastado).getByText(/Día 2 de 31/)).toBeInTheDocument()
    expect(within(gastado).getByText(/septiembre hasta el día 2: \$20\.000/)).toBeInTheDocument()
    expect(within(gastado).queryByText(/%/)).toBeNull()
  })
})

describe('registering from a receipt on the dashboard', () => {
  const datos: DatosDeMovimientos = {
    hogarId: 'h1',
    cuentas: [{ id: 'efe', nombre: 'Efectivo', tipo: 'cash', viva: true }],
    categorias: [
      { id: 'hogar', nombre: 'Hogar', tipo: 'expense', nivel: 'rubro', padreId: null, color: null, viva: true },
      { id: 'aseo', nombre: 'Aseo', tipo: 'expense', nivel: 'subcategory', padreId: 'hogar', color: null, viva: true },
    ],
    movimientos: [],
  }
  const movimientos = (): FuenteDeMovimientos => ({
    cargar: vi.fn(async () => datos),
    saldo: vi.fn(async () => null),
    ejecutar: vi.fn(async () => {}),
  })
  const facturas = (): FuenteDeFacturas => ({
    subir: vi.fn(async () => {}),
    leer: vi.fn(async () => {}),
    consultar: vi.fn(async () => ({
      estado: 'parsed',
      error: null,
      ocr: { merchant_name: 'D1', total: 5000, date: '2026-10-20', account_id: 'efe' },
      qr: null,
      items: [],
    })),
  })
  const montarCon = (m?: FuenteDeMovimientos, fa?: FuenteDeFacturas) => {
    const t = fuente()
    render(
      <ProveedorDeSesion cliente={auth}>
        <Tablero fuente={t} movimientos={m} facturas={fa} mesInicial="2026-10" />
      </ProveedorDeSesion>,
    )
    return t
  }

  it('offers Desde factura only with a receipts source', async () => {
    montarCon(movimientos())
    expect(await screen.findByRole('button', { name: '+ Registrar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desde factura' })).not.toBeInTheDocument()
  })

  it('saves from a receipt, reloads and gives the focus back', async () => {
    const m = movimientos()
    const t = montarCon(m, facturas())
    const boton = await screen.findByRole('button', { name: 'Desde factura' })
    await waitFor(() => expect(boton).toBeEnabled())

    await userEvent.click(boton)
    const dialogo = screen.getByRole('dialog', { name: 'Registrar desde factura' })
    await userEvent.upload(within(dialogo).getByLabelText('Archivo de la factura'), new File(['x'], 'f.jpg', { type: 'image/jpeg' }))
    await within(dialogo).findByLabelText('Total')
    await userEvent.type(within(dialogo).getByLabelText('Categoría'), 'ase')
    await userEvent.click(within(dialogo).getByRole('option', { name: 'Hogar › Aseo' }))
    const cargas = (t.cargar as ReturnType<typeof vi.fn>).mock.calls.length
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar gasto · $5.000' }))

    expect(m.ejecutar).toHaveBeenCalledWith('registrar_movimiento_de_factura', expect.objectContaining({ p_amount: 5000 }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect((t.cargar as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(cargas)
    expect(boton).toHaveFocus()
  })

  it('leaves the month keys alone while the dialog is open', async () => {
    const t = montarCon(movimientos(), facturas())
    const boton = await screen.findByRole('button', { name: 'Desde factura' })
    await waitFor(() => expect(boton).toBeEnabled())
    await userEvent.click(boton)

    await userEvent.keyboard('{ArrowLeft}')

    expect(t.cargar).not.toHaveBeenCalledWith('2026-09')
  })
})
