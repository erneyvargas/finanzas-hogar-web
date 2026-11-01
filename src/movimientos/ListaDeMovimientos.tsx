import { colorDe, dinero, MESES, nombreDelMes } from '../core/formato'
import { diaDe } from '../tablero/calculo'
import { rutaDeCategoria, type DatosDeMovimientos, type FilaDeMovimiento } from './reglas'

/** `24 oct` for a timestamp, in Bogotá. */
function diaCorto(iso: string) {
  const [, m, d] = diaDe(iso).split('-').map(Number)
  return `${d} ${MESES[m - 1].slice(0, 3)}`
}

/** The account's face: its initials on a tile, as the phone shows it without a logo. */
export function Cara({ nombre }: { nombre: string }) {
  const iniciales = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
  return (
    <span className="cara" aria-hidden="true">
      {iniciales || '·'}
    </span>
  )
}

/**
 * The month's movements, newest first (transfers are not loaded, same
 * as the phone's Inicio). Clicking one opens it to correct.
 */
export function ListaDeMovimientos({
  mes,
  datos,
  alElegir,
}: {
  mes: string
  datos: DatosDeMovimientos
  alElegir: (m: FilaDeMovimiento) => void
}) {
  const cuentas = new Map(datos.cuentas.map((c) => [c.id, c]))
  const filas = [...datos.movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha))

  return (
    <section className="tarjeta movimientos" aria-labelledby="t-movimientos">
      <h2 id="t-movimientos">Movimientos de {nombreDelMes(mes)}</h2>
      {filas.length === 0 ? (
        <p className="nota">Sin movimientos este mes.</p>
      ) : (
        <div className="tabla-envoltura">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Comercio</th>
                <th>Categoría</th>
                <th>Cuenta</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((m) => {
                const ruta = rutaDeCategoria(m.categoriaId, datos.categorias)
                const partes = ruta.texto.split(' › ')
                const hoja = partes[partes.length - 1]
                const cuenta = cuentas.get(m.cuentaId)?.nombre ?? 'Cuenta'
                return (
                  <tr
                    key={m.id}
                    className="elegible"
                    tabIndex={0}
                    onClick={() => alElegir(m)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        alElegir(m)
                      }
                    }}
                  >
                    <td>{diaCorto(m.fecha)}</td>
                    <td>{m.comercio || hoja}</td>
                    <td>
                      <span className="punto" style={{ background: colorDe(ruta.color) }} />
                      {ruta.texto}
                    </td>
                    <td>
                      <Cara nombre={cuenta} />
                      {cuenta}
                    </td>
                    <td className={`num ${m.tipo === 'expense' ? 'gasto' : 'ingreso'}`}>
                      {m.tipo === 'expense' ? '−' : '+'}
                      {dinero(m.monto)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
