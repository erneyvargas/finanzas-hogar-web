import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { FuenteDeMovimientos } from '../movimientos/fuente'
import { ErrorDelServidor, MENSAJE_GENERICO, type DatosDeMovimientos } from '../movimientos/reglas'
import { DesdeFactura } from './DesdeFactura'
import type { FuenteDeFacturas } from './fuente'
import type { LecturaDeFactura } from './reglas'

const datos: DatosDeMovimientos = {
  hogarId: 'h1',
  cuentas: [
    { id: 'efe', nombre: 'Efectivo', tipo: 'cash', viva: true },
    { id: 'nequi', nombre: 'Nequi', tipo: 'wallet', viva: true },
    { id: 'aho', nombre: 'Ahorros', tipo: 'savings', viva: true },
  ],
  categorias: [
    { id: 'hogar', nombre: 'Hogar', tipo: 'expense', nivel: 'rubro', padreId: null, color: 'musgo', viva: true },
    { id: 'mercado', nombre: 'Mercado', tipo: 'expense', nivel: 'category', padreId: 'hogar', color: null, viva: true },
    { id: 'lacteos', nombre: 'Lácteos', tipo: 'expense', nivel: 'subcategory', padreId: 'mercado', color: null, viva: true },
    { id: 'pan', nombre: 'Panadería', tipo: 'expense', nivel: 'subcategory', padreId: 'mercado', color: null, viva: true },
    { id: 'aseo', nombre: 'Aseo', tipo: 'expense', nivel: 'subcategory', padreId: 'mercado', color: null, viva: true },
    { id: 'sueldo', nombre: 'Sueldo', tipo: 'income', nivel: 'subcategory', padreId: null, color: null, viva: true },
  ],
  movimientos: [],
}

const leida = (cambios: Partial<LecturaDeFactura> = {}): LecturaDeFactura => ({
  estado: 'parsed',
  error: null,
  ocr: { merchant_name: 'D1 Tienda 452', merchant_nit: '900276962', date: '2026-11-12', total: 15300, account_id: null },
  qr: null,
  items: [
    { linea: 1, descripcion: 'Leche entera', cantidad: 2, total: 8400, categoriaSugerida: 'lacteos' },
    { linea: 2, descripcion: 'Pan tajado', cantidad: 1, total: 6900, categoriaSugerida: 'sueldo' },
  ],
  ...cambios,
})

function facturas(lecturas: LecturaDeFactura[] = [leida()], cambios: Partial<FuenteDeFacturas> = {}): FuenteDeFacturas {
  let i = 0
  return {
    subir: vi.fn(async () => {}),
    leer: vi.fn(async () => {}),
    consultar: vi.fn(async () => lecturas[Math.min(i++, lecturas.length - 1)]),
    ...cambios,
  }
}

function movimientos(ejecutar: FuenteDeMovimientos['ejecutar'] = vi.fn(async () => {})): FuenteDeMovimientos {
  return { cargar: vi.fn(), saldo: vi.fn(async () => null), ejecutar: vi.fn(ejecutar) }
}

// 20:30 UTC on Nov 15 is 15:30 in Bogotá.
const ahora = () => new Date('2026-11-15T20:30:00Z')
const foto = () => new File(['foto'], 'factura.jpg', { type: 'image/jpeg' })

function montar(f: FuenteDeFacturas = facturas(), m: FuenteDeMovimientos = movimientos()) {
  const alCerrar = vi.fn()
  const pausa = vi.fn(async () => {})
  render(<DesdeFactura datos={datos} fuente={f} movimientos={m} ahora={ahora} alCerrar={alCerrar} pausa={pausa} />)
  return { alCerrar, pausa, f, m }
}

const dialogo = () => screen.getByRole('dialog', { name: /factura/ })
const guardar = () => within(dialogo()).getByRole('button', { name: /^Guardar gasto/ })

async function subir(archivo: File = foto()) {
  await userEvent.upload(within(dialogo()).getByLabelText('Archivo de la factura'), archivo)
}

async function revisar(f?: FuenteDeFacturas, m?: FuenteDeMovimientos) {
  const r = montar(f, m)
  await subir()
  await within(dialogo()).findByLabelText('Total')
  return r
}

const ejecutadoCon = (m: FuenteDeMovimientos, n = 0) =>
  (m.ejecutar as ReturnType<typeof vi.fn>).mock.calls[n] as [string, Record<string, unknown>]

describe('registering an expense from a receipt', () => {
  it('opens on a drop zone with the focus inside', () => {
    montar()

    expect(within(dialogo()).getByRole('heading', { name: 'Registrar desde factura' })).toBeInTheDocument()
    expect(within(dialogo()).getByText('Suelta la foto o el PDF de la factura')).toBeInTheDocument()
    expect(dialogo().contains(document.activeElement)).toBe(true)
  })

  it('rejects files that are not JPG, PNG or PDF, and files over 10 MB', async () => {
    const { f } = montar()
    const usuario = userEvent.setup({ applyAccept: false })
    const entrada = within(dialogo()).getByLabelText('Archivo de la factura')

    await usuario.upload(entrada, new File(['x'], 'foto.gif', { type: 'image/gif' }))
    expect(within(dialogo()).getByRole('alert')).toHaveTextContent('Solo se leen fotos JPG o PNG y archivos PDF.')

    const grande = new File(['x'], 'grande.pdf', { type: 'application/pdf' })
    Object.defineProperty(grande, 'size', { value: 10 * 1024 * 1024 + 1 })
    await usuario.upload(entrada, grande)
    expect(within(dialogo()).getByRole('alert')).toHaveTextContent('El archivo pesa más de 10 MB.')
    expect(f.subir).not.toHaveBeenCalled()
  })

  it('uploads, reads, and shows the review with the fields read', async () => {
    let soltar = () => {}
    const f = facturas([leida()], { subir: vi.fn(() => new Promise<void>((r) => (soltar = r))) })
    montar(f)

    await subir()
    expect(within(dialogo()).getByRole('heading', { name: 'Leyendo la factura…' })).toBeInTheDocument()
    soltar()

    const total = await within(dialogo()).findByLabelText('Total')
    expect(total).toHaveValue('15.300')
    expect(within(dialogo()).getByLabelText('Comercio')).toHaveValue('D1 Tienda 452')
    expect(within(dialogo()).getByText('NIT 900276962')).toBeInTheDocument()
    expect(within(dialogo()).getByLabelText('Fecha')).toHaveTextContent('12 nov 2026')
    const id = (f.subir as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(f.leer).toHaveBeenCalledWith(id)
    expect(f.consultar).toHaveBeenCalledWith(id)
  })

  it('takes total, date and NIT from the QR over the reading', async () => {
    await revisar(facturas([leida({ qr: { valorTotal: 16000, fecha: '2026-11-10', nitEmisor: '800111222' } })]))

    expect(within(dialogo()).getByLabelText('Total')).toHaveValue('16.000')
    expect(within(dialogo()).getByText('NIT 800111222')).toBeInTheDocument()
    expect(within(dialogo()).getByLabelText('Fecha')).toHaveTextContent('10 nov 2026')
  })

  it('goes on to read the row when parse-receipt times out, and waits while it is processing', async () => {
    const f = facturas([leida({ estado: 'processing' }), leida({ estado: 'processing' }), leida()], {
      leer: vi.fn(async () => {
        throw new Error('timeout')
      }),
    })
    const { pausa } = montar(f)

    await subir()

    expect(await within(dialogo()).findByLabelText('Total')).toHaveValue('15.300')
    expect(f.consultar).toHaveBeenCalledTimes(3)
    expect(pausa).toHaveBeenCalledWith(2000)
  })

  it('gives up after about a minute of processing, and can try again', async () => {
    const f = facturas([leida({ estado: 'processing' })])
    montar(f)

    await subir()

    expect(await within(dialogo()).findByRole('alert')).toHaveTextContent('La factura está tardando')
    expect(f.consultar).toHaveBeenCalledTimes(31)
    expect(within(dialogo()).getByRole('button', { name: 'Intentar de nuevo' })).toBeInTheDocument()
  })

  it('shows why the reading failed, and tries again with the same receipt', async () => {
    const f = facturas([leida({ estado: 'failed', error: 'No se pudo leer la imagen.' }), leida()])
    montar(f)

    await subir()
    expect(await within(dialogo()).findByRole('alert')).toHaveTextContent('No se pudo leer la imagen.')

    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Intentar de nuevo' }))

    expect(await within(dialogo()).findByLabelText('Total')).toHaveValue('15.300')
    const llamadas = (f.subir as ReturnType<typeof vi.fn>).mock.calls
    expect(llamadas).toHaveLength(2)
    expect(llamadas[1][0]).toBe(llamadas[0][0])
  })

  it('needs an account to save, and preselects the one the reading suggests', async () => {
    await revisar()
    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Una para todo' }))
    await userEvent.type(within(dialogo()).getByLabelText('Categoría'), 'lác')
    await userEvent.click(within(dialogo()).getByRole('option', { name: 'Hogar › Mercado › Lácteos' }))

    expect(guardar()).toBeDisabled()
    expect(within(dialogo()).getByText('Elige la cuenta para poder guardar')).toBeInTheDocument()
    expect(within(dialogo()).queryByRole('button', { name: /Ahorros/ })).not.toBeInTheDocument()

    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Nequi' }))
    expect(guardar()).toBeEnabled()
  })

  it('preselects the suggested account when it is a live expense account', async () => {
    await revisar(facturas([leida({ ocr: { ...leida().ocr, account_id: 'nequi' } })]))

    expect(within(dialogo()).getByRole('button', { name: 'Nequi' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('saves one category for the whole receipt', async () => {
    const m = movimientos()
    const { alCerrar, f } = await revisar(facturas([leida({ ocr: { ...leida().ocr, account_id: 'efe' } })]), m)
    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Una para todo' }))
    await userEvent.type(within(dialogo()).getByLabelText('Categoría'), 'lác')
    await userEvent.click(within(dialogo()).getByRole('option', { name: 'Hogar › Mercado › Lácteos' }))
    await userEvent.type(within(dialogo()).getByLabelText('Observaciones'), ' compra ')

    await userEvent.click(guardar())

    const [funcion, params] = ejecutadoCon(m)
    expect(funcion).toBe('registrar_movimiento_de_factura')
    expect(params).toEqual({
      p_household_id: 'h1',
      p_receipt_id: (f.subir as ReturnType<typeof vi.fn>).mock.calls[0][0],
      p_account_id: 'efe',
      p_amount: 15300,
      p_category_id: 'lacteos',
      p_occurred_at: '2026-11-12T15:30:00-05:00',
      p_note: 'compra',
      p_merchant_name: 'D1 Tienda 452',
      p_merchant_nit: '900276962',
      p_partes: null,
      p_guardar_igual: false,
      p_id: expect.any(String),
    })
    expect(alCerrar).toHaveBeenCalledWith(true)
  })

  it('splits the receipt by item, one part per row', async () => {
    const m = movimientos()
    await revisar(facturas([leida({ ocr: { ...leida().ocr, account_id: 'efe' } })]), m)

    expect(within(dialogo()).getByRole('button', { name: 'Repartir por ítem' })).toHaveAttribute('aria-pressed', 'true')
    const filas = within(dialogo()).getAllByRole('row').slice(1)
    expect(filas[0]).toHaveTextContent('1Leche entera2$8.400')
    expect(within(dialogo()).getByLabelText('Categoría del ítem 1')).toHaveValue('lacteos')
    // An income category is not a valid suggestion: it is left to pick.
    expect(within(dialogo()).getByLabelText('Categoría del ítem 2')).toHaveValue('')
    expect(guardar()).toBeDisabled()

    await userEvent.selectOptions(within(dialogo()).getByLabelText('Categoría del ítem 2'), 'pan')
    await userEvent.click(guardar())

    const [, params] = ejecutadoCon(m)
    expect(params.p_category_id).toBeNull()
    expect(params.p_partes).toEqual([
      { category_id: 'lacteos', amount: 8400, note: 'Leche entera' },
      { category_id: 'pan', amount: 6900, note: 'Pan tajado' },
    ])
  })

  it('blocks saving while the items do not square, and adds the gap as an item', async () => {
    const m = movimientos()
    const lectura = leida({ ocr: { ...leida().ocr, total: 15800, account_id: 'efe' } })
    lectura.items[1].categoriaSugerida = 'pan'
    await revisar(facturas([lectura]), m)

    const aviso = within(dialogo()).getByRole('alert')
    expect(aviso).toHaveTextContent('Faltan $500')
    expect(guardar()).toBeDisabled()

    await userEvent.click(within(aviso).getByRole('button', { name: 'Agregar $500 como ítem' }))
    expect(within(dialogo()).queryByText(/Faltan/)).not.toBeInTheDocument()
    await userEvent.selectOptions(within(dialogo()).getByLabelText('Categoría del ítem 3'), 'aseo')
    await userEvent.click(guardar())

    const [, params] = ejecutadoCon(m)
    expect(params.p_amount).toBe(15800)
    expect(params.p_partes).toEqual([
      { category_id: 'lacteos', amount: 8400, note: 'Leche entera' },
      { category_id: 'pan', amount: 6900, note: 'Pan tajado' },
      { category_id: 'aseo', amount: 500, note: 'Diferencia con el total' },
    ])
  })

  it('squares the items by changing the total to their sum', async () => {
    const m = movimientos()
    const lectura = leida({ ocr: { ...leida().ocr, total: 15000, account_id: 'efe' } })
    lectura.items[1].categoriaSugerida = 'pan'
    await revisar(facturas([lectura]), m)

    const aviso = within(dialogo()).getByRole('alert')
    expect(aviso).toHaveTextContent('Sobran $300')
    await userEvent.click(within(aviso).getByRole('button', { name: 'Cambiar el total' }))

    expect(within(dialogo()).getByLabelText('Total')).toHaveValue('15.300')
    expect(guardar()).toHaveTextContent('Guardar gasto · $15.300')
    await userEvent.click(guardar())
    expect(ejecutadoCon(m)[1].p_amount).toBe(15300)
  })

  it('offers Guardar igual on a possible duplicate', async () => {
    const m = movimientos(
      vi
        .fn()
        .mockRejectedValueOnce(new ErrorDelServidor('Ya hay un gasto igual.', 'posible_duplicado', {
          movimientoId: 'x',
          fecha: '',
          comercio: null,
        }))
        .mockResolvedValueOnce(undefined),
    )
    const lectura = leida({ ocr: { ...leida().ocr, account_id: 'efe' } })
    lectura.items[1].categoriaSugerida = 'pan'
    const { alCerrar } = await revisar(facturas([lectura]), m)

    await userEvent.click(guardar())
    const aviso = await within(dialogo()).findByText('Ya hay un gasto igual.')
    await userEvent.click(within(aviso.closest('[role=alert]') as HTMLElement).getByRole('button', { name: 'Guardar igual' }))

    expect(ejecutadoCon(m, 1)[1].p_guardar_igual).toBe(true)
    expect(alCerrar).toHaveBeenCalledWith(true)
  })

  it('sends the same id when a save is retried', async () => {
    const m = movimientos(
      vi.fn().mockRejectedValueOnce(new ErrorDelServidor(MENSAJE_GENERICO, null)).mockResolvedValueOnce(undefined),
    )
    const lectura = leida({ ocr: { ...leida().ocr, account_id: 'efe' } })
    lectura.items[1].categoriaSugerida = 'pan'
    await revisar(facturas([lectura]), m)

    await userEvent.click(guardar())
    expect(await within(dialogo()).findByText(MENSAJE_GENERICO)).toBeInTheDocument()
    await userEvent.click(guardar())

    expect(ejecutadoCon(m, 1)[1].p_id).toBe(ejecutadoCon(m, 0)[1].p_id)
  })

  it('closes with Escape, but not while saving', async () => {
    let soltar = () => {}
    const m = movimientos(() => new Promise<void>((r) => (soltar = r)))
    const lectura = leida({ ocr: { ...leida().ocr, account_id: 'efe' } })
    lectura.items[1].categoriaSugerida = 'pan'
    const { alCerrar } = await revisar(facturas([lectura]), m)

    await userEvent.click(guardar())
    await userEvent.keyboard('{Escape}')
    expect(alCerrar).not.toHaveBeenCalled()

    soltar()
    await waitFor(() => expect(alCerrar).toHaveBeenCalledWith(true))
  })

  it('closes with Escape from the drop zone', async () => {
    const { alCerrar } = montar()
    await userEvent.keyboard('{Escape}')
    expect(alCerrar).toHaveBeenCalledWith(false)
  })
})

const datosDeNomina: DatosDeMovimientos = {
  ...datos,
  categorias: [
    { id: 'erney', nombre: 'Erney', tipo: 'income', nivel: 'rubro', padreId: null, color: 'selva', viva: true },
    { id: 'mct', nombre: 'Salario MCT', tipo: 'income', nivel: 'category', padreId: 'erney', color: null, viva: true },
    { id: 'sueldo', nombre: 'Sueldo', tipo: 'income', nivel: 'subcategory', padreId: 'mct', color: null, viva: true },
    { id: 'bono', nombre: 'Bono', tipo: 'income', nivel: 'subcategory', padreId: 'mct', color: null, viva: true },
    { id: 'seg', nombre: 'Seguridad social', tipo: 'expense', nivel: 'rubro', padreId: null, color: 'laguna', viva: true },
    { id: 'salud', nombre: 'Salud', tipo: 'expense', nivel: 'subcategory', padreId: 'seg', color: null, viva: true },
    { id: 'pension', nombre: 'Pensión', tipo: 'expense', nivel: 'subcategory', padreId: 'seg', color: null, viva: true },
    { id: 'coop', nombre: 'Cooperativa', tipo: 'expense', nivel: 'subcategory', padreId: 'seg', color: null, viva: true },
  ],
}

const nomina = (cambios: Partial<LecturaDeFactura> = {}): LecturaDeFactura => ({
  estado: 'parsed',
  error: null,
  ocr: { merchant_name: 'MCT S.A.S.', merchant_nit: '830004861', date: '2026-10-31', total: 3439988, account_id: 'aho' },
  qr: null,
  items: [
    { linea: 1, descripcion: 'Salario', cantidad: null, total: 2771600, categoriaSugerida: 'sueldo', tipo: 'income' },
    { linea: 2, descripcion: 'Beneficio Familia y Recreación', cantidad: null, total: 1500000, categoriaSugerida: 'bono', tipo: 'income' },
    { linea: 3, descripcion: 'Salud Empleado', cantidad: null, total: 110900, categoriaSugerida: 'salud', tipo: 'expense' },
    { linea: 4, descripcion: 'Pensión Empleado', cantidad: null, total: 110900, categoriaSugerida: 'pension', tipo: 'expense' },
    { linea: 5, descripcion: 'Coomerpark', cantidad: null, total: 14750, categoriaSugerida: 'coop', tipo: 'expense' },
    { linea: 6, descripcion: 'Libranza Colsubsidio', cantidad: null, total: 462562, categoriaSugerida: null, tipo: 'expense' },
    { linea: 7, descripcion: 'Libranzas Davivienda', cantidad: null, total: 132500, categoriaSugerida: null, tipo: 'expense' },
  ],
  ...cambios,
})

const deudasAbiertas = [
  { id: 'col', nombre: '  LIBRANZA  Colsubsídio', cuotasRestantes: 18 },
  { id: 'dav', nombre: 'Crédito Davivienda', cuotasRestantes: null },
  // Named like a line that already has a category: it must not take it.
  { id: 'salud-d', nombre: 'Salud empleado', cuotasRestantes: 3 },
]

function nominas(lectura: LecturaDeFactura = nomina()): FuenteDeFacturas {
  return facturas([lectura], { deudas: vi.fn(async () => deudasAbiertas) })
}

async function revisarNomina(f: FuenteDeFacturas = nominas(), m: FuenteDeMovimientos = movimientos()) {
  const alCerrar = vi.fn()
  render(<DesdeFactura datos={datosDeNomina} fuente={f} movimientos={m} ahora={ahora} alCerrar={alCerrar} pausa={async () => {}} />)
  await subir()
  await within(dialogo()).findByText('Comprobante de nómina')
  return { alCerrar, f, m }
}

const ingresos = () => within(dialogo()).getByRole('region', { name: 'Ingresos' })
const descuentos = () => within(dialogo()).getByRole('region', { name: 'Descuentos' })
const barra = () => within(dialogo()).getByTestId('barra-neto')
const guardarNomina = () => within(dialogo()).getByRole('button', { name: /^Guardar nómina/ })
const categoriaDe = (descripcion: string) => within(dialogo()).getByLabelText(`Categoría de ${descripcion}`)

describe('registering a payslip from a receipt', () => {
  it('shows the income and the deductions in two tables, with the net that squares', async () => {
    await revisarNomina()

    expect(within(dialogo()).getByLabelText('Empleador')).toHaveValue('MCT S.A.S.')
    expect(within(dialogo()).getByText('NIT 830004861')).toBeInTheDocument()
    expect(within(dialogo()).getByLabelText('Fecha')).toHaveTextContent('31 oct 2026')
    expect(within(ingresos()).getByText('$4.271.600')).toBeInTheDocument()
    expect(within(ingresos()).getByText('Salario')).toBeInTheDocument()
    expect(within(ingresos()).getByText('Beneficio Familia y Recreación')).toBeInTheDocument()
    expect(within(descuentos()).getByText('$831.612')).toBeInTheDocument()
    for (const d of ['Salud Empleado', 'Pensión Empleado', 'Coomerpark', 'Libranza Colsubsidio', 'Libranzas Davivienda']) {
      expect(within(descuentos()).getByText(d)).toBeInTheDocument()
    }
    expect(barra()).toHaveTextContent('$4.271.600−$831.612=$3.439.988')
    expect(barra()).toHaveTextContent('cuadra con el comprobante')
    expect(categoriaDe('Salario')).toHaveValue('c:sueldo')
    // The account the reading suggests takes income, so it comes picked.
    expect(within(dialogo()).getByRole('button', { name: 'Ahorros' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialogo()).queryByLabelText('Total')).not.toBeInTheDocument()
  })

  it('assigns a deduction to the debt named like it, and offers only the open debts', async () => {
    const { f } = await revisarNomina()

    expect(f.deudas).toHaveBeenCalled()
    const colsubsidio = categoriaDe('Libranza Colsubsidio')
    expect(colsubsidio).toHaveValue('d:col')
    expect(within(colsubsidio).getByRole('option', { name: 'LIBRANZA Colsubsídio · quedan 18 cuotas' })).toBeInTheDocument()
    expect(within(colsubsidio).getByRole('option', { name: 'Crédito Davivienda' })).toBeInTheDocument()
    expect(categoriaDe('Libranzas Davivienda')).toHaveValue('')
    expect(categoriaDe('Salud Empleado')).toHaveValue('c:salud')
    // Income lines never offer debts.
    expect(within(categoriaDe('Salario')).queryByRole('option', { name: /Crédito Davivienda/ })).not.toBeInTheDocument()
  })

  it('moves a line between the tables with its switch, and the net follows', async () => {
    await revisarNomina()

    const tipo = within(dialogo()).getByRole('group', { name: 'Tipo de Beneficio Familia y Recreación' })
    await userEvent.click(within(tipo).getByRole('button', { name: 'Desc.' }))

    expect(within(descuentos()).getByText('Beneficio Familia y Recreación')).toBeInTheDocument()
    expect(within(ingresos()).queryByText('Beneficio Familia y Recreación')).not.toBeInTheDocument()
    expect(barra()).toHaveTextContent('$2.771.600−$2.331.612=$439.988')
    expect(barra()).toHaveTextContent('$3.000.000 de menos · el comprobante dice $3.439.988')
    // An income category does not fit a deduction: it is left to pick.
    expect(categoriaDe('Beneficio Familia y Recreación')).toHaveValue('')
    expect(guardarNomina()).toBeDisabled()

    // The row now lives in the other table: find its switch again.
    const otraVez = within(descuentos()).getByRole('group', { name: 'Tipo de Beneficio Familia y Recreación' })
    await userEvent.click(within(otraVez).getByRole('button', { name: 'Ingreso' }))
    expect(barra()).toHaveTextContent('cuadra con el comprobante')
  })

  it('blocks saving while the net does not square with the payslip', async () => {
    const m = movimientos()
    await revisarNomina(nominas(nomina({ ocr: { ...nomina().ocr, total: 3439000 } })), m)
    await userEvent.selectOptions(categoriaDe('Libranzas Davivienda'), 'd:dav')

    expect(barra()).toHaveTextContent('$988 de más · el comprobante dice $3.439.000')
    expect(guardarNomina()).toBeDisabled()
    expect(within(dialogo()).getByText('El neto no cuadra con el comprobante')).toBeInTheDocument()
  })

  it('blocks saving while a line has neither a category nor a debt', async () => {
    await revisarNomina()

    expect(guardarNomina()).toBeDisabled()
    expect(within(dialogo()).getByText('Elige la categoría o la deuda de cada línea')).toBeInTheDocument()

    await userEvent.selectOptions(categoriaDe('Libranzas Davivienda'), 'd:dav')
    expect(guardarNomina()).toBeEnabled()
  })

  it('saves the income, the deductions and the debt payments with the net', async () => {
    const m = movimientos()
    const { f, alCerrar } = await revisarNomina(undefined, m)
    await userEvent.selectOptions(categoriaDe('Libranzas Davivienda'), 'd:dav')
    expect(within(dialogo()).getByText('Se guardará: 1 ingreso, 1 gasto y 2 abonos')).toBeInTheDocument()
    expect(guardarNomina()).toHaveTextContent('Guardar nómina · neto $3.439.988')

    await userEvent.click(guardarNomina())

    const [funcion, params] = ejecutadoCon(m)
    expect(funcion).toBe('registrar_nomina_de_factura')
    expect(params).toEqual({
      p_household_id: 'h1',
      p_receipt_id: (f.subir as ReturnType<typeof vi.fn>).mock.calls[0][0],
      p_account_id: 'aho',
      p_occurred_at: '2026-10-31T15:30:00-05:00',
      p_note: null,
      p_merchant_name: 'MCT S.A.S.',
      p_merchant_nit: '830004861',
      p_ingresos: [
        { category_id: 'sueldo', amount: 2771600, note: 'Salario' },
        { category_id: 'bono', amount: 1500000, note: 'Beneficio Familia y Recreación' },
      ],
      p_gastos: [
        { category_id: 'salud', amount: 110900, note: 'Salud Empleado' },
        { category_id: 'pension', amount: 110900, note: 'Pensión Empleado' },
        { category_id: 'coop', amount: 14750, note: 'Coomerpark' },
      ],
      p_abonos: [
        { debt_id: 'col', amount: 462562 },
        { debt_id: 'dav', amount: 132500 },
      ],
      p_neto: 3439988,
      p_guardar_igual: false,
      p_id: expect.any(String),
    })
    expect(alCerrar).toHaveBeenCalledWith(true)
  })

  it('needs an account that takes income', async () => {
    await revisarNomina(nominas(nomina({ ocr: { ...nomina().ocr, account_id: null } })))
    await userEvent.selectOptions(categoriaDe('Libranzas Davivienda'), 'd:dav')

    expect(guardarNomina()).toBeDisabled()
    expect(within(dialogo()).getByText('Elige la cuenta para poder guardar')).toBeInTheDocument()
    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Ahorros' }))
    expect(guardarNomina()).toBeEnabled()
  })

  it('offers Guardar igual on a possible duplicate', async () => {
    const m = movimientos(
      vi
        .fn()
        .mockRejectedValueOnce(
          new ErrorDelServidor('Ya hay un ingreso igual.', 'posible_duplicado', { movimientoId: 'x', fecha: '', comercio: null }),
        )
        .mockResolvedValueOnce(undefined),
    )
    const { alCerrar } = await revisarNomina(undefined, m)
    await userEvent.selectOptions(categoriaDe('Libranzas Davivienda'), 'd:dav')

    await userEvent.click(guardarNomina())
    const aviso = await within(dialogo()).findByText('Ya hay un ingreso igual.')
    await userEvent.click(within(aviso.closest('[role=alert]') as HTMLElement).getByRole('button', { name: 'Guardar igual' }))

    expect(ejecutadoCon(m, 1)[0]).toBe('registrar_nomina_de_factura')
    expect(ejecutadoCon(m, 1)[1].p_guardar_igual).toBe(true)
    expect(alCerrar).toHaveBeenCalledWith(true)
  })

  it('sends the same id when a save is retried', async () => {
    const m = movimientos(
      vi.fn().mockRejectedValueOnce(new ErrorDelServidor(MENSAJE_GENERICO, null)).mockResolvedValueOnce(undefined),
    )
    await revisarNomina(undefined, m)
    await userEvent.selectOptions(categoriaDe('Libranzas Davivienda'), 'd:dav')

    await userEvent.click(guardarNomina())
    expect(await within(dialogo()).findByText(MENSAJE_GENERICO)).toBeInTheDocument()
    await userEvent.click(guardarNomina())

    expect(ejecutadoCon(m, 1)[1].p_id).toBe(ejecutadoCon(m, 0)[1].p_id)
  })

  it('keeps a purchase receipt on the expense form', async () => {
    const m = movimientos()
    const compra = leida({ ocr: { ...leida().ocr, account_id: 'efe' } })
    compra.items = compra.items.map((i) => ({ ...i, tipo: 'expense', categoriaSugerida: i.linea === 1 ? 'lacteos' : 'pan' }))
    const f = facturas([compra], { deudas: vi.fn(async () => deudasAbiertas) })
    await revisar(f, m)

    expect(within(dialogo()).queryByText('Comprobante de nómina')).not.toBeInTheDocument()
    expect(f.deudas).not.toHaveBeenCalled()
    await userEvent.click(guardar())
    expect(ejecutadoCon(m)[0]).toBe('registrar_movimiento_de_factura')
  })
})
