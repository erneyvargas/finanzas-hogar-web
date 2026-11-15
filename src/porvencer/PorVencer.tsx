import { useMemo, useState } from 'react'
import { festivosDe } from '../core/festivos'
import { colorDe, dinero, nombreDelMes } from '../core/formato'
import { BarraDeSemanas, CalendarioDeCirculos, type Circulo } from '../core/ui/CalendarioDeCirculos'
import { diasDelMes, semanaDelDia } from '../core/ui/rejillaDelMes'
import { Cifra } from '../core/ui/Cifra'
import {
  diaCorto,
  esUrgente,
  limite30,
  pendientesDelMes,
  porPagarEn30Dias,
  semanaMasCargada,
  tamanoDeCirculo,
  textoDeDias,
  vencimientos,
  type DatosDePorVencer,
  type Vencimiento,
} from './reglas'

const conMayuscula = (t: string) => `${t[0].toUpperCase()}${t.slice(1)}`
/** Cards have no category; they take the card blue. */
const colorDeItem = (v: Vencimiento) => colorDe(v.color ?? (v.tipo === 'tarjeta' ? 'anil' : null))
const porFecha = (a: Vencimiento, b: Vencimiento) =>
  a.fecha === b.fecha ? a.nombre.localeCompare(b.nombre, 'es') : a.fecha === null ? 1 : b.fecha === null ? -1 : a.fecha < b.fecha ? -1 : 1

/**
 * The «Por vencer» tab (proposal 1, «El mes en círculos»): this month as
 * a calendar with one circle per bill, what is left to pay this month or
 * in the next 30 days, and the list to pay from. Read-only: [alPagar]
 * opens the register panel, and without it there is no «Pagar».
 */
export function PorVencer({
  datos,
  hoy,
  alPagar,
}: {
  datos: DatosDePorVencer
  /** Today in Bogotá, `YYYY-MM-DD`. */
  hoy: string
  alPagar?: (v: Vencimiento) => void
}) {
  const mes = hoy.slice(0, 7)
  const [modo, setModo] = useState<'mes' | '30'>('mes')
  const [encendido, setEncendido] = useState<string | null>(null)
  const vs = useMemo(() => vencimientos(datos, hoy), [datos, hoy])

  const delMes = vs.filter((v) => v.fecha === null || v.fecha.startsWith(mes))
  const pendientes = (modo === 'mes' ? pendientesDelMes(vs, mes) : porPagarEn30Dias(vs, hoy)).concat(
    vs.filter((v) => !v.pagado && v.fecha === null),
  )
  pendientes.sort(porFecha)
  const pagados = delMes.filter((v) => v.pagado).sort(porFecha)
  // A bill with no date yet is listed but left out of the total, as «por confirmar».
  const total = pendientes.reduce((a, v) => a + (v.fecha === null ? 0 : v.monto), 0)
  const porConfirmar = pendientes.filter((v) => v.fecha === null).map((v) => v.nombre.toLocaleLowerCase('es'))
  const cuenta = (id: string | null) => datos.cuentas.find((c) => c.id === id)?.nombre
  const principal = datos.cuentas.find((c) => c.principal)

  const maximo = Math.max(0, ...delMes.map((v) => v.monto))
  const circulo = (v: Vencimiento): Circulo => ({
    id: v.clave,
    dia: v.fecha ? Number(v.fecha.slice(8)) : 0,
    tamano: v.fecha === null ? 14 : tamanoDeCirculo(v.monto, maximo),
    color: colorDeItem(v),
    estilo: v.fecha === null ? 'rayado' : v.pagado ? 'hueco' : 'lleno',
    etiqueta: `${v.nombre} · ${dinero(v.monto)} · ${v.pagado ? 'pagado' : textoDeDias(v, hoy)}`,
  })
  const festivos = new Map(
    [...festivosDe(Number(mes.slice(0, 4)))].filter(([d]) => d.startsWith(mes)).map(([d, n]) => [Number(d.slice(8)), n]),
  )

  const semanas = semanaMasCargada(vs, mes)
  const diasDeLaSemana = Array.from({ length: diasDelMes(mes) }, (_, i) => i + 1).filter(
    (d) => semanaDelDia(mes, d) === semanas.mayor,
  )
  const pie =
    semanas.mayor < 0
      ? `No queda nada por pagar en ${nombreDelMes(mes)}`
      : `${diasDeLaSemana[0]}–${diaCorto(`${mes}-${String(diasDeLaSemana[diasDeLaSemana.length - 1]).padStart(2, '0')}`)}: ${dinero(
          semanas.totales[semanas.mayor],
        )}, la más cargada`

  const fila = (v: Vencimiento) => (
    <li
      key={v.clave}
      className={encendido === v.clave ? 'encendida' : undefined}
      style={{ ['--c' as string]: colorDeItem(v) }}
      onMouseEnter={() => setEncendido(v.clave)}
      onMouseLeave={() => setEncendido(null)}
    >
      <span className={`punto ${v.fecha === null ? 'rayado' : v.pagado ? 'hueco' : ''}`} aria-hidden="true" />
      <span className="n">{v.nombre}</span>
      <span className="m num">{dinero(v.monto)}</span>
      <span className="meta">
        <span>
          <span className={esUrgente(v, hoy) ? 'urgente' : undefined}>{v.pagado ? 'Pagado' : textoDeDias(v, hoy)}</span>
          {cuenta(v.cuentaId) && <> · {cuenta(v.cuentaId)}</>}
        </span>
        {!v.pagado && alPagar && (
          <button type="button" className="pagar" aria-label={`Pagar ${v.nombre}`} onClick={() => alPagar(v)}>
            Pagar
          </button>
        )}
      </span>
    </li>
  )

  return (
    <div className="por-vencer">
      <section className="tarjeta" aria-labelledby="pv-titulo">
        <div className="pv-cab">
          <div>
            <h2 id="pv-titulo" className="pv-sub">
              {modo === 'mes' ? `Falta pagar en ${nombreDelMes(mes)}` : `Falta pagar hasta el ${diaCorto(limite30(hoy))}`}
            </h2>
            <p className="pv-total num" data-total>
              <Cifra texto={dinero(total)} />
            </p>
            {principal && datos.saldoPrincipal !== null && (
              <p className="pv-sub">
                {porConfirmar.length > 0 && `+ ${porConfirmar.join(', ')} por confirmar · `}quedarían <b className="num">{dinero(datos.saldoPrincipal - total)}</b> en {principal.nombre}
              </p>
            )}
          </div>
          <div className="conmutador" role="group" aria-label="Periodo">
            <button type="button" aria-pressed={modo === 'mes'} onClick={() => setModo('mes')}>
              {conMayuscula(nombreDelMes(mes))}
            </button>
            <button type="button" aria-pressed={modo === '30'} onClick={() => setModo('30')}>
              30 días
            </button>
          </div>
        </div>
        <CalendarioDeCirculos
          mes={mes}
          hoy={Number(hoy.slice(8))}
          festivos={festivos}
          circulos={delMes.filter((v) => v.fecha !== null).map(circulo)}
          sinFecha={delMes.filter((v) => v.fecha === null).map(circulo)}
          textoSinFecha="Fecha por confirmar"
          encendido={encendido}
          alEncender={setEncendido}
          etiqueta={`Calendario de ${nombreDelMes(mes)}`}
        />
        <BarraDeSemanas totales={semanas.totales} mayor={semanas.mayor} pie={pie} />
      </section>

      <section className="tarjeta" aria-labelledby="pv-lista">
        <h2 id="pv-lista">Por pagar</h2>
        {pendientes.length === 0 ? (
          <p className="nota">Nada por pagar en este periodo.</p>
        ) : (
          <ul className="lista-v" aria-label="Por pagar">
            {pendientes.map(fila)}
          </ul>
        )}
        {pagados.length > 0 && (
          <>
            <h3 className="pv-pagados">Ya pagados</h3>
            <ul className="lista-v" aria-label="Ya pagados">
              {pagados.map(fila)}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
