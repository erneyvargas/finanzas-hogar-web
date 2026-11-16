import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProveedorDeSesion, type ClienteDeAuth } from '../auth/sesion'
import { Tablero } from './Tablero'
import type { FuenteDelTablero } from './fuente'
import type { FuenteDeFacturas } from '../facturas/fuente'
import type { FuenteDeMovimientos } from '../movimientos/fuente'
import { ErrorDelServidor, type DatosDeMovimientos } from '../movimientos/reglas'
import type { FuenteDeCuentas } from '../cuentas/fuente'
import type { CuentaConSaldo, DatosDeCuentas } from '../cuentas/reglas'
import type { FuenteDePorVencer } from '../porvencer/fuente'
import type { DatosDePorVencer } from '../porvencer/reglas'
import type { FuenteDelPlan } from '../deudas/fuente'
import type { DeudaDelPlan } from '../deudas/plan'

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

  it('shows the income left, and no «Por persona» card: «Por rubro» already splits the month', async () => {
    montar(fuente())

    const ingresos = await screen.findByRole('region', { name: 'Ingresos del mes' })
    expect(screen.queryByRole('region', { name: 'Por persona' })).toBeNull()
    expect(within(ingresos).getByText('$100.000')).toBeInTheDocument()
    expect(ingresos).toHaveTextContent('Te quedan $72.000 después de los gastos')
  })

  // The user's words: «el ttoltip debe mostrar es el nombre del rubro».
  it('the spent card adds the daily average, the most expensive day and how many expenses', async () => {
    montar(fuente())
    const gastado = await screen.findByRole('region', { name: 'Gastado en octubre' })
    expect(gastado).toHaveTextContent('Promedio por día')
    expect(gastado).toHaveTextContent('Día más caro')
    expect(gastado).toHaveTextContent('Movimientos')
  })

  it('what is left subtracts the debt payments too', async () => {
    const base = fuente()
    const conAbono: FuenteDelTablero = {
      cargar: vi.fn(async (mes: string) => {
        const r = await base.cargar(mes)
        return {
          ...r,
          datos: {
            ...r.datos,
            movimientos: [
              ...r.datos.movimientos,
              { id: 'ab1', tipo: 'debt_payment', monto: 30000, fecha: '2026-10-10T15:00:00Z', rubroId: null, categoriaId: null, anulado: false },
            ],
          },
        }
      }),
    }
    montar(conAbono)
    const ingresos = await screen.findByRole('region', { name: 'Ingresos del mes' })
    expect(ingresos).toHaveTextContent('Te quedan $42.000 después de gastos y abonos a deudas')
    expect(ingresos).toHaveTextContent('Abonos a deudas$30.000')
  })

  it('the six-month chart names the rubro of each bar piece in a tooltip on hover', async () => {
    montar(fuente())
    const grafico = await screen.findByRole('img', { name: 'Gasto de los últimos seis meses por persona' })
    expect(grafico.querySelector('title')).toBeNull()
    const textos: string[] = []
    for (const barra of grafico.querySelectorAll('rect[opacity="1"]')) {
      await userEvent.hover(barra)
      textos.push((await screen.findByRole('tooltip')).textContent ?? '')
      await userEvent.unhover(barra)
      await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
    }
    expect(textos.some((t) => /^Karen · Oct: \$[\d.]+$/.test(t))).toBe(true)
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

  it('reloads when the tab comes back after a while, so balances changed elsewhere (the phone) are fresh', async () => {
    const buena = fuente()
    const cargar = vi.fn<FuenteDelTablero['cargar']>(buena.cargar)
    const reloj = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    montar({ cargar })
    await screen.findByRole('region', { name: 'Gastado en octubre' })
    expect(cargar).toHaveBeenCalledTimes(1)

    // Back within 30 s: nothing to fetch.
    reloj.mockReturnValue(1_010_000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(cargar).toHaveBeenCalledTimes(1)

    // Back after a minute: everything reloads.
    reloj.mockReturnValue(1_070_000)
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(cargar).toHaveBeenCalledTimes(2))
    reloj.mockRestore()
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

describe('the tabs', () => {
  const cuentas = (): FuenteDeCuentas => ({
    cargar: vi.fn(async () => ({ hogarId: 'h1', cuentas: [], deudas: [], categoriasDeGasto: [] })),
    movimientos: vi.fn(async () => []),
    ejecutar: vi.fn(async () => null),
    subirFoto: vi.fn(async () => ''),
    borrarFoto: vi.fn(async () => {}),
  })

  it('offers only the tabs whose source is given, a saved missing one falling back to Resumen', async () => {
    window.localStorage.setItem('pestana-del-tablero', 'movimientos')
    render(
      <ProveedorDeSesion cliente={auth}>
        <Tablero fuente={fuente()} cuentas={cuentas()} mesInicial="2026-10" />
      </ProveedorDeSesion>,
    )

    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Resumen', 'Cuentas'])
    expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('region', { name: 'Gastado en octubre' })).toBeInTheDocument()
  })

  it('shows no tabs without movements nor accounts', async () => {
    montar(fuente())
    await screen.findByRole('region', { name: 'Gastado en octubre' })
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })
})

describe('the actions bar', () => {
  const datos: DatosDeMovimientos = { hogarId: 'h1', cuentas: [], categorias: [], movimientos: [] }
  const movimientos = (): FuenteDeMovimientos => ({
    cargar: vi.fn(async () => datos),
    saldo: vi.fn(async () => null),
    ejecutar: vi.fn(async () => {}),
  })
  const cuentas = (): FuenteDeCuentas => ({
    cargar: vi.fn(async () => ({ hogarId: 'h1', cuentas: [], deudas: [], categoriasDeGasto: [] })),
    movimientos: vi.fn(async () => []),
    ejecutar: vi.fn(async () => null),
    subirFoto: vi.fn(async () => ''),
    borrarFoto: vi.fn(async () => {}),
  })

  it('sits beside the tabs, not floating over the content, with the account buttons only on Cuentas', async () => {
    window.localStorage.setItem('pestana-del-tablero', 'resumen')
    render(
      <ProveedorDeSesion cliente={auth}>
        <Tablero fuente={fuente()} movimientos={movimientos()} cuentas={cuentas()} mesInicial="2026-10" />
      </ProveedorDeSesion>,
    )

    const registrar = await screen.findByRole('button', { name: '+ Registrar' })
    const barra = screen.getByRole('toolbar', { name: 'Acciones' })
    expect(barra).toContainElement(registrar)
    expect(barra.closest('.flotantes')).toBeNull()
    expect(barra.parentElement).toContainElement(screen.getByRole('tablist'))
    expect(screen.queryByRole('button', { name: 'Nueva cuenta' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Cuentas' }))

    expect(within(barra).getByRole('button', { name: 'Nueva cuenta' })).toBeInTheDocument()
    expect(within(barra).getByRole('button', { name: 'Transferir' })).toBeInTheDocument()
    expect(within(barra).getByRole('button', { name: '+ Registrar' })).toBeInTheDocument()
  })
})

describe('the Por vencer tab', () => {
  const ahora = () => new Date('2026-11-15T15:00:00Z')
  const regla = {
    frecuencia: 'monthly',
    cuentaId: 'nomina',
    color: null,
  }
  const datosPv: DatosDePorVencer = {
    hogarId: 'h1',
    reglas: [
      { ...regla, id: 'internet', nombre: 'Internet', monto: 101000, diaDelMes: 18, proximaFecha: '2026-11-18', avisoDias: 3, categoriaId: 'c-internet' },
      { ...regla, id: 'luz', nombre: 'Luz', monto: 211670, diaDelMes: 20, proximaFecha: '2026-11-20', avisoDias: 2, categoriaId: 'c-luz' },
      { ...regla, id: 'admin', nombre: 'Administración', monto: 307656, diaDelMes: 5, proximaFecha: '2026-12-05', avisoDias: 1, categoriaId: 'c-admin' },
      { ...regla, id: 'celular', nombre: 'Celular', monto: 61250, diaDelMes: 24, proximaFecha: '2026-11-24', avisoDias: 1, categoriaId: 'c-celular', cuentaId: 'efe' },
      { ...regla, id: 'agua', nombre: 'Agua', monto: 90000, frecuencia: 'yearly', diaDelMes: null, proximaFecha: '2026-09-01', avisoDias: 1, categoriaId: 'c-agua' },
    ],
    tarjetas: [
      {
        id: 'bbva',
        nombre: 'Tarjeta BBVA',
        diaDePago: 17,
        deuda: 6709182,
        extracto: { corte: '2026-10-28', vence: '2026-11-17', saldo: 1238273, minimo: 120000, pagado: false },
      },
      { id: 'nu', nombre: 'Nubank', diaDePago: 25, deuda: 737627, extracto: null },
    ],
    cuentas: [
      { id: 'nomina', nombre: 'Nómina', principal: true },
      { id: 'efe', nombre: 'Efectivo', principal: false },
      { id: 'bbva', nombre: 'Tarjeta BBVA', principal: false },
      { id: 'nu', nombre: 'Nubank', principal: false },
    ],
    saldos: { nomina: 3458092, efe: 10000 },
    gastos: [
      { categoriaId: 'c-admin', dia: '2026-11-02' },
      { categoriaId: 'c-luz', dia: '2026-11-05' },
    ],
    pagosATarjetas: [],
  }
  const porVencer = (): FuenteDePorVencer => ({ cargar: vi.fn(async () => datosPv) })
  const datosMov: DatosDeMovimientos = {
    hogarId: 'h1',
    cuentas: [
      { id: 'efe', nombre: 'Efectivo', tipo: 'cash', viva: true },
      { id: 'nomina', nombre: 'Nómina', tipo: 'savings', viva: true },
    ],
    categorias: [
      { id: 'hogar', nombre: 'Hogar', tipo: 'expense', nivel: 'rubro', padreId: null, color: null, viva: true },
      { id: 'servicios', nombre: 'Servicios', tipo: 'expense', nivel: 'category', padreId: 'hogar', color: null, viva: true },
      { id: 'c-internet', nombre: 'Internet', tipo: 'expense', nivel: 'subcategory', padreId: 'servicios', color: null, viva: true },
    ],
    movimientos: [],
  }
  const movimientos = (): FuenteDeMovimientos => ({
    cargar: vi.fn(async () => datosMov),
    saldo: vi.fn(async () => null),
    ejecutar: vi.fn(async () => {}),
  })
  const montarPv = async (m?: FuenteDeMovimientos) => {
    window.localStorage.setItem('pestana-del-tablero', 'resumen')
    render(
      <ProveedorDeSesion cliente={auth}>
        <Tablero fuente={fuente()} movimientos={m} porVencer={porVencer()} mesInicial="2026-10" ahora={ahora} />
      </ProveedorDeSesion>,
    )
    const tab = await screen.findByRole('tab', { name: /Por vencer/ })
    await waitFor(() => expect(within(tab).getByText('5')).toBeInTheDocument())
    await userEvent.click(tab)
    return tab
  }

  it('shows the shape of the tab while the bills load, then the bills', async () => {
    let soltar: () => void = () => {}
    const cargar = vi.fn<FuenteDePorVencer['cargar']>(() => new Promise((ok) => (soltar = () => ok(datosPv))))
    window.localStorage.setItem('pestana-del-tablero', 'porvencer')
    render(
      <ProveedorDeSesion cliente={auth}>
        <Tablero fuente={fuente()} porVencer={{ cargar }} mesInicial="2026-10" ahora={ahora} />
      </ProveedorDeSesion>,
    )

    expect(await screen.findByRole('status')).toHaveTextContent('Cargando vencimientos…')
    expect(screen.getAllByRole('status')).toHaveLength(1)
    const ocupado = document.querySelector('[aria-busy="true"]')!
    expect(ocupado.querySelector('.por-vencer')).toHaveAttribute('aria-hidden', 'true')
    // The calendar of November 2026: 6 empty cells before day 1, then 30 days.
    expect(ocupado.querySelectorAll('.sk-dia')).toHaveLength(30)
    expect(ocupado.querySelectorAll('.cal-dia.vacio')).toHaveLength(6)
    expect(screen.queryByRole('group', { name: 'Calendario de noviembre' })).toBeNull()

    soltar()
    expect(await screen.findByRole('group', { name: 'Calendario de noviembre' })).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('is a fourth tab whose badge counts the unpaid items due in the next 30 days', async () => {
    const tab = await montarPv(movimientos())
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Resumen', 'Movimientos', 'Por vencer5'])
    expect(tab).toHaveAttribute('aria-selected', 'true')
  })

  it('puts one circle per item on its day, the paid one outlined and the unknown date dashed', async () => {
    await montarPv()
    const cal = screen.getByRole('group', { name: 'Calendario de noviembre' })
    const internet = within(cal).getByRole('button', { name: /^Internet/ })
    expect(internet.closest('[data-dia]')).toHaveAttribute('data-dia', '18')
    expect(internet).toHaveClass('bola-lleno')
    const admin = within(cal).getByRole('button', { name: /^Administración/ })
    expect(admin.closest('[data-dia]')).toHaveAttribute('data-dia', '5')
    expect(admin).toHaveClass('bola-hueco')
    expect(within(cal).getByRole('button', { name: /^Luz/ })).toHaveClass('bola-lleno')
    const nubank = within(cal).getByRole('button', { name: 'Nubank · debes $737.627 · revisa el extracto' })
    expect(nubank).toHaveClass('bola-hueco')
    expect(nubank).toHaveStyle({ '--s': '10px' })
    expect(within(cal).getByRole('button', { name: /^Tarjeta BBVA/ }).closest('[data-dia]')).toHaveAttribute('data-dia', '17')
    const agua = screen.getByRole('button', { name: /^Agua/ })
    expect(agua).toHaveClass('bola-rayado')
    expect(agua.closest('[data-sin-fecha]')).not.toBeNull()
    expect(cal.querySelector('[data-dia="15"]')).toHaveClass('hoy')
  })

  it('a calendar circle shows its label in a tooltip on hover and on keyboard focus', async () => {
    await montarPv()
    const cal = screen.getByRole('group', { name: 'Calendario de noviembre' })
    const nubank = within(cal).getByRole('button', { name: 'Nubank · debes $737.627 · revisa el extracto' })
    expect(nubank).not.toHaveAttribute('title')

    await userEvent.hover(nubank)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Nubank · debes $737.627 · revisa el extracto')
    await userEvent.unhover(nubank)
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())

    nubank.focus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Nubank · debes $737.627 · revisa el extracto')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
  })

  it('animates the unpaid circles by urgency: due today or overdue ripples, this week glows, later and paid stay still', async () => {
    const conHoy = {
      ...datosPv,
      reglas: [
        ...datosPv.reglas,
        { ...regla, id: 'escrituras', nombre: 'Deuda escrituras', monto: 606000, diaDelMes: 15, proximaFecha: '2026-11-15', avisoDias: 1, categoriaId: 'c-esc' },
        { ...regla, id: 'gym', nombre: 'Gimnasio', monto: 90000, diaDelMes: 10, proximaFecha: '2026-11-10', avisoDias: 1, categoriaId: 'c-gym' },
      ],
    }
    window.localStorage.setItem('pestana-del-tablero', 'porvencer')
    render(
      <ProveedorDeSesion cliente={auth}>
        <Tablero fuente={fuente()} porVencer={{ cargar: vi.fn(async () => conHoy) }} mesInicial="2026-10" ahora={ahora} />
      </ProveedorDeSesion>,
    )
    const cal = await screen.findByRole('group', { name: 'Calendario de noviembre' })
    const bola = (n: RegExp) => within(cal).getByRole('button', { name: n })
    expect(bola(/^Deuda escrituras/)).toHaveClass('bola-pulso-urgente')
    expect(bola(/^Gimnasio/)).toHaveClass('bola-pulso-urgente')
    expect(bola(/^Internet/)).toHaveClass('bola-pulso-pronto')
    expect(bola(/^Tarjeta BBVA/)).toHaveClass('bola-pulso-pronto')
    expect(bola(/^Celular/).className).not.toMatch(/bola-pulso/)
    expect(bola(/^Administración/).className).not.toMatch(/bola-pulso/)
    expect(bola(/^Nubank/).className).not.toMatch(/bola-pulso/)
  })

  it('lights the row of a hovered circle', async () => {
    await montarPv()
    await userEvent.hover(screen.getByRole('button', { name: /^Luz/ }))
    const fila = within(screen.getByRole('list', { name: 'Por pagar' })).getByText('Luz').closest('li')
    expect(fila).toHaveClass('encendida')
  })

  it('shows what is left this month and switches to the next 30 days', async () => {
    await montarPv()
    const resumen = screen.getByRole('region', { name: 'Falta pagar en noviembre' })
    expect(within(resumen).getAllByText('$493.920').length).toBeGreaterThan(0)
    expect(within(resumen).getByText('+ agua por confirmar')).toBeInTheDocument()
    const quedan = within(resumen).getAllByText(/quedarían/)
    expect(quedan.map((q) => q.textContent)).toEqual(['quedarían $3.025.422 en Nómina', 'quedarían −$51.250 en Efectivo'])

    await userEvent.click(within(resumen).getByRole('button', { name: '30 días' }))

    expect(within(resumen).getByRole('button', { name: '30 días' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Falta pagar hasta el 15 dic' })).toBeInTheDocument()
    expect(within(resumen).getAllByText('$801.576').length).toBeGreaterThan(0)
  })

  it('marks the heaviest week', async () => {
    await montarPv()
    expect(screen.getByText('16–22 nov: $432.670, la más cargada')).toBeInTheDocument()
  })

  // The user's words: «cuando le de click quiero que me lleve al movimiento».
  it('a paid bill opens the movement that paid it', async () => {
    const conPago: DatosDePorVencer = {
      ...datosPv,
      gastos: [{ id: 'g-admin', categoriaId: 'c-admin', dia: '2026-11-02' }, { categoriaId: 'c-luz', dia: '2026-11-05' }],
    }
    const conMovimiento: DatosDeMovimientos = {
      ...datosMov,
      movimientos: [
        { id: 'g-admin', tipo: 'expense', monto: 307656, fecha: '2026-11-02T15:00:00Z', cuentaId: 'nomina', categoriaId: 'c-internet', rubroId: 'hogar', comercio: 'Administración', nota: null },
      ],
    }
    window.localStorage.setItem('pestana-del-tablero', 'porvencer')
    render(
      <ProveedorDeSesion cliente={auth}>
        <Tablero
          fuente={fuente()}
          movimientos={{ cargar: vi.fn(async () => conMovimiento), saldo: vi.fn(async () => null), ejecutar: vi.fn(async () => {}) }}
          porVencer={{ cargar: vi.fn(async () => conPago) }}
          mesInicial="2026-11"
          ahora={ahora}
        />
      </ProveedorDeSesion>,
    )
    const pagados = await screen.findByRole('list', { name: 'Ya pagados' })
    const ver = await within(pagados).findByRole('button', { name: 'Ver el pago de Administración' })
    await waitFor(() => expect(ver).toBeEnabled())
    await userEvent.click(ver)

    const panel = await screen.findByRole('dialog', { name: 'Corregir movimiento' })
    expect(within(panel).getByLabelText('Valor')).toHaveValue('307.656')
  })

  it('lists the bills by due date, the close ones in red, and the paid ones apart', async () => {
    await montarPv()
    const filas = within(screen.getByRole('list', { name: 'Por pagar' })).getAllByRole('listitem')
    expect(filas.map((f) => f.querySelector('.nombre')?.textContent)).toEqual([
      'Tarjeta BBVA',
      'Internet',
      'Luz',
      'Celular',
      'Nubank',
      'Agua',
    ])
    expect(filas[0]).toHaveTextContent('pago mínimo')
    expect(filas[0]).toHaveTextContent('$120.000')
    expect(filas[0]).toHaveTextContent('total $1.238.273')
    expect(filas[0]).toHaveTextContent('17 nov · faltan 2 días · Nómina')
    expect(filas[4]).toHaveTextContent('Debes $737.627 · revisa el extracto')
    expect(within(filas[1]).getByText('18 nov · faltan 3 días')).toHaveClass('urgente')
    expect(within(filas[2]).getByText('20 nov · faltan 5 días')).not.toHaveClass('urgente')
    expect(filas[5]).toHaveTextContent('fecha por confirmar')
    const pagados = screen.getByRole('list', { name: 'Ya pagados' })
    expect(within(pagados).getByText('Administración')).toBeInTheDocument()
    expect(within(pagados).queryByRole('button', { name: /Pagar/ })).not.toBeInTheDocument()
  })

  it('Pagar opens the register panel with the amount, category, account and merchant filled', async () => {
    await montarPv(movimientos())
    const pagar = screen.getByRole('button', { name: 'Pagar Internet' })
    await waitFor(() => expect(pagar).toBeEnabled())

    await userEvent.click(pagar)

    const panel = screen.getByRole('dialog', { name: 'Registrar movimiento' })
    expect(within(panel).getByLabelText('Valor')).toHaveValue('101.000')
    expect(within(panel).getByLabelText('Comercio')).toHaveValue('Internet')
    expect(within(panel).getByRole('button', { name: 'Internet, de Hogar' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(panel).getByText('Servicios › Internet')).toBeInTheDocument()
    expect(within(panel).getByRole('group', { name: 'Sale de' })).toHaveTextContent('Nómina')
  })

  it('without the accounts, a card offers no Pagar: paying it is a transfer, never an expense', async () => {
    await montarPv(movimientos())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pagar Internet' })).toBeEnabled())
    expect(screen.queryByRole('button', { name: 'Pagar Tarjeta BBVA' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pagar Nubank' })).not.toBeInTheDocument()
  })

  describe('Pagar on a card or a debt installment opens Transferir', () => {
    const cuentaDe = (c: Partial<CuentaConSaldo> & Pick<CuentaConSaldo, 'id' | 'nombre' | 'tipo' | 'saldo'>): CuentaConSaldo => ({
      archivada: false, principal: false, foto: null, rutaDeFoto: null, cupo: null, diaDeCorte: null, diaDePago: null,
      cobraGmf: false, categoriaGmf: null, estilo: null, ...c,
    })
    const datosCuentas: DatosDeCuentas = {
      hogarId: 'h1',
      cuentas: [
        cuentaDe({ id: 'nomina', nombre: 'Nómina', tipo: 'debit', saldo: 3_458_092, principal: true }),
        cuentaDe({ id: 'efe', nombre: 'Efectivo', tipo: 'cash', saldo: 10_000 }),
        cuentaDe({ id: 'bbva', nombre: 'Tarjeta BBVA', tipo: 'credit_card', saldo: -6_709_182 }),
        cuentaDe({ id: 'pertuz', nombre: 'Pertuz', tipo: 'liability', saldo: -10_268_859 }),
      ],
      deudas: [],
      categoriasDeGasto: [],
    }
    const cuentas = (): FuenteDeCuentas => ({
      cargar: vi.fn(async () => datosCuentas),
      movimientos: vi.fn(async () => []),
      ejecutar: vi.fn(async () => null),
      subirFoto: vi.fn(async () => ''),
      borrarFoto: vi.fn(async () => {}),
    })
    const conDeuda: DatosDePorVencer = {
      ...datosPv,
      reglas: [
        ...datosPv.reglas,
        { ...regla, id: 'escrituras', nombre: 'Deuda escrituras', monto: 606000, diaDelMes: 16, proximaFecha: '2026-11-16', avisoDias: 1, categoriaId: null, deudaId: 'd-pertuz', destinoId: 'pertuz' },
      ],
    }
    const montarConCuentas = async (d: DatosDePorVencer = conDeuda) => {
      window.localStorage.setItem('pestana-del-tablero', 'porvencer')
      render(
        <ProveedorDeSesion cliente={auth}>
          <Tablero
            fuente={fuente()}
            movimientos={movimientos()}
            cuentas={cuentas()}
            porVencer={{ cargar: vi.fn(async () => d) }}
            mesInicial="2026-10"
            ahora={ahora}
          />
        </ProveedorDeSesion>,
      )
      await screen.findByRole('button', { name: 'Pagar Tarjeta BBVA' })
    }

    it('a card: from the principal account to the card, with the minimum payment', async () => {
      await montarConCuentas()
      const pagar = screen.getByRole('button', { name: 'Pagar Tarjeta BBVA' })
      await waitFor(() => expect(pagar).toBeEnabled())
      await userEvent.click(pagar)

      const panel = screen.getByRole('dialog', { name: 'Transferir' })
      expect(within(panel).getByRole('button', { name: /^De / })).toHaveTextContent('Nómina')
      expect(within(panel).getByRole('button', { name: /^A / })).toHaveTextContent('Tarjeta BBVA')
      expect(within(panel).getByLabelText('Monto')).toHaveValue('120.000')
      expect(screen.queryByRole('dialog', { name: 'Registrar movimiento' })).not.toBeInTheDocument()
    })

    it('when the principal cannot cover the card, starts from the account with the most money', async () => {
      const pobre = { ...datosCuentas, cuentas: datosCuentas.cuentas.map((c) => (c.id === 'nomina' ? { ...c, saldo: 1_000 } : c)) }
      window.localStorage.setItem('pestana-del-tablero', 'porvencer')
      render(
        <ProveedorDeSesion cliente={auth}>
          <Tablero
            fuente={fuente()}
            movimientos={movimientos()}
            cuentas={{ ...cuentas(), cargar: vi.fn(async () => pobre) }}
            porVencer={{ cargar: vi.fn(async () => conDeuda) }}
            mesInicial="2026-10"
            ahora={ahora}
          />
        </ProveedorDeSesion>,
      )
      const pagar = await screen.findByRole('button', { name: 'Pagar Tarjeta BBVA' })
      await waitFor(() => expect(pagar).toBeEnabled())
      await userEvent.click(pagar)
      expect(within(screen.getByRole('dialog', { name: 'Transferir' })).getByRole('button', { name: /^De / })).toHaveTextContent('Efectivo')
    })

    it('a debt installment rule: from its account to the loan, as an installment', async () => {
      await montarConCuentas()
      await userEvent.click(screen.getByRole('button', { name: 'Pagar Deuda escrituras' }))

      const panel = screen.getByRole('dialog', { name: 'Transferir' })
      expect(within(panel).getByRole('button', { name: /^De / })).toHaveTextContent('Nómina')
      expect(within(panel).getByRole('button', { name: /^A / })).toHaveTextContent('Pertuz')
      expect(within(panel).getByLabelText('Cuota del préstamo')).toHaveValue('606.000')
    })

    it('an expense rule still opens the register panel', async () => {
      await montarConCuentas()
      const pagar = screen.getByRole('button', { name: 'Pagar Internet' })
      await waitFor(() => expect(pagar).toBeEnabled())
      await userEvent.click(pagar)
      expect(screen.getByRole('dialog', { name: 'Registrar movimiento' })).toBeInTheDocument()
    })
  })

  describe('recurring payments (Moxen «Recurrencia»)', () => {
    const conReglas: DatosDePorVencer = {
      ...datosPv,
      reglas: [
        ...datosPv.reglas.map((r) => (r.id === 'internet' ? { ...r, horaAviso: '08:30:00' } : r)),
        { ...regla, id: 'aseo', nombre: 'Aseo', monto: 120000, frecuencia: 'biweekly', diaDelMes: null, proximaFecha: '2026-11-20', avisoDias: 1, categoriaId: 'c-internet' },
        { ...regla, id: 'sueldo', nombre: 'Sueldo', monto: 5000000, diaDelMes: 30, proximaFecha: '2026-11-30', avisoDias: 0, categoriaId: null, tipo: 'income' as const },
      ],
      deudas: [{ id: 'd-pertuz', nombre: 'Pertuz' }],
    }
    const conEscribir = (d: DatosDePorVencer = conReglas) => ({
      cargar: vi.fn(async () => d),
      ejecutar: vi.fn(async (): Promise<unknown> => null),
    })
    const montarReglas = async (pv = conEscribir(), m = movimientos()) => {
      window.localStorage.setItem('pestana-del-tablero', 'porvencer')
      render(
        <ProveedorDeSesion cliente={auth}>
          <Tablero fuente={fuente()} movimientos={m} porVencer={pv} mesInicial="2026-10" ahora={ahora} />
        </ProveedorDeSesion>,
      )
      await waitFor(() => expect(screen.getByRole('button', { name: 'Nuevo pago recurrente' })).toBeEnabled())
      return { pv, m }
    }

    it('lists every rule, income too, each one editable', async () => {
      await montarReglas()
      const lista = screen.getByRole('list', { name: 'Pagos recurrentes' })
      expect(within(lista).getByRole('button', { name: 'Editar Sueldo' })).toHaveTextContent('Se repite el día 30 de cada mes')
      expect(within(lista).getByRole('button', { name: 'Editar Aseo' })).toHaveTextContent('Se repite cada dos semanas')
      // Income is nothing to pay.
      expect(within(screen.getByRole('list', { name: 'Por pagar' })).queryByText('Sueldo')).not.toBeInTheDocument()
    })

    it('creates one: the panel sends crear_regla_recurrente with the pattern and reloads', async () => {
      const { pv } = await montarReglas()
      await userEvent.click(screen.getByRole('button', { name: 'Nuevo pago recurrente' }))
      const panel = screen.getByRole('dialog', { name: 'Nuevo pago recurrente' })
      await userEvent.type(within(panel).getByLabelText('Nombre'), 'Gimnasio')
      await userEvent.type(within(panel).getByLabelText('Valor'), '90000')
      await userEvent.click(within(panel).getByRole('button', { name: 'Internet, de Hogar' }))
      // A new rule starts monthly on today's day.
      expect(within(panel).getByRole('radio', { name: 'Mensual' })).toHaveAttribute('aria-checked', 'true')
      await userEvent.click(within(panel).getByRole('button', { name: 'Un día después' }))
      expect(within(panel).getByLabelText(/^Expresión de repetición/)).toHaveAttribute('aria-label', 'Expresión de repetición: 0 9 16 * *')
      expect(within(within(panel).getByRole('list', { name: 'Próximas cinco' })).getAllByRole('listitem')[0]).toHaveTextContent('16')

      await userEvent.click(within(panel).getByRole('button', { name: 'Guardar' }))

      expect(pv.ejecutar).toHaveBeenCalledWith('crear_regla_recurrente', {
        p_household_id: 'h1',
        p_nombre: 'Gimnasio',
        p_tipo: 'expense',
        p_cuenta: 'efe',
        p_categoria: 'c-internet',
        p_deuda: null,
        p_monto: 90000,
        p_frecuencia: 'monthly',
        p_dia: 16,
        p_dias: null,
        p_semana: null,
        p_mes: null,
        p_inicio: '2026-11-15',
        p_fin: null,
        p_aviso_dias: 1,
        p_hora: '09:00',
        p_id: expect.any(String),
      })
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nuevo pago recurrente' })).not.toBeInTheDocument())
      await waitFor(() => expect(pv.cargar).toHaveBeenCalledTimes(2))
    })

    it('a debt installment picks the debt instead of a category', async () => {
      const { pv } = await montarReglas()
      await userEvent.click(screen.getByRole('button', { name: 'Nuevo pago recurrente' }))
      const panel = screen.getByRole('dialog', { name: 'Nuevo pago recurrente' })
      await userEvent.click(within(panel).getByRole('button', { name: 'Cuota de deuda' }))
      await userEvent.type(within(panel).getByLabelText('Nombre'), 'Cuota Pertuz')
      await userEvent.type(within(panel).getByLabelText('Valor'), '606000')
      await userEvent.selectOptions(within(panel).getByLabelText('Deuda'), 'd-pertuz')
      await userEvent.click(within(panel).getByRole('radio', { name: 'Semanal' }))
      await userEvent.click(within(panel).getByRole('button', { name: 'Entre semana' }))
      await userEvent.click(within(panel).getByRole('button', { name: 'Guardar' }))
      expect(pv.ejecutar).toHaveBeenCalledWith(
        'crear_regla_recurrente',
        expect.objectContaining({ p_tipo: 'debt_payment', p_categoria: null, p_deuda: 'd-pertuz', p_frecuencia: 'weekly', p_dias: [1, 2, 3, 4, 5] }),
      )
    })

    it('edits one: the panel opens filled and sends editar_regla_recurrente from its next date', async () => {
      const { pv } = await montarReglas()
      await userEvent.click(screen.getByRole('button', { name: 'Editar Internet' }))
      const panel = screen.getByRole('dialog', { name: 'Editar pago recurrente' })
      expect(within(panel).getByLabelText('Nombre')).toHaveValue('Internet')
      expect(within(panel).getByLabelText('Valor')).toHaveValue('101.000')
      expect(within(panel).getByRole('button', { name: 'Gasto' })).toBeDisabled()
      expect(within(panel).getByLabelText(/^Expresión de repetición/)).toHaveAttribute('aria-label', 'Expresión de repetición: 30 8 18 * *')

      await userEvent.click(within(panel).getByRole('radio', { name: 'El' }))
      await userEvent.click(within(panel).getByRole('button', { name: 'Guardar' }))

      expect(pv.ejecutar).toHaveBeenCalledWith('editar_regla_recurrente', {
        p_household_id: 'h1',
        p_id: 'internet',
        p_nombre: 'Internet',
        p_cuenta: 'nomina',
        p_categoria: 'c-internet',
        p_deuda: null,
        p_monto: 101000,
        p_frecuencia: 'monthly',
        p_dia: null,
        p_dias: [1],
        p_semana: 1,
        p_mes: null,
        p_inicio: '2026-11-18',
        p_fin: null,
        p_aviso_dias: 3,
        p_hora: '08:30',
      })
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar pago recurrente' })).not.toBeInTheDocument())
    })

    it('every two weeks has no control here: it is kept and shown with a note', async () => {
      const { pv } = await montarReglas()
      await userEvent.click(screen.getByRole('button', { name: 'Editar Aseo' }))
      const panel = screen.getByRole('dialog', { name: 'Editar pago recurrente' })
      expect(within(panel).getByText(/Se repite cada dos semanas/)).toBeInTheDocument()
      expect(within(panel).queryByRole('radiogroup', { name: 'Frecuencia' })).not.toBeInTheDocument()
      await userEvent.click(within(panel).getByRole('button', { name: 'Guardar' }))
      expect(pv.ejecutar).toHaveBeenCalledWith(
        'editar_regla_recurrente',
        expect.objectContaining({ p_frecuencia: 'biweekly', p_dia: null, p_dias: null, p_semana: null, p_mes: null, p_hora: '09:00' }),
      )
    })

    it('shows the server’s message and stays open', async () => {
      const pv = conEscribir()
      pv.ejecutar.mockRejectedValueOnce(new ErrorDelServidor('La fecha de fin no puede ser antes de la primera', 'fin_antes_de_inicio'))
      await montarReglas(pv)
      await userEvent.click(screen.getByRole('button', { name: 'Editar Internet' }))
      const panel = screen.getByRole('dialog', { name: 'Editar pago recurrente' })
      await userEvent.click(within(panel).getByRole('button', { name: 'Guardar' }))
      expect(await within(panel).findByRole('alert')).toHaveTextContent('La fecha de fin no puede ser antes de la primera')
      expect(within(panel).getByRole('button', { name: 'Guardar' })).toBeEnabled()
    })

    it('deletes one after confirming in the panel', async () => {
      const { pv } = await montarReglas()
      await userEvent.click(screen.getByRole('button', { name: 'Editar Luz' }))
      const panel = screen.getByRole('dialog', { name: 'Editar pago recurrente' })
      await userEvent.click(within(panel).getByRole('button', { name: 'Borrar' }))
      expect(within(panel).getByText('¿Borrar este pago recurrente?')).toBeInTheDocument()
      await userEvent.click(within(panel).getByRole('button', { name: 'Sí, borrar' }))
      expect(pv.ejecutar).toHaveBeenCalledWith('borrar_regla_recurrente', { p_household_id: 'h1', p_id: 'luz' })
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar pago recurrente' })).not.toBeInTheDocument())
    })

    it('Escape closes the panel and gives the focus back', async () => {
      await montarReglas()
      const abrir = screen.getByRole('button', { name: 'Nuevo pago recurrente' })
      await userEvent.click(abrir)
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('dialog', { name: 'Nuevo pago recurrente' })).not.toBeInTheDocument()
      expect(abrir).toHaveFocus()
    })

    it('Pagar an expense rule advances the rule once the expense is saved', async () => {
      const { pv, m } = await montarReglas()
      await userEvent.click(screen.getByRole('button', { name: 'Pagar Internet' }))
      await userEvent.click(within(screen.getByRole('dialog', { name: 'Registrar movimiento' })).getByRole('button', { name: /Guardar gasto/ }))
      expect(m.ejecutar).toHaveBeenCalledWith('registrar_movimiento', expect.objectContaining({ p_amount: 101000 }))
      await waitFor(() => expect(pv.ejecutar).toHaveBeenCalledWith('cumplir_regla_recurrente', { p_household_id: 'h1', p_id: 'internet' }))
    })

    it('closing the register panel without saving advances nothing', async () => {
      const { pv } = await montarReglas()
      await userEvent.click(screen.getByRole('button', { name: 'Pagar Internet' }))
      await userEvent.keyboard('{Escape}')
      await userEvent.click(screen.getByRole('button', { name: 'Nuevo pago recurrente' }))
      await userEvent.keyboard('{Escape}')
      expect(pv.ejecutar).not.toHaveBeenCalled()
    })

    it('if advancing fails, the payment stays and a short notice says so', async () => {
      const pv = conEscribir()
      pv.ejecutar.mockRejectedValueOnce(new ErrorDelServidor('Ese pago recurrente ya no existe.', 'regla_no_disponible'))
      const { m } = await montarReglas(pv)
      await userEvent.click(screen.getByRole('button', { name: 'Pagar Internet' }))
      await userEvent.click(within(screen.getByRole('dialog', { name: 'Registrar movimiento' })).getByRole('button', { name: /Guardar gasto/ }))
      expect(await screen.findByRole('status', { name: 'Pago recurrente' })).toHaveTextContent(
        'El pago quedó guardado, pero Internet no pasó a su próxima fecha. Ese pago recurrente ya no existe.',
      )
      expect(m.ejecutar).not.toHaveBeenCalledWith('borrar_movimiento', expect.anything())
    })

    it('Pagar a debt installment advances the rule once the installment is saved', async () => {
      const pv = conEscribir({
        ...conReglas,
        reglas: [
          ...conReglas.reglas,
          { ...regla, id: 'escrituras', nombre: 'Deuda escrituras', monto: 606000, diaDelMes: 16, proximaFecha: '2026-11-16', avisoDias: 1, categoriaId: null, deudaId: 'd-pertuz', destinoId: 'pertuz', tipo: 'debt_payment' as const },
        ],
      })
      const datosCuentas: DatosDeCuentas = {
        hogarId: 'h1',
        cuentas: [
          { id: 'nomina', nombre: 'Nómina', tipo: 'debit', saldo: 3_458_092, principal: true, archivada: false, foto: null, rutaDeFoto: null, cupo: null, diaDeCorte: null, diaDePago: null, cobraGmf: false, categoriaGmf: null, estilo: null },
          { id: 'pertuz', nombre: 'Pertuz', tipo: 'liability', saldo: -10_268_859, principal: false, archivada: false, foto: null, rutaDeFoto: null, cupo: null, diaDeCorte: null, diaDePago: null, cobraGmf: false, categoriaGmf: null, estilo: null },
        ],
        deudas: [],
        categoriasDeGasto: [],
      }
      const cuentas: FuenteDeCuentas = {
        cargar: vi.fn(async () => datosCuentas),
        movimientos: vi.fn(async () => []),
        ejecutar: vi.fn(async () => null),
        subirFoto: vi.fn(async () => ''),
        borrarFoto: vi.fn(async () => {}),
      }
      window.localStorage.setItem('pestana-del-tablero', 'porvencer')
      render(
        <ProveedorDeSesion cliente={auth}>
          <Tablero fuente={fuente()} movimientos={movimientos()} cuentas={cuentas} porVencer={pv} mesInicial="2026-10" ahora={ahora} />
        </ProveedorDeSesion>,
      )
      const pagar = await screen.findByRole('button', { name: 'Pagar Deuda escrituras' })
      await waitFor(() => expect(pagar).toBeEnabled())
      await userEvent.click(pagar)
      await userEvent.click(within(screen.getByRole('dialog', { name: 'Transferir' })).getByRole('button', { name: /Pagar cuota/ }))
      expect(cuentas.ejecutar).toHaveBeenCalledWith('pagar_cuota_de_prestamo', expect.objectContaining({ p_destino_id: 'pertuz' }))
      await waitFor(() => expect(pv.ejecutar).toHaveBeenCalledWith('cumplir_regla_recurrente', { p_household_id: 'h1', p_id: 'escrituras' }))
    })
  })

  it('keeps the other tabs working', async () => {
    await montarPv(movimientos())
    await userEvent.click(screen.getByRole('tab', { name: 'Resumen' }))
    expect(await screen.findByRole('region', { name: 'Gastado en octubre' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Calendario de noviembre' })).not.toBeInTheDocument()
  })
})

describe('the «Deudas» tab (design B, «Línea de tiempo»)', () => {
  const deuda = (nombre: string, saldo: number, tasa: number, minimo = 0, cargo = 0): DeudaDelPlan => ({
    id: nombre,
    nombre,
    saldo,
    tasaMensual: tasa,
    minimo,
    cargoFijo: cargo,
    capitaliza: false,
  })
  // The phone's reference set (test/plan_de_deudas_test.dart).
  const referencia: DeudaDelPlan[] = [
    deuda('Hipotecario', 124754493, 0.0088859305, 1286960, 70040),
    deuda('Colsubsidio', 36642339, 0.0138955903, 882645, 42479),
    deuda('Pertuz', 10805337, 0.0064340301, 606000),
    deuda('Davivienda', 4366649, 0.0173939486, 259586, 5414),
    { ...deuda('Terraza', 2970520, 0.03), capitaliza: true },
    deuda('Don Ciro', 10000000, 0),
    deuda('Jorge', 6000000, 0),
    deuda('Reinaldo', 3000000, 0),
    deuda('Brayan', 2800000, 0),
    deuda('Baby shower', 100000, 0),
  ]
  const ahora = () => new Date('2026-11-15T15:00:00Z')
  const plan = (deudas = referencia): FuenteDelPlan => ({ cargar: vi.fn(async () => ({ deudas, sobrante: 500000 })) })

  beforeEach(() => window.localStorage.clear())

  const vacio = plan([])
  const montarPlan = async (f: FuenteDelPlan = plan()) => {
    render(
      <ProveedorDeSesion cliente={auth}>
        <Tablero fuente={fuente()} deudas={f} mesInicial="2026-10" ahora={ahora} />
      </ProveedorDeSesion>,
    )
    await userEvent.click(await screen.findByRole('tab', { name: 'Deudas' }))
    await screen.findByRole('region', { name: f === vacio ? 'Plan de deudas' : 'Sin deudas en' })
  }
  const fin = () => screen.findByRole('region', { name: 'Sin deudas en' })

  it('is a tab after the others, remembered in this browser', async () => {
    window.localStorage.setItem('pestana-del-tablero', 'resumen')
    render(
      <ProveedorDeSesion cliente={auth}>
        <Tablero fuente={fuente()} porVencer={{ cargar: vi.fn(async () => new Promise<never>(() => {})) }} deudas={plan()} mesInicial="2026-10" ahora={ahora} />
      </ProveedorDeSesion>,
    )
    await userEvent.click(await screen.findByRole('tab', { name: 'Deudas' }))
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Resumen', 'Por vencer', 'Deudas'])
    expect(screen.getByRole('tab', { name: 'Deudas' })).toHaveAttribute('aria-selected', 'true')
    expect(window.localStorage.getItem('pestana-del-tablero')).toBe('deudas')
  })

  it('shows the shape of the tab while the plan loads, then the plan', async () => {
    let soltar: () => void = () => {}
    const cargar = vi.fn<FuenteDelPlan['cargar']>(() => new Promise((ok) => (soltar = () => ok({ deudas: referencia, sobrante: 500000 }))))
    window.localStorage.setItem('pestana-del-tablero', 'deudas')
    render(
      <ProveedorDeSesion cliente={auth}>
        <Tablero fuente={fuente()} deudas={{ cargar }} mesInicial="2026-10" ahora={ahora} />
      </ProveedorDeSesion>,
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Cargando el plan de deudas…')
    expect(document.querySelector('[aria-busy="true"] .plan-deudas')).toHaveAttribute('aria-hidden', 'true')
    soltar()
    expect(await fin()).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).toBeNull()
  })

  it('the three cards: the debt-free month, the extra and the recommended strategy', async () => {
    await montarPlan()
    const tarjeta = await fin()
    expect(tarjeta).toHaveTextContent('feb 2033')
    expect(tarjeta).toHaveTextContent('76 meses · intereses $66,5 M')

    const extra = screen.getByRole('region', { name: 'Abono extra cada mes' })
    expect(extra.querySelector('.pd-monto')).toHaveTextContent('$500.000')
    expect(extra).toHaveTextContent('Lo que sobra al mes según tus últimos 3 meses: $500.000')
    expect(within(extra).getByRole('slider', { name: 'Abono extra cada mes' })).toHaveValue('500000')
    expect(within(extra).getByRole('spinbutton', { name: 'Abono extra exacto' })).toHaveValue(500000)

    const estrategia = screen.getByRole('region', { name: 'Estrategia' })
    const avalancha = within(estrategia).getByRole('button', { name: /Avalancha/ })
    expect(avalancha).toHaveAttribute('aria-pressed', 'true')
    expect(avalancha).toHaveTextContent('Recomendada')
    expect(within(estrategia).getByRole('button', { name: 'Bola de nieve' })).toHaveAttribute('aria-pressed', 'false')
    expect(estrategia).toHaveTextContent('Avalancha: 5 meses antes y $18,9 M menos')
  })

  it('the slider and the exact field move the date; «Usar el calculado» brings the surplus back', async () => {
    await montarPlan()
    const extra = screen.getByRole('region', { name: 'Abono extra cada mes' })
    fireEvent.change(within(extra).getByRole('slider'), { target: { value: '2000000' } })
    await waitFor(() => expect(screen.getByRole('region', { name: 'Sin deudas en' })).not.toHaveTextContent('feb 2033'))
    expect(within(extra).getByText('$2.000.000')).toBeInTheDocument()
    expect(window.localStorage.getItem('plan-de-deudas-extra')).toBe('2000000')

    const campo = within(extra).getByRole('spinbutton', { name: 'Abono extra exacto' })
    await userEvent.clear(campo)
    await userEvent.type(campo, '0')
    await waitFor(() => expect(within(extra).getByText('$0')).toBeInTheDocument())
    expect(screen.getByRole('region', { name: 'Sin deudas en' })).not.toHaveTextContent('feb 2033')

    await userEvent.click(within(extra).getByRole('button', { name: 'Usar el calculado' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Sin deudas en' })).toHaveTextContent('feb 2033'))
    expect(window.localStorage.getItem('plan-de-deudas-extra')).toBeNull()
  })

  it('an extra that cannot close every debt says so', async () => {
    await montarPlan(plan([{ ...deuda('Terraza', 2800000, 0.03), capitaliza: true }]))
    const extra = screen.getByRole('region', { name: 'Abono extra cada mes' })
    const campo = within(extra).getByRole('spinbutton', { name: 'Abono extra exacto' })
    await userEvent.clear(campo)
    await userEvent.type(campo, '0')
    await waitFor(() => expect(screen.getByRole('region', { name: 'Sin deudas en' })).toHaveTextContent('Con este abono no se cierran todas las deudas'))
  })

  it('switching the strategy recomputes and is remembered', async () => {
    await montarPlan()
    await userEvent.click(screen.getByRole('button', { name: 'Bola de nieve' }))
    expect(screen.getByRole('button', { name: 'Bola de nieve' })).toHaveAttribute('aria-pressed', 'true')
    expect(await fin()).toHaveTextContent('81 meses · intereses $85,4 M')
    expect(window.localStorage.getItem('plan-de-deudas-estrategia')).toBe('bola_de_nieve')
    expect(screen.getByText(/Este mes: \$100\.000 extra a Baby shower y \$400\.000 a Brayan\./)).toBeInTheDocument()
  })

  it('a bar per debt up to its payoff month, the 0 % ones together, with a tooltip', async () => {
    await montarPlan()
    const linea = screen.getByRole('region', { name: 'Cuándo termina cada deuda' })
    const filas = within(linea).getAllByRole('listitem')
    expect(filas).toHaveLength(6)
    expect(filas[0]).toHaveTextContent('Terraza')
    expect(filas[0]).toHaveTextContent('3 % mes')
    expect(filas[0]).toHaveTextContent('may 2027')
    expect(filas[5]).toHaveTextContent('Don Ciro y 4 sin interés')
    expect(filas[5]).toHaveTextContent('feb 2033')
    // The time axis: one label per January; Nov 2026 is too close to January 2027 to get one.
    expect([...linea.querySelectorAll('.pd-eje-anos span')].map((x) => x.textContent)).toEqual(['2027', '2028', '2029', '2030', '2031', '2032', '2033'])

    const barra = within(filas[3]).getByRole('img')
    await userEvent.hover(barra)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/^Colsubsidio · termina abr 2029 · intereses \$[\d,]+ M$/)
  })

  it('says what to do this month and where the money goes after the first close', async () => {
    await montarPlan()
    expect(
      screen.getByText('Este mes: $500.000 extra a Terraza. Cuando Terraza llegue a $0 en may 2027, ese dinero pasa a Davivienda.'),
    ).toBeInTheDocument()
  })

  it('«Ver mes a mes» opens the table and a month opens one line per debt', async () => {
    await montarPlan()
    expect(screen.queryByRole('table')).toBeNull()
    const ver = screen.getByRole('button', { name: 'Ver mes a mes' })
    expect(ver).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(ver)
    const tabla = screen.getByRole('table', { name: 'Plan mes a mes' })
    expect(within(tabla).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Mes', 'Extra a', 'Pagas', 'Interés', 'Debes'])
    expect(within(tabla).getByText('Terraza queda en $0 · el extra pasa a Davivienda')).toBeInTheDocument()
    expect(within(tabla).getByText(/· ya no debes nada$/)).toBeInTheDocument()

    const nov = within(tabla).getByRole('button', { name: 'nov 2026' })
    await userEvent.click(nov)
    expect(nov).toHaveAttribute('aria-expanded', 'true')
    const terraza = within(tabla).getByText('+$500.000 extra').closest('tr')!
    expect(terraza).toHaveTextContent('Terraza')
    expect(within(tabla).getAllByText('Davivienda').length).toBeGreaterThan(0)
  })

  it('without debts: «No tienes deudas por pagar»', async () => {
    await montarPlan(vacio)
    expect(await screen.findByText('No tienes deudas por pagar')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Sin deudas en' })).toBeNull()
  })

  it('opens with the strategy and extra this browser remembers', async () => {
    window.localStorage.setItem('plan-de-deudas-estrategia', 'bola_de_nieve')
    window.localStorage.setItem('plan-de-deudas-extra', '1000000')
    await montarPlan()
    expect(screen.getByRole('button', { name: 'Bola de nieve' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByRole('region', { name: 'Abono extra cada mes' })).getByText('$1.000.000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Usar el calculado' })).toBeEnabled()
  })
})
