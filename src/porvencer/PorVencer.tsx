import { useMemo, useState } from 'react'
import { festivosDe } from '../core/festivos'
import { colorDe, dinero, nombreDelMes } from '../core/formato'
import { BarraDeSemanas, CalendarioDeCirculos, type Circulo } from '../core/ui/CalendarioDeCirculos'
import { diasDelMes, semanaDelDia } from '../core/ui/rejillaDelMes'
import { Cifra } from '../core/ui/Cifra'
import { conSigno } from '../cuentas/reglas'
import { fraseDeRegla } from '../recurrentes/patron'
import {
  diaCorto,
  diasEntre,
  esUrgente,
  limite30,
  pendientesDelMes,
  porPagarEn30Dias,
  quedanPorCuenta,
  semanaMasCargada,
  tamanoDeCirculo,
  textoDeDias,
  vencimientos,
  type DatosDePorVencer,
  type Vencimiento,
} from './reglas'

/**
 * What is still unpaid moves by urgency: due today or overdue ripples,
 * the next 7 days glow, later stays still. Paid, unknown dates and cards
 * without a statement never move.
 */
const pulsoDe = (v: Vencimiento, hoy: string): 'urgente' | 'pronto' | undefined => {
  if (v.pagado || v.sinExtracto || v.fecha === null) return undefined
  const dias = diasEntre(hoy, v.fecha)
  return dias <= 0 ? 'urgente' : dias <= 7 ? 'pronto' : undefined
}
const conMayuscula = (t: string) => `${t[0].toUpperCase()}${t.slice(1)}`
/** Cards have no category; they take the card blue. */
const colorDeItem = (v: Vencimiento) => colorDe(v.color ?? (v.tipo === 'tarjeta' ? 'anil' : null))
/** `Debes $737.627 · revisa el extracto`: a card with no statement due this month. */
const textoDeDeuda = (v: Vencimiento) => `Debes ${dinero(v.deuda)} · revisa el extracto`
const porFecha = (a: Vencimiento, b: Vencimiento) =>
  a.fecha === b.fecha ? a.nombre.localeCompare(b.nombre, 'es') : a.fecha === null ? 1 : b.fecha === null ? -1 : a.fecha < b.fecha ? -1 : 1

/**
 * The «Por vencer» tab (proposal 1, «El mes en círculos»): this month as
 * a calendar with one circle per bill, what is left to pay this month or
 * in the next 30 days, and the list to pay from. Read-only: [alPagar]
 * opens the register panel (an expense rule) or Transferir (a card or a
 * debt rule), and without it there is no «Pagar».
 */
export function PorVencer({
  datos,
  hoy,
  alPagar,
  puedeTransferir = false,
  alNuevaRegla,
  alEditarRegla,
}: {
  datos: DatosDePorVencer
  /** Today in Bogotá, `YYYY-MM-DD`. */
  hoy: string
  alPagar?: (v: Vencimiento) => void
  /** Whether «Pagar» can open a transfer (cards and debt rules); without it they offer none. */
  puedeTransferir?: boolean
  /** Opens the panel for a new recurring payment; without it, none is offered. */
  alNuevaRegla?: () => void
  /** Opens the panel with that rule; without it, the rules are not listed. */
  alEditarRegla?: (id: string) => void
}) {
  const mes = hoy.slice(0, 7)
  const [modo, setModo] = useState<'mes' | '30'>('mes')
  const [encendido, setEncendido] = useState<string | null>(null)
  const vs = useMemo(() => vencimientos(datos, hoy), [datos, hoy])

  const delMes = vs.filter((v) => v.fecha === null || v.fecha.startsWith(mes))
  const delPeriodo = modo === 'mes' ? pendientesDelMes(vs, mes) : porPagarEn30Dias(vs, hoy)
  const total = delPeriodo.reduce((a, v) => a + v.monto, 0)
  // Listed but out of the total: bills with no date yet («por confirmar»)
  // and cards with no statement this month (only their debt is known).
  const aparte = delMes.filter((v) => !v.pagado && (v.fecha === null || v.sinExtracto))
  const pendientes = [...delPeriodo, ...aparte].sort(porFecha)
  const pagados = delMes.filter((v) => v.pagado).sort(porFecha)
  const porConfirmar = aparte.filter((v) => v.fecha === null).map((v) => v.nombre.toLocaleLowerCase('es'))
  const cuenta = (id: string | null) => datos.cuentas.find((c) => c.id === id)?.nombre
  const quedan = quedanPorCuenta(delPeriodo, datos.saldos)

  const maximo = Math.max(0, ...delMes.map((v) => v.monto))
  const circulo = (v: Vencimiento): Circulo => ({
    id: v.clave,
    dia: v.fecha ? Number(v.fecha.slice(8)) : 0,
    tamano: v.fecha === null ? 14 : v.sinExtracto ? 10 : tamanoDeCirculo(v.monto, maximo),
    color: colorDeItem(v),
    estilo: v.fecha === null ? 'rayado' : v.pagado || v.sinExtracto ? 'hueco' : 'lleno',
    etiqueta: v.sinExtracto
      ? `${v.nombre} · ${textoDeDeuda(v).toLocaleLowerCase('es')}`
      : `${v.nombre} · ${dinero(v.monto)} · ${v.pagado ? 'pagado' : textoDeDias(v, hoy)}`,
    pulso: pulsoDe(v, hoy),
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
      <span className={`punto ${v.fecha === null ? 'rayado' : v.pagado || v.sinExtracto ? 'hueco' : ''}`} aria-hidden="true" />
      <span className="n">
        <span className="nombre">{v.nombre}</span>
        {v.detalle && <small> {v.detalle}</small>}
        {v.tipo === 'tarjeta' && v.total > v.monto && <small className="total-tarjeta"> · total {dinero(v.total)}</small>}
      </span>
      <span className="m num">{v.sinExtracto ? '—' : dinero(v.monto)}</span>
      <span className="meta">
        <span>
          {v.sinExtracto ? (
            <span>{textoDeDeuda(v)}</span>
          ) : (
            <span className={esUrgente(v, hoy) ? 'urgente' : undefined}>{v.pagado ? 'Pagado' : textoDeDias(v, hoy)}</span>
          )}
          {cuenta(v.cuentaId) && <> · {cuenta(v.cuentaId)}</>}
        </span>
        {/* A card or a debt rule is paid with a transfer, never an expense. */}
        {!v.pagado && !v.sinExtracto && alPagar && (!v.destinoId || puedeTransferir) && (
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
            {porConfirmar.length > 0 && <p className="pv-sub">+ {porConfirmar.join(', ')} por confirmar</p>}
            {quedan.map((q) => (
              <p key={q.cuentaId} className="pv-sub">
                quedarían <b className={`num ${q.queda < 0 ? 'urgente' : ''}`}>{conSigno(q.queda)}</b> en {cuenta(q.cuentaId)}
              </p>
            ))}
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

      {alEditarRegla && (
        <section className="tarjeta" aria-labelledby="pv-reglas">
          <div className="pv-reglas-cab">
            <h2 id="pv-reglas">Pagos recurrentes</h2>
            {alNuevaRegla && (
              <button type="button" className="secundario" onClick={alNuevaRegla}>
                Nuevo pago recurrente
              </button>
            )}
          </div>
          {datos.reglas.length === 0 ? (
            <p className="nota">Todavía no hay pagos recurrentes.</p>
          ) : (
            <ul className="lista-reglas" aria-label="Pagos recurrentes">
              {[...datos.reglas]
                .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
                .map((r) => (
                  <li key={r.id}>
                    <button type="button" className="fila-regla" aria-label={`Editar ${r.nombre}`} onClick={() => alEditarRegla(r.id)}>
                      <b>{r.nombre}</b>
                      <span className={`num ${r.tipo === 'income' ? 'ingreso' : ''}`}>{dinero(r.monto)}</span>
                      <small>
                        {fraseDeRegla({
                          frecuencia: r.frecuencia,
                          diaDelMes: r.diaDelMes,
                          dias: r.dias ?? null,
                          semanaDelMes: r.semanaDelMes ?? null,
                          proximaFecha: r.proximaFecha,
                          horaAviso: r.horaAviso ?? null,
                        })}
                      </small>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
