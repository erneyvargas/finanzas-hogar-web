import { miles } from '../core/formato'
import { normalizarNombre } from '../movimientos/historial'
import { categoriasPara, cuentasPara, type CategoriaDeMovimiento, type Cuenta, type Tipo } from '../movimientos/reglas'

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
  /**
   * `receipt_items.kind` as the model read it: `income`, `expense`, or
   * anything else. Lines read before migration 0014 have none and count
   * as expenses, as on the phone.
   */
  tipo?: string | null
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

/** The account the model read on the receipt, only if it takes a movement of [tipo]; else `''`. */
export function cuentaSugerida(l: LecturaDeFactura, cuentas: Cuenta[], tipo: Tipo = 'expense'): string {
  const id = l.ocr?.account_id
  return id && cuentasPara(tipo, cuentas).some((c) => c.id === id) ? id : ''
}

/** The suggested category, only if it is a live subcategory of [tipo]; else `''`. */
export function categoriaSugerida(
  id: string | null,
  categorias: CategoriaDeMovimiento[],
  tipo: Tipo = 'expense',
): string {
  return id && categoriasPara(tipo, categorias).some((c) => c.id === id) ? id : ''
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

/**
 * A payslip (comprobante de nómina) brings what comes in and what is
 * deducted on the same paper: at least one `income` line and one other.
 * There is no document-type flag; the phone tells it the same way.
 */
export function esNomina(items: ItemDeFactura[]): boolean {
  return items.some((i) => i.tipo === 'income') && items.some((i) => i.tipo !== 'income')
}

/** An open debt the household owes, as the payslip offers it on a deduction. */
export interface DeudaAbierta {
  id: string
  nombre: string
  /** `installments_total - installments_paid`; `null` without installment info. */
  cuotasRestantes: number | null
}

/** A payslip line under review: an income, or a deduction that takes a category or pays a debt. */
export interface LineaDeNomina {
  clave: string
  descripcion: string
  monto: number
  signo: 'ingreso' | 'descuento'
  /** An income subcategory on income lines, an expense one on deductions; `''` when none. */
  categoriaId: string
  /** Only on deductions: the debt the line pays; `''` when none. */
  deudaId: string
}

export interface AbonoDeNomina {
  debt_id: string
  amount: number
}

/**
 * The deductions named like one of [deudas] pay it (the phone's
 * `sugerirDeudas`): same name ignoring case, accents and repeated
 * spaces. Only deductions nobody classified yet; the rest is kept.
 */
export function sugerirDeudas(lineas: LineaDeNomina[], deudas: DeudaAbierta[]): LineaDeNomina[] {
  const porNombre = new Map<string, string>()
  for (const d of deudas) {
    const llave = normalizarNombre(d.nombre)
    if (llave) porNombre.set(llave, d.id)
  }
  return lineas.map((l) => {
    if (l.signo !== 'descuento' || l.categoriaId || l.deudaId) return l
    const id = porNombre.get(normalizarNombre(l.descripcion) ?? '')
    return id ? { ...l, deudaId: id } : l
  })
}

/**
 * The payslip's lines with an amount: income lines with the suggested
 * income category, deductions with the suggested expense one, then the
 * debts suggested by name.
 */
export function lineasDeNomina(
  items: ItemDeFactura[],
  categorias: CategoriaDeMovimiento[],
  deudas: DeudaAbierta[],
): LineaDeNomina[] {
  const lineas = items
    .filter((i) => (i.total ?? 0) > 0)
    .map((i): LineaDeNomina => {
      const ingreso = i.tipo === 'income'
      return {
        clave: `l${i.linea}`,
        descripcion: i.descripcion,
        monto: i.total!,
        signo: ingreso ? 'ingreso' : 'descuento',
        categoriaId: categoriaSugerida(i.categoriaSugerida, categorias, ingreso ? 'income' : 'expense'),
        deudaId: '',
      }
    })
  return sugerirDeudas(lineas, deudas)
}

/** Income, deductions and their net, to the cent. */
export function totalesDeNomina(lineas: LineaDeNomina[]): { ingresos: number; descuentos: number; neto: number } {
  const ingresos = sumaDe(lineas.filter((l) => l.signo === 'ingreso').map((l) => l.monto))
  const descuentos = sumaDe(lineas.filter((l) => l.signo === 'descuento').map((l) => l.monto))
  return { ingresos, descuentos, neto: (aCentavos(ingresos) - aCentavos(descuentos)) / 100 }
}

/**
 * The net printed on the payslip (NETO A RECIBIR): the QR's total, else
 * the one read. Never the items' sum, which would square by definition.
 */
export function netoDelComprobante(l: LecturaDeFactura): number | null {
  return numero(l.qr?.valorTotal) ?? numero(l.ocr?.total)
}

/**
 * `p_ingresos`, `p_gastos` and `p_abonos` for `registrar_nomina_de_factura`
 * (migration 0047). `null` while a line has neither a category nor a
 * debt. Several lines of one debt stay apart: the server sums them.
 */
export function partesDeNomina(
  lineas: LineaDeNomina[],
): { ingresos: Parte[]; gastos: Parte[]; abonos: AbonoDeNomina[] } | null {
  if (lineas.some((l) => !l.categoriaId && !(l.signo === 'descuento' && l.deudaId))) return null
  const parte = (l: LineaDeNomina): Parte => ({ category_id: l.categoriaId, amount: l.monto, note: texto(l.descripcion) })
  return {
    ingresos: lineas.filter((l) => l.signo === 'ingreso').map(parte),
    gastos: lineas.filter((l) => l.signo === 'descuento' && !l.deudaId).map(parte),
    abonos: lineas
      .filter((l) => l.signo === 'descuento' && l.deudaId)
      .map((l) => ({ debt_id: l.deudaId, amount: l.monto })),
  }
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
