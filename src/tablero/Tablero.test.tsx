import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProveedorDeSesion, type ClienteDeAuth } from '../auth/sesion'
import { Tablero } from './Tablero'
import type { FuenteDelTablero } from './fuente'
import type { FuenteDeFacturas } from '../facturas/fuente'
import type { FuenteDeMovimientos } from '../movimientos/fuente'
import type { DatosDeMovimientos } from '../movimientos/reglas'
import type { FuenteDeCuentas } from '../cuentas/fuente'
import type { CuentaConSaldo, DatosDeCuentas } from '../cuentas/reglas'
import type { FuenteDePorVencer } from '../porvencer/fuente'
import type { DatosDePorVencer } from '../porvencer/reglas'

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

  it('keeps the other tabs working', async () => {
    await montarPv(movimientos())
    await userEvent.click(screen.getByRole('tab', { name: 'Resumen' }))
    expect(await screen.findByRole('region', { name: 'Gastado en octubre' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Calendario de noviembre' })).not.toBeInTheDocument()
  })
})
