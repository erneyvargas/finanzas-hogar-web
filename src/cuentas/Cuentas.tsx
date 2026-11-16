import { useState } from 'react'
import { dinero } from '../core/formato'
import { guardarEnLaPestana, leerDeLaPestana } from '../core/recordado'
import { Cara } from '../movimientos/ListaDeMovimientos'
import {
  ORDENES,
  conSigno,
  debes,
  disponible,
  enRojo,
  grupoDe,
  libroDe,
  type CuentaConSaldo,
  type DatosDeCuentas,
  type Orden,
  etiquetaDeCuenta,
} from './reglas'

/**
 * The «Cuentas» tab (proposal 1, «Libro mayor + panel lateral»): Tienes −
 * Debes = Patrimonio neto, then one ledger grouped as the phone groups it.
 * A row opens the account in the side panel.
 */
export function Cuentas({
  datos,
  seleccionada,
  alElegir,
}: {
  datos: DatosDeCuentas
  seleccionada: string | null
  alElegir: (id: string) => void
}) {
  const [orden, setOrdenGuardado] = useState<Orden>(() => leerDeLaPestana<Orden>('orden-de-cuentas') ?? 'valor')
  const setOrden = (o: Orden) => {
    setOrdenGuardado(o)
    guardarEnLaPestana('orden-de-cuentas', o)
  }
  const [verSaldadas, setVerSaldadas] = useState(false)
  const [verArchivadas, setVerArchivadas] = useState(false)
  const l = libroDe(datos.cuentas, orden)

  if (datos.cuentas.length === 0) {
    return <p className="tarjeta nota">Todavía no tienes cuentas. Crea la primera con «Nueva cuenta».</p>
  }

  const filas = (lista: CuentaConSaldo[]) =>
    lista.map((c) => (
      <FilaDeCuenta key={c.id} c={c} datos={datos} elegida={c.id === seleccionada} alElegir={alElegir} />
    ))

  return (
    <div className="cuentas">
      <section className="ecuacion num" aria-label="Patrimonio">
        <div>
          <span className="t">Tienes</span>
          <strong>{dinero(l.tienes)}</strong>
        </div>
        <span className="op" aria-hidden="true">
          −
        </span>
        <div>
          <span className="t">Debes</span>
          <strong className="gasto">{dinero(l.debes)}</strong>
        </div>
        <span className="op" aria-hidden="true">
          =
        </span>
        <div className="total">
          <span className="t">Patrimonio neto</span>
          <strong>{conSigno(l.patrimonio)}</strong>
        </div>
      </section>

      <div className="chips orden" role="group" aria-label="Ordenar">
        {ORDENES.map((o) => (
          <button key={o.id} type="button" className="chip" aria-pressed={orden === o.id} onClick={() => setOrden(o.id)}>
            {o.nombre}
          </button>
        ))}
      </div>

      <div className="libro">
        <table aria-label="Cuentas">
          <thead>
            <tr>
              <th scope="col">Cuenta</th>
              <th scope="col">Tipo</th>
              <th scope="col">Detalle</th>
              <th scope="col">Saldo</th>
            </tr>
          </thead>
          <Grupo nombre="Corrientes" total={`Tienes ${dinero(l.totalCorrientes)}`}>
            {filas(l.corrientes)}
          </Grupo>
          <Grupo nombre="Créditos" total={`Debes ${dinero(l.debes)}`} rojo>
            {filas(l.creditos)}
          </Grupo>
          <Grupo nombre="Activos" total={dinero(l.totalActivos)}>
            {filas(l.activos)}
          </Grupo>
          {verSaldadas && <Grupo nombre="Deudas saldadas">{filas(l.saldadas)}</Grupo>}
          {verArchivadas && <Grupo nombre="Archivadas">{filas(l.archivadas)}</Grupo>}
        </table>
      </div>

      <div className="acciones ver-mas">
        {l.saldadas.length > 0 && (
          <button type="button" className="secundario" aria-expanded={verSaldadas} onClick={() => setVerSaldadas(!verSaldadas)}>
            {verSaldadas ? 'Ocultar deudas saldadas' : `Ver deudas saldadas (${l.saldadas.length})`}
          </button>
        )}
        {l.archivadas.length > 0 && (
          <button type="button" className="secundario" aria-expanded={verArchivadas} onClick={() => setVerArchivadas(!verArchivadas)}>
            {verArchivadas ? 'Ocultar archivadas' : `Ver archivadas (${l.archivadas.length})`}
          </button>
        )}
      </div>
    </div>
  )
}

function Grupo({ nombre, total, rojo, children }: { nombre: string; total?: string; rojo?: boolean; children: React.ReactNode[] }) {
  if (children.length === 0) return null
  return (
    <tbody aria-label={nombre}>
      <tr className="grupo">
        <th scope="rowgroup" colSpan={3}>
          {nombre}
        </th>
        <td className={`num ${rojo ? 'gasto' : ''}`}>{total}</td>
      </tr>
      {children}
    </tbody>
  )
}

/** The Detalle cell: the card's limit and due day, the loan's installments, the principal badge. */
function Detalle({ c, datos }: { c: CuentaConSaldo; datos: DatosDeCuentas }) {
  const partes: React.ReactNode[] = []
  if (c.principal) partes.push(<span key="p" className="principal">Principal</span>)
  if (c.tipo === 'credit_card') {
    const queda = disponible(c)
    if (c.cupo != null && queda != null) {
      partes.push(
        <span key="cupo" className={enRojo(c) ? 'gasto' : undefined}>
          {`Cupo ${dinero(c.cupo)} · Te quedan ${conSigno(queda)}`}
        </span>,
      )
    }
    if (c.diaDePago != null) partes.push(<span key="pago">{`Paga el día ${c.diaDePago}`}</span>)
  }
  if (c.tipo === 'liability' || c.tipo === 'receivable') {
    const deuda = datos.deudas.find((d) => d.cuentaId === c.id)
    const cuota =
      deuda?.cuotasTotales != null
        ? ` · Cuota ${Math.min(deuda.cuotasPagadas + 1, deuda.cuotasTotales)} de ${deuda.cuotasTotales}`
        : ''
    const pendiente = c.tipo === 'liability' ? `Debes ${dinero(debes(c))}` : `Te deben ${dinero(Math.max(c.saldo, 0))}`
    partes.push(<span key="deuda">{pendiente + cuota}</span>)
  }
  return <>{partes.flatMap((p, i) => (i === 0 ? [p] : [<span key={`s${i}`} aria-hidden="true">{' · '}</span>, p]))}</>
}

function FilaDeCuenta({
  c,
  datos,
  elegida,
  alElegir,
}: {
  c: CuentaConSaldo
  datos: DatosDeCuentas
  elegida: boolean
  alElegir: (id: string) => void
}) {
  return (
    <tr className={elegida ? 'sel' : undefined} onClick={() => alElegir(c.id)}>
      <td className="cuenta">
        <button
          type="button"
          className="nombre-de-cuenta"
          onClick={(e) => {
            e.stopPropagation()
            alElegir(c.id)
          }}
        >
          <Cara nombre={c.nombre} foto={c.foto} clase="cara grande" />
          <span>{c.nombre}</span>
        </button>
      </td>
      <td className="tipo">{etiquetaDeCuenta(c)}</td>
      <td className="det">
        <Detalle c={c} datos={datos} />
      </td>
      <td className={`saldo num ${grupoDe(c) === 'credito' && c.saldo < 0 ? 'gasto' : ''}`}>{conSigno(c.saldo)}</td>
    </tr>
  )
}
