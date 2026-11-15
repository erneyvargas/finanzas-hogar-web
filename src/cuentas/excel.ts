import { MESES } from '../core/formato'
import { diaDe } from '../tablero/calculo'
import { signoDe, textoDe, type MovimientoDeCuenta, type TipoDeCuenta } from './reglas'

/** One row of the account's Excel: what the panel shows, plus the balance after it. */
export interface FilaDeExcel {
  /** The Bogotá day, at UTC midnight so Excel shows that same day. */
  fecha: Date
  descripcion: string
  categoria: string
  tipo: string
  nota: string
  /** Signed from the account's side: money in is positive. */
  monto: number
  /** The account's balance right after the movement; `null` for a loan. */
  saldo: number | null
}

const TIPOS: Record<MovimientoDeCuenta['tipo'], string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  transfer: 'Transferencia',
  debt_payment: 'Abono a deuda',
}

/**
 * The month's movements of [cuenta] (newest first, as the panel lists
 * them) as Excel rows. The balance runs back from [saldoFinal], the
 * balance at the end of the month. A loan has none: an installment lowers
 * it only by its capital, which the row does not carry.
 */
export function filasParaExcel(
  movs: MovimientoDeCuenta[],
  cuenta: { id: string; tipo: TipoDeCuenta },
  saldoFinal: number,
  nombre: (id: string | null) => string,
): FilaDeExcel[] {
  const conSaldo = cuenta.tipo !== 'liability'
  let saldo = saldoFinal
  return movs.map((m) => {
    const monto = signoDe(m, cuenta.id) * m.monto
    const [a, mes, d] = diaDe(m.fecha).split('-').map(Number)
    const fila: FilaDeExcel = {
      fecha: new Date(Date.UTC(a, mes - 1, d)),
      descripcion: textoDe(m, cuenta.id, nombre),
      // A «General» leaf adds nothing to the path.
      categoria: (m.categoria ?? '').replace(/ › General$/, ''),
      tipo: TIPOS[m.tipo],
      nota: m.tipo === 'expense' || m.tipo === 'income' ? (m.comercio ? (m.nota ?? '') : '') : (m.nota ?? ''),
      monto,
      saldo: conSaldo ? Math.round(saldo * 100) / 100 : null,
    }
    saldo -= monto
    return fila
  })
}

/** `Nomina Banco de Bogotá - noviembre 2026.xlsx`, without characters a file name cannot hold. */
export function nombreDelArchivo(cuenta: string, mes: string): string {
  const limpio = cuenta.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
  return `${limpio} - ${MESES[Number(mes.slice(5)) - 1]} ${mes.slice(0, 4)}.xlsx`
}

/**
 * Builds the .xlsx and opens the browser's save dialog. The library is
 * loaded only here, so the page does not carry it until someone exports.
 */
export async function descargarExcel(filas: FilaDeExcel[], archivo: string): Promise<void> {
  const { default: escribir } = await import('write-excel-file/browser')
  const pesos = '"$"#,##0;[Red]-"$"#,##0'
  const encabezado = ['Fecha', 'Descripción', 'Categoría', 'Tipo', 'Nota', 'Monto', 'Saldo'].map((value) => ({
    value,
    fontWeight: 'bold' as const,
  }))
  const datos = filas.map((f) => [
    { value: f.fecha, type: Date, format: 'dd/mm/yyyy' },
    { value: f.descripcion, type: String },
    { value: f.categoria, type: String },
    { value: f.tipo, type: String },
    { value: f.nota, type: String },
    { value: f.monto, type: Number, format: pesos },
    f.saldo === null ? null : { value: f.saldo, type: Number, format: pesos },
  ])
  await escribir([encabezado, ...datos], {
    columns: [{ width: 12 }, { width: 34 }, { width: 30 }, { width: 15 }, { width: 28 }, { width: 14 }, { width: 14 }],
    stickyRowsCount: 1,
  }).toFile(archivo)
}
