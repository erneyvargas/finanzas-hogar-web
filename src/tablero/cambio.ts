import { dinero, nombreDelMes } from '../core/formato'
import { moverMes } from './calculo'

/**
 * What «↑ 34 % vs octubre» means, with the amounts: the month so far (or
 * the whole closed month) against the same days of the month before.
 */
export function explicarCambio(total: number, anterior: number, mes: string, hasta: number | null) {
  const nombre = nombreDelMes(mes)
  const nombreAnterior = nombreDelMes(moverMes(mes, -1))
  if (anterior <= 0) return `En el mismo periodo de ${nombreAnterior} no hubo gasto en este rubro.`
  const cambio = Math.round(((total - anterior) / anterior) * 100)
  if (cambio === 0) return `Igual que en el mismo periodo de ${nombreAnterior}.`
  const cuanto = `${Math.abs(cambio)} % ${cambio > 0 ? 'más' : 'menos'}.`
  return hasta === null
    ? `Todo ${nombre}: ${dinero(total)}; todo ${nombreAnterior}: ${dinero(anterior)}. ${cuanto}`
    : `Del 1 al ${hasta} de ${nombre} llevas ${dinero(total)}; en el mismo periodo de ${nombreAnterior} fueron ${dinero(anterior)}: ${cuanto}`
}
