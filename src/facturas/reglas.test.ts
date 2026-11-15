import { describe, expect, it } from 'vitest'
import type { CategoriaDeMovimiento, Cuenta } from '../movimientos/reglas'
import {
  camposDeFactura,
  categoriaSugerida,
  cuentaSugerida,
  diferenciaDe,
  medidaReducida,
  partesDe,
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
