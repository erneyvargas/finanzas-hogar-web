import { useMemo, useState } from 'react'
import { dinero } from '../core/formato'
import { CampoDeFecha } from '../movimientos/CampoDeFecha'
import type { FuenteDeMovimientos } from '../movimientos/fuente'
import { categoriasPara, fechaParaServidor, rutaDeCategoria, type DatosDeMovimientos } from '../movimientos/reglas'
import { diaDe } from '../tablero/calculo'
import { useGuardarFactura } from './guardar'
import { ElegirCuenta, Vista } from './piezas'
import {
  camposDeFactura,
  cuentaSugerida,
  lineasDeNomina,
  netoDelComprobante,
  partesDeNomina,
  sumaDe,
  totalesDeNomina,
  type DeudaAbierta,
  type LecturaDeFactura,
  type LineaDeNomina,
} from './reglas'

const hojaDe = (ruta: string) => ruta.split(' › ').pop() ?? ruta
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
/** `a`, `a y b`, `a, b y c`. */
const enumerar = (partes: string[]) =>
  partes.length <= 1 ? partes.join('') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`

/** What a line's picker holds: `c:<category>` or `d:<debt>`, `''` when none. */
/** `Sueldo $2.771.600 · Bono $1.500.000`: each line by its category's leaf. */
const detalleDe = (lineas: LineaDeNomina[], datos: DatosDeMovimientos) =>
  lineas.map((l) => `${hojaDe(rutaDeCategoria(l.categoriaId || null, datos.categorias).texto)} ${dinero(l.monto)}`).join(' · ')

const valorDe = (l: LineaDeNomina) => (l.deudaId ? `d:${l.deudaId}` : l.categoriaId ? `c:${l.categoriaId}` : '')

/**
 * The review of a payslip (proposal 1, «Dos tablas y la barra del
 * neto»): the income and the deductions as the paper prints them, each
 * line with its category or the debt it pays, and a dark bar that keeps
 * the net in view. Saves through `registrar_nomina_de_factura`
 * (migration 0047), which splits each debt payment into capital and
 * interest; the client shows only the amounts.
 */
export function RevisionDeNomina({
  lectura,
  deudas,
  archivo,
  vista,
  datos,
  reciboId,
  nuevoId,
  movimientos,
  ahora,
  guardando,
  setGuardando,
  alCerrar,
}: {
  lectura: LecturaDeFactura
  deudas: DeudaAbierta[]
  archivo: File
  vista: string | null
  datos: DatosDeMovimientos
  reciboId: string
  nuevoId: string
  movimientos: FuenteDeMovimientos
  ahora: () => Date
  guardando: boolean
  setGuardando: (g: boolean) => void
  alCerrar: (guardado: boolean) => void
}) {
  const campos = useMemo(() => camposDeFactura(lectura), [lectura])
  const papel = useMemo(() => netoDelComprobante(lectura), [lectura])
  const [empleador, setEmpleador] = useState(campos.comercio ?? '')
  const [dia, setDia] = useState(campos.dia ?? diaDe(ahora()))
  const [cuentaId, setCuentaId] = useState(() => cuentaSugerida(lectura, datos.cuentas, 'income'))
  const [lineas, setLineas] = useState(() => lineasDeNomina(lectura.items, datos.categorias, deudas))
  const [nota, setNota] = useState('')
  const { error, guardar } = useGuardarFactura(movimientos, setGuardando, alCerrar)

  const rutas = useMemo(() => {
    const de = (tipo: 'income' | 'expense') =>
      categoriasPara(tipo, datos.categorias).map((c) => ({ id: c.id, ...rutaDeCategoria(c.id, datos.categorias) }))
    return { ingreso: de('income'), descuento: de('expense') }
  }, [datos.categorias])

  const { ingresos, descuentos, neto } = totalesDeNomina(lineas)
  const partes = partesDeNomina(lineas)
  const diferencia = papel == null ? 0 : Math.round((neto - papel) * 100) / 100
  const deIngreso = lineas.filter((l) => l.signo === 'ingreso')
  const deDescuento = lineas.filter((l) => l.signo === 'descuento')
  const gastos = deDescuento.filter((l) => !l.deudaId)
  const abonos = [...new Set(deDescuento.filter((l) => l.deudaId).map((l) => l.deudaId))].map((id) => ({
    id,
    nombre: deudas.find((d) => d.id === id)?.nombre.trim() ?? '',
    monto: sumaDe(deDescuento.filter((l) => l.deudaId === id).map((l) => l.monto)),
  }))
  const cuenta = datos.cuentas.find((c) => c.id === cuentaId)?.nombre ?? 'la cuenta'

  const motivo = !cuentaId
    ? 'Elige la cuenta para poder guardar'
    : !partes
      ? 'Elige la categoría o la deuda de cada línea'
      : deIngreso.length === 0
        ? 'Deja al menos una línea como ingreso'
        : diferencia !== 0
          ? 'El neto no cuadra con el comprobante'
          : null
  const queSeGuarda = enumerar([
    plural(1, 'ingreso', 'ingresos'),
    ...(gastos.length > 0 ? ['1 gasto'] : []),
    ...(abonos.length > 0 ? [plural(abonos.length, 'abono', 'abonos')] : []),
  ])

  function cambiar(clave: string, cambio: (l: LineaDeNomina) => LineaDeNomina) {
    setLineas((todas) => todas.map((l) => (l.clave === clave ? cambio(l) : l)))
  }

  /** Moving a line keeps only a category of its new kind, and a debt only on a deduction. */
  function voltear(l: LineaDeNomina, signo: LineaDeNomina['signo']) {
    if (l.signo === signo) return
    const sirve = rutas[signo].some((r) => r.id === l.categoriaId)
    cambiar(l.clave, (x) => ({ ...x, signo, categoriaId: sirve ? x.categoriaId : '', deudaId: '' }))
  }

  function elegir(l: LineaDeNomina, valor: string) {
    const id = valor.slice(2)
    cambiar(l.clave, (x) => ({
      ...x,
      categoriaId: valor.startsWith('c:') ? id : '',
      deudaId: valor.startsWith('d:') ? id : '',
    }))
  }

  async function registrar(guardarIgual: boolean) {
    if (motivo || !partes) return
    await guardar('registrar_nomina_de_factura', {
      p_household_id: datos.hogarId,
      p_receipt_id: reciboId,
      p_account_id: cuentaId,
      p_occurred_at: fechaParaServidor(dia, ahora()),
      p_note: nota.trim() || null,
      p_merchant_name: empleador.trim() || null,
      p_merchant_nit: campos.nit,
      p_ingresos: partes.ingresos,
      p_gastos: partes.gastos,
      p_abonos: partes.abonos,
      p_neto: neto,
      p_guardar_igual: guardarIgual,
      p_id: nuevoId,
    })
  }

  const fila = (l: LineaDeNomina) => {
    const deuda = l.deudaId ? deudas.find((d) => d.id === l.deudaId) : undefined
    return (
      <div key={l.clave} className="fila-nomina num">
        <span className="desc">{l.descripcion}</span>
        <span className={`m ${deuda ? 'deu' : l.signo === 'ingreso' ? 'ing' : 'gas'}`}>{dinero(l.monto)}</span>
        <select
          className={`ruta ${deuda ? 'deuda' : ''}`}
          aria-label={`Categoría de ${l.descripcion}`}
          value={valorDe(l)}
          onChange={(e) => elegir(l, e.target.value)}
        >
          <option value="">Elige…</option>
          {l.signo === 'ingreso' ? (
            rutas.ingreso.map((r) => (
              <option key={r.id} value={`c:${r.id}`}>
                {r.texto}
              </option>
            ))
          ) : (
            <>
              <optgroup label="Categorías">
                {rutas.descuento.map((r) => (
                  <option key={r.id} value={`c:${r.id}`}>
                    {r.texto}
                  </option>
                ))}
              </optgroup>
              {deudas.length > 0 && (
                <optgroup label="Deudas">
                  {deudas.map((d) => (
                    <option key={d.id} value={`d:${d.id}`}>
                      {d.cuotasRestantes == null
                        ? d.nombre.trim()
                        : `${d.nombre.trim()} · quedan ${plural(d.cuotasRestantes, 'cuota', 'cuotas')}`}
                    </option>
                  ))}
                </optgroup>
              )}
            </>
          )}
        </select>
        <span className="signo" role="group" aria-label={`Tipo de ${l.descripcion}`}>
          <button type="button" className="i" aria-pressed={l.signo === 'ingreso'} onClick={() => voltear(l, 'ingreso')}>
            Ingreso
          </button>
          <button type="button" className="d" aria-pressed={l.signo === 'descuento'} onClick={() => voltear(l, 'descuento')}>
            Desc.
          </button>
        </span>
      </div>
    )
  }

  const tabla = (titulo: string, clase: string, filas: LineaDeNomina[], total: number, extra: string) => (
    <section className={`tabla-nomina ${clase}`} aria-label={titulo}>
      <header>
        <h3>{titulo.toUpperCase()}</h3>
        <span className="apagado">
          {plural(filas.length, 'línea', 'líneas')}
          {extra}
        </span>
        <span className="tot num">{dinero(total)}</span>
      </header>
      {filas.map(fila)}
    </section>
  )

  const enDeudas = deDescuento.filter((l) => l.deudaId).length
  const ok =
    papel == null
      ? 'el comprobante no trae el neto · compáralo con la foto'
      : diferencia === 0
        ? 'cuadra con el comprobante'
        : `${dinero(Math.abs(diferencia))} de ${diferencia > 0 ? 'más' : 'menos'} · el comprobante dice ${dinero(papel)}`

  return (
    <>
      <div className="factura-cuerpo">
        <Vista archivo={archivo} url={vista} leyendo={false} />
        <div className="factura-lado nomina">
          <div className="dos-columnas">
            <div className="campo">
              <label htmlFor="f-empleador">Empleador</label>
              <input id="f-empleador" autoComplete="off" value={empleador} onChange={(e) => setEmpleador(e.target.value)} />
              {campos.nit && <span className="nota">NIT {campos.nit}</span>}
            </div>
            <div className="campo">
              <label htmlFor="f-fecha">Fecha</label>
              <CampoDeFecha id="f-fecha" dia={dia} hoy={diaDe(ahora())} alCambiar={setDia} />
            </div>
          </div>

          <ElegirCuenta tipo="income" leyenda="Entra a" datos={datos} cuentaId={cuentaId} alElegir={setCuentaId} />

          {tabla('Ingresos', 'i', deIngreso, ingresos, '')}
          {tabla(
            'Descuentos',
            'd',
            deDescuento,
            descuentos,
            enDeudas > 0 ? ` · ${enDeudas} ${enDeudas === 1 ? 'va a deudas' : 'van a deudas'}` : '',
          )}

          <details className="guardara">
            <summary>Se guardará: {queSeGuarda}</summary>
            <div className="mov num">
              <span className="ing">
                <b>Ingreso</b> en {cuenta}
              </span>
              <b className="ing">{dinero(ingresos)}</b>
              <small>{detalleDe(deIngreso, datos)}</small>
            </div>
            {gastos.length > 0 && (
              <div className="mov num">
                <span className="gas">
                  <b>Gasto</b> desde {cuenta}
                </span>
                <b className="gas">{dinero(sumaDe(gastos.map((l) => l.monto)))}</b>
                <small>{detalleDe(gastos, datos)}</small>
              </div>
            )}
            {abonos.map((a) => (
              <div key={a.id} className="mov num">
                <span className="deu">
                  <b>Abono</b> a {a.nombre}
                </span>
                <b className="deu">{dinero(a.monto)}</b>
                <small>El servidor lo reparte en capital e intereses al guardar</small>
              </div>
            ))}
          </details>

          <div className="campo">
            <label htmlFor="f-nota">Observaciones</label>
            <input id="f-nota" autoComplete="off" placeholder="Opcional" value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>

          {error && (
            <div role="alert" className="aviso">
              <span>{error.message}</span>
              {error.codigo === 'posible_duplicado' && (
                <button type="button" disabled={guardando} onClick={() => void registrar(true)}>
                  Guardar igual
                </button>
              )}
            </div>
          )}

          <div data-testid="barra-neto" className={`barra-neto num ${diferencia !== 0 ? 'mal' : ''}`}>
            <span>{dinero(ingresos)}</span>
            <span className="op">−</span>
            <span>{dinero(descuentos)}</span>
            <span className="op">=</span>
            <span className="neto">{dinero(neto)}</span>
            <span className="ok">{ok}</span>
          </div>
        </div>
      </div>

      <div className="factura-pie">
        <span className="apagado">{motivo ?? `Se guardan ${queSeGuarda}`}</span>
        <button type="button" className="secundario empujar" disabled={guardando} onClick={() => alCerrar(false)}>
          Cancelar
        </button>
        <button type="button" className="guardar-factura" disabled={!!motivo || guardando} onClick={() => void registrar(false)}>
          Guardar nómina · neto {dinero(neto)}
        </button>
      </div>
    </>
  )
}
