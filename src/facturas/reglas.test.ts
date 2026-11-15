import { describe, expect, it } from 'vitest'
import type { CategoriaDeMovimiento, Cuenta } from '../movimientos/reglas'
import {
  camposDeFactura,
  categoriaSugerida,
  cuentaSugerida,
  diferenciaDe,
  esNomina,
  lineasDeNomina,
  medidaReducida,
  netoDelComprobante,
  partesDe,
  partesDeNomina,
  sugerirDeudas,
  totalesDeNomina,
  type ItemDeFactura,
  type LineaDeNomina,
  problemaDelArchivo,
  textoDeMonto,
  type LecturaDeFactura,
} from './reglas'

const lectura = (cambios: Partial<LecturaDeFactura> = {}): LecturaDeFactura => ({
  estado: 'parsed',
  error: null,
  ocr: { merchant_name: 'D1 Tienda 452', merchant_nit: '900276962', date: '2026-11-12', total: 85300, account_id: null },
  qr: null,
  items: [
    { linea: 1, descripcion: 'Leche', cantidad: 2, total: 8400, categoriaSugerida: null },
    { linea: 2, descripcion: 'Pan', cantidad: 1, total: 6900, categoriaSugerida: null },
  ],
  ...cambios,
})

describe('the fields read from a receipt', () => {
  it('takes total, date and NIT from the QR when it has them', () => {
    const c = camposDeFactura(
      lectura({ qr: { valorTotal: 90000, fecha: '2026-11-10', nitEmisor: '800111222' } }),
    )
    expect(c).toEqual({ total: 90000, dia: '2026-11-10', nit: '800111222', comercio: 'D1 Tienda 452' })
  })

  it('falls back to the OCR reading without a QR', () => {
    expect(camposDeFactura(lectura())).toEqual({
      total: 85300,
      dia: '2026-11-12',
      nit: '900276962',
      comercio: 'D1 Tienda 452',
    })
  })

  it('sums the items when neither the QR nor the OCR has a total', () => {
    const c = camposDeFactura(lectura({ ocr: { merchant_name: null, total: null, date: null } }))
    expect(c.total).toBe(15300)
    expect(c.dia).toBeNull()
    expect(c.comercio).toBeNull()
  })

  it('ignores a date that is not a day', () => {
    expect(camposDeFactura(lectura({ ocr: { date: 'ayer' } })).dia).toBeNull()
    expect(camposDeFactura(lectura({ ocr: { date: '2026-11-12T10:00:00' } })).dia).toBe('2026-11-12')
  })
})

describe('the account the reading suggests', () => {
  const cuentas: Cuenta[] = [
    { id: 'efe', nombre: 'Efectivo', tipo: 'cash', viva: true },
    { id: 'aho', nombre: 'Ahorros', tipo: 'savings', viva: true },
    { id: 'vieja', nombre: 'Vieja', tipo: 'debit', viva: false },
  ]

  it('is kept only when it is a live account that takes expenses', () => {
    expect(cuentaSugerida(lectura({ ocr: { account_id: 'efe' } }), cuentas)).toBe('efe')
    expect(cuentaSugerida(lectura({ ocr: { account_id: 'aho' } }), cuentas)).toBe('')
    expect(cuentaSugerida(lectura({ ocr: { account_id: 'vieja' } }), cuentas)).toBe('')
    expect(cuentaSugerida(lectura({ ocr: { account_id: 'otra' } }), cuentas)).toBe('')
    expect(cuentaSugerida(lectura(), cuentas)).toBe('')
  })
})

describe('the category an item suggests', () => {
  const categorias: CategoriaDeMovimiento[] = [
    { id: 'hogar', nombre: 'Hogar', tipo: 'expense', nivel: 'rubro', padreId: null, color: null, viva: true },
    { id: 'aseo', nombre: 'Aseo', tipo: 'expense', nivel: 'subcategory', padreId: 'hogar', color: null, viva: true },
    { id: 'vieja', nombre: 'Vieja', tipo: 'expense', nivel: 'subcategory', padreId: 'hogar', color: null, viva: false },
    { id: 'sueldo', nombre: 'Sueldo', tipo: 'income', nivel: 'subcategory', padreId: null, color: null, viva: true },
  ]

  it('is kept only when it is a live expense subcategory', () => {
    expect(categoriaSugerida('aseo', categorias)).toBe('aseo')
    for (const id of ['hogar', 'vieja', 'sueldo', 'otra', null]) expect(categoriaSugerida(id, categorias)).toBe('')
  })
})

describe('squaring the items with the total', () => {
  it('is the total minus the items, to the cent', () => {
    expect(diferenciaDe(85300, [8400, 6900, 70000])).toBe(0)
    expect(diferenciaDe(85300, [84800])).toBe(500)
    expect(diferenciaDe(85300, [85300.5])).toBe(-0.5)
    expect(diferenciaDe(0.3, [0.1, 0.2])).toBe(0)
  })
})

describe('the parts sent to the server', () => {
  it('has one part per item with an amount, its category and its description', () => {
    expect(
      partesDe([
        { descripcion: 'Leche', total: 8400, categoriaId: 'lacteos' },
        { descripcion: 'Bolsa', total: null, categoriaId: '' },
        { descripcion: 'Pan', total: 6900, categoriaId: 'pan' },
      ]),
    ).toEqual([
      { category_id: 'lacteos', amount: 8400, note: 'Leche' },
      { category_id: 'pan', amount: 6900, note: 'Pan' },
    ])
  })

  it('is null while an item with an amount has no category', () => {
    expect(partesDe([{ descripcion: 'Leche', total: 8400, categoriaId: '' }])).toBeNull()
  })
})

describe('the file to read', () => {
  const archivo = (nombre: string, tipo: string, tamano = 1000) => {
    const f = new File(['x'], nombre, { type: tipo })
    Object.defineProperty(f, 'size', { value: tamano })
    return f
  }

  it('takes JPG, PNG and PDF up to 10 MB', () => {
    expect(problemaDelArchivo(archivo('a.jpg', 'image/jpeg'))).toBeNull()
    expect(problemaDelArchivo(archivo('a.png', 'image/png'))).toBeNull()
    expect(problemaDelArchivo(archivo('a.pdf', 'application/pdf'))).toBeNull()
    expect(problemaDelArchivo(archivo('A.JPEG', ''))).toBeNull()
    expect(problemaDelArchivo(archivo('a.pdf', 'application/pdf', 10 * 1024 * 1024))).toBeNull()
  })

  it('rejects other types and bigger files with a Spanish message', () => {
    expect(problemaDelArchivo(archivo('a.gif', 'image/gif'))).toBe('Solo se leen fotos JPG o PNG y archivos PDF.')
    expect(problemaDelArchivo(archivo('a.pdf', 'application/pdf', 10 * 1024 * 1024 + 1))).toBe(
      'El archivo pesa más de 10 MB. Prueba con una foto más liviana.',
    )
  })
})

describe('the photo size sent', () => {
  it('brings the long side down to 1600 px and never enlarges', () => {
    expect(medidaReducida(4000, 3000, 1600)).toEqual({ ancho: 1600, alto: 1200 })
    expect(medidaReducida(3000, 4000, 1600)).toEqual({ ancho: 1200, alto: 1600 })
    expect(medidaReducida(800, 600, 1600)).toEqual({ ancho: 800, alto: 600 })
  })
})

describe('an amount written in a field', () => {
  it('groups thousands and keeps cents with a comma', () => {
    expect(textoDeMonto(85300)).toBe('85.300')
    expect(textoDeMonto(85300.5)).toBe('85.300,50')
  })
})

const item = (linea: number, descripcion: string, total: number, tipo: string | null, categoriaSugerida: string | null = null): ItemDeFactura => ({
  linea,
  descripcion,
  cantidad: null,
  total,
  categoriaSugerida,
  tipo,
})

const categoriasDeNomina: CategoriaDeMovimiento[] = [
  { id: 'sueldo', nombre: 'Sueldo', tipo: 'income', nivel: 'subcategory', padreId: null, color: null, viva: true },
  { id: 'salud', nombre: 'Salud', tipo: 'expense', nivel: 'subcategory', padreId: null, color: null, viva: true },
]

const linea = (cambios: Partial<LineaDeNomina>): LineaDeNomina => ({
  clave: 'l1',
  descripcion: 'Línea',
  monto: 0,
  signo: 'descuento',
  categoriaId: '',
  deudaId: '',
  ...cambios,
})

describe('telling a payslip from a purchase', () => {
  it('is a payslip only with an income line and another line', () => {
    expect(esNomina([item(1, 'Salario', 100, 'income'), item(2, 'Salud', 10, 'expense')])).toBe(true)
    // A line read before `kind` existed is an expense, as the phone reads it.
    expect(esNomina([item(1, 'Salario', 100, 'income'), item(2, 'Salud', 10, null)])).toBe(true)
    expect(esNomina([item(1, 'Salario', 100, 'income')])).toBe(false)
    expect(esNomina([item(1, 'Leche', 100, 'expense'), item(2, 'Pan', 10, null)])).toBe(false)
    expect(esNomina([])).toBe(false)
  })
})

describe('the lines of a payslip', () => {
  it('puts income lines on the income side and keeps only suggestions of the right kind', () => {
    const lineas = lineasDeNomina(
      [item(1, 'Salario', 2771600, 'income', 'salud'), item(2, 'Salud', 110900, 'expense', 'salud'), item(3, 'Vacío', 0, 'expense')],
      categoriasDeNomina,
      [],
    )
    expect(lineas).toEqual([
      { clave: 'l1', descripcion: 'Salario', monto: 2771600, signo: 'ingreso', categoriaId: '', deudaId: '' },
      { clave: 'l2', descripcion: 'Salud', monto: 110900, signo: 'descuento', categoriaId: 'salud', deudaId: '' },
    ])
  })
})

describe('suggesting the debt a deduction pays', () => {
  const deudas = [
    { id: 'col', nombre: '  LIBRANZA   Colsubsídio ', cuotasRestantes: 18 },
    { id: 'salud', nombre: 'Salud', cuotasRestantes: null },
  ]

  it('matches the name ignoring case, accents and extra spaces', () => {
    const [l] = sugerirDeudas([linea({ descripcion: 'Libranza colsubsidio' })], deudas)
    expect(l.deudaId).toBe('col')
  })

  it('needs the whole name, and leaves unmatched lines alone', () => {
    const [l] = sugerirDeudas([linea({ descripcion: 'Libranza Colsubsidio 2' })], deudas)
    expect(l.deudaId).toBe('')
  })

  it('never touches income lines or lines already classified', () => {
    const lineas = sugerirDeudas(
      [
        linea({ clave: 'a', descripcion: 'Salud', signo: 'ingreso' }),
        linea({ clave: 'b', descripcion: 'Salud', categoriaId: 'salud' }),
        linea({ clave: 'c', descripcion: 'Salud', deudaId: 'otra' }),
      ],
      deudas,
    )
    expect(lineas.map((l) => l.deudaId)).toEqual(['', '', 'otra'])
  })
})

describe('the totals and the net of a payslip', () => {
  const mct = [
    linea({ clave: '1', descripcion: 'Salario', monto: 2771600, signo: 'ingreso', categoriaId: 'sueldo' }),
    linea({ clave: '2', descripcion: 'Beneficio', monto: 1500000, signo: 'ingreso', categoriaId: 'bono' }),
    linea({ clave: '3', descripcion: 'Salud', monto: 110900, categoriaId: 'salud' }),
    linea({ clave: '4', descripcion: 'Pensión', monto: 110900, categoriaId: 'pension' }),
    linea({ clave: '5', descripcion: 'Coomerpark', monto: 14750, categoriaId: 'coop' }),
    linea({ clave: '6', descripcion: 'Libranza Colsubsidio', monto: 462562, deudaId: 'col' }),
    linea({ clave: '7', descripcion: 'Libranzas Davivienda', monto: 132500, deudaId: 'dav' }),
  ]

  it('sums each side to the cent', () => {
    expect(totalesDeNomina(mct)).toEqual({ ingresos: 4271600, descuentos: 831612, neto: 3439988 })
    expect(totalesDeNomina([linea({ monto: 0.1, signo: 'ingreso' }), linea({ monto: 0.2, signo: 'ingreso' })]).ingresos).toBe(0.3)
  })

  it('reads the net on paper from the QR, then the reading, never from the items', () => {
    const base = lectura()
    expect(netoDelComprobante({ ...base, qr: { valorTotal: 3439988 } })).toBe(3439988)
    expect(netoDelComprobante({ ...base, ocr: { total: 3439000 } })).toBe(3439000)
    expect(netoDelComprobante({ ...base, ocr: {}, qr: null })).toBeNull()
  })

  it('builds the income, expense and debt payment lists', () => {
    expect(partesDeNomina(mct)).toEqual({
      ingresos: [
        { category_id: 'sueldo', amount: 2771600, note: 'Salario' },
        { category_id: 'bono', amount: 1500000, note: 'Beneficio' },
      ],
      gastos: [
        { category_id: 'salud', amount: 110900, note: 'Salud' },
        { category_id: 'pension', amount: 110900, note: 'Pensión' },
        { category_id: 'coop', amount: 14750, note: 'Coomerpark' },
      ],
      abonos: [
        { debt_id: 'col', amount: 462562 },
        { debt_id: 'dav', amount: 132500 },
      ],
    })
  })

  it('has no lists while a line has neither a category nor a debt', () => {
    expect(partesDeNomina([...mct, linea({ clave: '8', monto: 10 })])).toBeNull()
    expect(partesDeNomina([...mct, linea({ clave: '8', monto: 10, signo: 'ingreso' })])).toBeNull()
  })
})
