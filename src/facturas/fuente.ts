import type { SupabaseClient } from '@supabase/supabase-js'
import { extensionDe, medidaReducida, type DeudaAbierta, type LecturaDeFactura } from './reglas'

/**
 * Where a receipt goes to be read; tests pass a fake. Same path as the
 * phone: the file to the `receipts` bucket, its row, then `parse-receipt`.
 */
export interface FuenteDeFacturas {
  /** Compresses a photo, uploads it as `{hogar}/{id}.{ext}` and upserts its row as `uploaded`. */
  subir(id: string, archivo: File): Promise<void>
  /** Asks `parse-receipt` to read it. Rejects on a timeout or network error; that is not a failure. */
  leer(id: string): Promise<void>
  /** The receipt row and its live items, by line. */
  consultar(id: string): Promise<LecturaDeFactura>
  /**
   * The live active debts the household owes (not those owed to it), by
   * start date: what a payslip deduction can pay. Optional so a source
   * without it simply offers no debts.
   */
  deudas?(): Promise<DeudaAbierta[]>
  /**
   * Links an uploaded receipt to a movement as its evidence
   * (`transactions.receipt_id`, one per movement). Optional so a source
   * without it simply offers no evidence.
   */
  vincular?(movimientoId: string, reciboId: string): Promise<void>
}

const BUCKET = 'receipts'
const LADO_MAXIMO = 1600
const CALIDAD = 0.75

/** A photo as a JPEG whose long side is at most 1600 px (canvas). */
export async function comprimirFoto(archivo: Blob): Promise<Blob> {
  const imagen = await createImageBitmap(archivo)
  const { ancho, alto } = medidaReducida(imagen.width, imagen.height, LADO_MAXIMO)
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('Sin canvas')
  ctx.drawImage(imagen, 0, 0, ancho, alto)
  imagen.close()
  return new Promise((listo, fallo) =>
    lienzo.toBlob((b) => (b ? listo(b) : fallo(new Error('Sin JPEG'))), 'image/jpeg', CALIDAD),
  )
}

export function fuenteDeFacturasDeSupabase(
  sb: SupabaseClient,
  hogar: () => Promise<string>,
): FuenteDeFacturas {
  return {
    async subir(id, archivo) {
      const [hogarId, { data: usuario }] = await Promise.all([hogar(), sb.auth.getUser()])
      let ext = extensionDe(archivo) ?? 'jpg'
      let contenido: Blob = archivo
      let tipo = archivo.type || (ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`)
      if (ext !== 'pdf') {
        try {
          contenido = await comprimirFoto(archivo)
          ext = 'jpg'
          tipo = 'image/jpeg'
        } catch {
          // A browser that cannot draw it sends the photo as it is.
        }
      }
      const ruta = `${hogarId}/${id}.${ext}`
      const subida = await sb.storage.from(BUCKET).upload(ruta, contenido, { upsert: true, contentType: tipo })
      if (subida.error) throw new Error(subida.error.message)
      const { error } = await sb.from('receipts').upsert({
        id,
        household_id: hogarId,
        storage_path: ruta,
        status: 'uploaded',
        qr_payload: null,
        created_by: usuario.user?.id,
      })
      if (error) throw new Error(error.message)
    },

    async leer(id) {
      const { error } = await sb.functions.invoke('parse-receipt', { body: { receipt_id: id } })
      if (error) throw error
    },

    async consultar(id) {
      const [recibo, items] = await Promise.all([
        sb.from('receipts').select('status, ocr_raw, qr_parsed, error_message').eq('id', id).single(),
        sb
          .from('receipt_items')
          .select('line_no, description, quantity, total, suggested_category_id, kind')
          .eq('receipt_id', id)
          .is('deleted_at', null)
          .order('line_no'),
      ])
      if (recibo.error) throw new Error(recibo.error.message)
      if (items.error) throw new Error(items.error.message)
      const r = recibo.data
      return {
        estado: r.status,
        error: r.error_message,
        ocr: r.ocr_raw,
        qr: r.qr_parsed,
        items: (items.data ?? []).map((i) => ({
          linea: i.line_no,
          descripcion: i.description,
          cantidad: i.quantity == null ? null : Number(i.quantity),
          total: i.total == null ? null : Number(i.total),
          categoriaSugerida: i.suggested_category_id,
          tipo: i.kind,
        })),
      }
    },

    async vincular(movimientoId, reciboId) {
      const { error } = await sb.from('transactions').update({ receipt_id: reciboId }).eq('id', movimientoId)
      if (error) throw new Error(error.message)
    },

    async deudas() {
      const hogarId = await hogar()
      const { data, error } = await sb
        .from('debts')
        .select('id, name, installments_total, installments_paid')
        .eq('household_id', hogarId)
        .is('deleted_at', null)
        .eq('status', 'active')
        .neq('direction', 'owed_to_me')
        .order('start_date')
      if (error) throw new Error(error.message)
      return (data ?? []).map((d) => ({
        id: d.id,
        nombre: d.name,
        cuotasRestantes:
          d.installments_total == null ? null : Math.max(0, d.installments_total - (d.installments_paid ?? 0)),
      }))
    },
  }
}
