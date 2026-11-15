import { miles } from '../core/formato'
import { categoriasPara, cuentasPara, type CategoriaDeMovimiento, type Cuenta } from '../movimientos/reglas'

/**
 * What the web needs to turn a receipt read by `parse-receipt` into an
 * expense. The field rules are the phone's: the DIAN QR wins over the
 * model's reading on total, date and NIT. The server function
 * `registrar_movimiento_de_factura` (migration 0046) guards the money.
 */

/** The part of `receipts.ocr_raw` this form reads (`Extraccion` in parse-receipt). */
export interface LecturaOcr {
  merchant_name?: string | null
  merchant_nit?: string | null
  date?: string | null
  total?: number | null
  account_id?: string | null
}

/** The part of `receipts.qr_parsed` this form reads (`QrDian`). */
export interface LecturaQr {
  valorTotal?: number | null
  fecha?: string | null
  nitEmisor?: string | null
}

/** A `receipt_items` row. */
export interface ItemDeFactura {
  linea: number
  descripcion: string
  cantidad: number | null
  total: number | null
  categoriaSugerida: string | null
}

/** The receipt row and its items as they stand on the server. */
export interface LecturaDeFactura {
  /** `uploaded`, `processing`, `parsed` or `failed`. */
  estado: string
  error: string | null
  ocr: LecturaOcr | null
  qr: LecturaQr | null
  items: ItemDeFactura[]
}

export interface CamposDeFactura {
  total: number
  /** `YYYY-MM-DD`, or `null` when nothing readable came. */
  dia: string | null
  nit: string | null
  comercio: string | null
}

const aCentavos = (n: number) => Math.round(n * 100)
const numero = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? n : null)
const diaDe = (texto: string | null | undefined): string | null => {
  const dia = texto?.slice(0, 10) ?? ''
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : null
}
const texto = (t: string | null | undefined) => (t && t.trim() ? t.trim() : null)

/** The sum of the item totals, to the cent. */
export const sumaDe = (montos: (number | null)[]) => montos.reduce<number>((s, m) => s + aCentavos(m ?? 0), 0) / 100

/** Total, date, NIT and merchant, with the phone's precedence. */
export function camposDeFactura(l: LecturaDeFactura): CamposDeFactura {
  const total =
    numero(l.qr?.valorTotal) ?? numero(l.ocr?.total) ?? sumaDe(l.items.map((i) => i.total))
  return {
    total,
    dia: diaDe(l.qr?.fecha) ?? diaDe(l.ocr?.date),
    nit: texto(l.qr?.nitEmisor) ?? texto(l.ocr?.merchant_nit),
    comercio: texto(l.ocr?.merchant_name),
  }
}

/** The account the model read on the receipt, only if it can pay an expense; else `''`. */
export function cuentaSugerida(l: LecturaDeFactura, cuentas: Cuenta[]): string {
  const id = l.ocr?.account_id
  return id && cuentasPara('expense', cuentas).some((c) => c.id === id) ? id : ''
}

/** The suggested category, only if it is a live expense subcategory; else `''`. */
export function categoriaSugerida(id: string | null, categorias: CategoriaDeMovimiento[]): string {
  return id && categoriasPara('expense', categorias).some((c) => c.id === id) ? id : ''
}

/** Total minus the items, to the cent: positive when items are missing, negative when they exceed it. */
export function diferenciaDe(total: number, montos: (number | null)[]): number {
  return (aCentavos(total) - aCentavos(sumaDe(montos))) / 100
}

export interface FilaDeReparto {
  descripcion: string
  total: number | null
  categoriaId: string
}

export interface Parte {
  category_id: string
  amount: number
  note: string | null
}

/**
 * `p_partes` for the server: one part per item with an amount. `null`
 * while an item with an amount still has no category.
 */
export function partesDe(filas: FilaDeReparto[]): Parte[] | null {
  const conMonto = filas.filter((f) => (f.total ?? 0) > 0)
  if (conMonto.some((f) => !f.categoriaId)) return null
  return conMonto.map((f) => ({ category_id: f.categoriaId, amount: f.total!, note: texto(f.descripcion) }))
}

export const TAMANO_MAXIMO = 10 * 1024 * 1024

/** `jpg`, `png` or `pdf` by type, or by name when the browser gives no type. */
export function extensionDe(archivo: File): 'jpg' | 'png' | 'pdf' | null {
  const porTipo: Record<string, 'jpg' | 'png' | 'pdf'> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'application/pdf': 'pdf',
  }
  if (archivo.type) return porTipo[archivo.type] ?? null
  const ext = archivo.name.split('.').pop()?.toLowerCase()
  return ext === 'jpg' || ext === 'jpeg' ? 'jpg' : ext === 'png' ? 'png' : ext === 'pdf' ? 'pdf' : null
}

/** Why [archivo] cannot be read, or `null` when it can. */
export function problemaDelArchivo(archivo: File): string | null {
  if (!extensionDe(archivo)) return 'Solo se leen fotos JPG o PNG y archivos PDF.'
  if (archivo.size > TAMANO_MAXIMO) return 'El archivo pesa más de 10 MB. Prueba con una foto más liviana.'
  return null
}

/** The size of a photo whose long side is at most [lado]; never enlarged. */
export function medidaReducida(ancho: number, alto: number, lado: number): { ancho: number; alto: number } {
  const escala = Math.min(1, lado / Math.max(ancho, alto))
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) }
}

/** `85.300`, or `85.300,50` with cents: what `leerMonto` reads back. */
export function textoDeMonto(n: number): string {
  const centavos = Math.abs(aCentavos(n)) % 100
  return centavos === 0 ? miles(n) : `${miles(Math.trunc(n))},${String(centavos).padStart(2, '0')}`
}
