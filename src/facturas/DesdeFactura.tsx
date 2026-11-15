import { useEffect, useMemo, useRef, useState } from 'react'
import { colorDe, dinero } from '../core/formato'
import { diaDe } from '../tablero/calculo'
import { CampoDeFecha } from '../movimientos/CampoDeFecha'
import type { FuenteDeMovimientos } from '../movimientos/fuente'
import {
  categoriasPara,
  fechaParaServidor,
  leerMonto,
  rutaDeCategoria,
  type DatosDeMovimientos,
} from '../movimientos/reglas'
import type { FuenteDeFacturas } from './fuente'
import { useGuardarFactura } from './guardar'
import { ElegirCuenta, Vista } from './piezas'
import {
  camposDeFactura,
  categoriaSugerida,
  cuentaSugerida,
  diferenciaDe,
  esNomina,
  partesDe,
  problemaDelArchivo,
  sumaDe,
  textoDeMonto,
  type DeudaAbierta,
  type LecturaDeFactura,
} from './reglas'
import { RevisionDeNomina } from './RevisionDeNomina'

/** Polls every 2 s while `parse-receipt` works, for about a minute. */
const PAUSA_MS = 2000
const INTENTOS = 30
const esperar = (ms: number) => new Promise<void>((listo) => setTimeout(listo, ms))

type Fase =
  | { tipo: 'elegir'; problema: string | null }
  | { tipo: 'leyendo' }
  | { tipo: 'fallo'; mensaje: string }
  /** [deudas] is `null` on a purchase, and the open debts on a payslip. */
  | { tipo: 'revisar'; lectura: LecturaDeFactura; deudas: DeudaAbierta[] | null }

/**
 * «Registrar desde factura» (proposal 2): a wide dialog that takes a
 * photo or PDF, uploads it, waits for `parse-receipt` and shows the
 * receipt beside a review form that saves through
 * `registrar_movimiento_de_factura`. A payslip gets its own review
 * (`RevisionDeNomina`), saved through `registrar_nomina_de_factura`.
 * [alCerrar] says whether it saved.
 */
export function DesdeFactura({
  datos,
  fuente,
  movimientos,
  ahora,
  alCerrar,
  pausa = esperar,
}: {
  datos: DatosDeMovimientos
  fuente: FuenteDeFacturas
  movimientos: FuenteDeMovimientos
  ahora: () => Date
  alCerrar: (guardado: boolean) => void
  /** The wait between polls; tests make it instant. */
  pausa?: (ms: number) => Promise<void>
}) {
  const [fase, setFase] = useState<Fase>({ tipo: 'elegir', problema: null })
  const [archivo, setArchivo] = useState<File | null>(null)
  const [vista, setVista] = useState<string | null>(null)
  const [encima, setEncima] = useState(false)
  const [guardando, setGuardando] = useState(false)
  /** The receipt's id; a retry uploads to the same row. */
  const [reciboId] = useState(() => crypto.randomUUID())
  /** The movement's id, fixed on open: a retried save cannot store it twice. */
  const [nuevoId] = useState(() => crypto.randomUUID())
  const ciclo = useRef(0)
  const montado = useRef(true)
  const raiz = useRef<HTMLDivElement>(null)
  const elegirBoton = useRef<HTMLButtonElement>(null)
  const entrada = useRef<HTMLInputElement>(null)

  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])

  // Escape closes, but not while a save is on its way.
  const cerrarRef = useRef(() => {})
  cerrarRef.current = () => {
    if (!guardando) alCerrar(false)
  }
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrarRef.current()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [])

  // The focus starts on Elegir archivo, and stays inside as the steps change.
  useEffect(() => {
    if (fase.tipo === 'elegir') elegirBoton.current?.focus()
    else if (!raiz.current?.contains(document.activeElement)) raiz.current?.focus()
  }, [fase.tipo])

  useEffect(() => {
    if (!archivo || typeof URL.createObjectURL !== 'function') return
    const url = URL.createObjectURL(archivo)
    setVista(url)
    return () => {
      URL.revokeObjectURL(url)
      setVista(null)
    }
  }, [archivo])

  async function leerFactura(a: File) {
    const n = ++ciclo.current
    const vigente = () => montado.current && ciclo.current === n
    setFase({ tipo: 'leyendo' })
    try {
      await fuente.subir(reciboId, a)
    } catch {
      if (vigente()) setFase({ tipo: 'fallo', mensaje: 'No se pudo subir la factura. Revisa la conexión e intenta de nuevo.' })
      return
    }
    if (!vigente()) return
    try {
      await fuente.leer(reciboId)
    } catch {
      // A timeout or a lost answer is not a failure: the row says how it went.
    }
    for (let intento = 0; vigente(); intento++) {
      const l = await fuente.consultar(reciboId).catch(() => null)
      if (!vigente()) return
      if (l?.estado === 'failed') {
        setFase({ tipo: 'fallo', mensaje: l.error || 'No se pudo leer la factura.' })
        return
      }
      if (l && l.estado !== 'uploaded' && l.estado !== 'processing') {
        // A payslip's deductions can pay debts; without them it still saves with categories.
        const deudas = esNomina(l.items) ? await (fuente.deudas?.() ?? Promise.resolve([])).catch(() => []) : null
        if (vigente()) setFase({ tipo: 'revisar', lectura: l, deudas })
        return
      }
      if (intento >= INTENTOS) {
        setFase({
          tipo: 'fallo',
          mensaje: 'La factura está tardando más de lo normal en leerse. Intenta de nuevo en un momento.',
        })
        return
      }
      await pausa(PAUSA_MS)
    }
  }

  function elegir(a: File | undefined) {
    if (!a) return
    const problema = problemaDelArchivo(a)
    if (problema) {
      setFase({ tipo: 'elegir', problema })
      return
    }
    setArchivo(a)
    void leerFactura(a)
  }

  const titulo = fase.tipo === 'leyendo' ? 'Leyendo la factura…' : 'Registrar desde factura'

  return (
    <div className="velo">
      <div ref={raiz} className="factura" role="dialog" aria-modal="true" aria-labelledby="t-factura" tabIndex={-1}>
        <div className="factura-cabeza">
          <h2 id="t-factura">{titulo}</h2>
          {fase.tipo === 'revisar' && fase.deudas && <span className="tipo-doc">Comprobante de nómina</span>}
          {archivo && <span className="apagado nombre-archivo">{archivo.name}</span>}
          <button className="flecha" aria-label="Cerrar" disabled={guardando} onClick={() => alCerrar(false)}>
            ✕
          </button>
        </div>

        {fase.tipo === 'elegir' && (
          <>
            <div className="factura-elegir">
              <div
                className={`soltar ${encima ? 'activo' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setEncima(true)
                }}
                onDragLeave={() => setEncima(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setEncima(false)
                  elegir(e.dataTransfer.files[0])
                }}
              >
                <div>
                  <span className="icono-hoja" aria-hidden="true" />
                  <b>Suelta la foto o el PDF de la factura</b>
                  <span>La leemos en unos segundos y tú revisas antes de guardar</span>
                </div>
                <button ref={elegirBoton} type="button" onClick={() => entrada.current?.click()}>
                  Elegir archivo
                </button>
                <input
                  ref={entrada}
                  type="file"
                  className="sk-sr"
                  tabIndex={-1}
                  aria-label="Archivo de la factura"
                  accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                  onChange={(e) => {
                    elegir(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                {fase.problema && (
                  <p role="alert" className="aviso">
                    {fase.problema}
                  </p>
                )}
              </div>
            </div>
            <div className="factura-pie">
              <span className="apagado">JPG, PNG o PDF de hasta 10 MB</span>
            </div>
          </>
        )}

        {fase.tipo === 'leyendo' && archivo && (
          <>
            <div className="factura-cuerpo">
              <Vista archivo={archivo} url={vista} leyendo />
              <div className="factura-lado" aria-busy="true">
                <p role="status" className="sk-sr">
                  Leyendo la factura…
                </p>
                <span className="skeleton" style={{ height: 46, width: '45%' }} />
                <div className="dos-columnas">
                  <span className="skeleton" style={{ height: 40 }} />
                  <span className="skeleton" style={{ height: 40 }} />
                </div>
                <span className="skeleton" style={{ height: 30, width: '80%' }} />
                {[100, 100, 100, 100, 65].map((w, i) => (
                  <span key={i} className={`skeleton skeleton--text sk-w${w}`} style={{ ['--sk-line' as string]: '34px' }} />
                ))}
              </div>
            </div>
            <div className="factura-pie">
              <span className="apagado">Puedes cancelar mientras lee</span>
              <button type="button" className="secundario empujar" onClick={() => alCerrar(false)}>
                Cancelar
              </button>
            </div>
          </>
        )}

        {fase.tipo === 'fallo' && (
          <>
            <div className="factura-cuerpo">
              {archivo && <Vista archivo={archivo} url={vista} leyendo={false} />}
              <div className="factura-lado">
                <div role="alert" className="aviso">
                  <span>{fase.mensaje}</span>
                  <div className="acciones">
                    <button type="button" onClick={() => archivo && void leerFactura(archivo)}>
                      Intentar de nuevo
                    </button>
                    <button
                      type="button"
                      className="secundario"
                      onClick={() => setFase({ tipo: 'elegir', problema: null })}
                    >
                      Elegir otro archivo
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="factura-pie">
              <button type="button" className="secundario empujar" onClick={() => alCerrar(false)}>
                Cancelar
              </button>
            </div>
          </>
        )}

        {fase.tipo === 'revisar' && archivo && fase.deudas && (
          <RevisionDeNomina
            lectura={fase.lectura}
            deudas={fase.deudas}
            archivo={archivo}
            vista={vista}
            datos={datos}
            reciboId={reciboId}
            nuevoId={nuevoId}
            movimientos={movimientos}
            ahora={ahora}
            guardando={guardando}
            setGuardando={setGuardando}
            alCerrar={alCerrar}
          />
        )}

        {fase.tipo === 'revisar' && archivo && !fase.deudas && (
          <Revision
            lectura={fase.lectura}
            archivo={archivo}
            vista={vista}
            datos={datos}
            reciboId={reciboId}
            nuevoId={nuevoId}
            movimientos={movimientos}
            ahora={ahora}
            guardando={guardando}
            setGuardando={setGuardando}
            alCerrar={alCerrar}
          />
        )}
      </div>
    </div>
  )
}

interface Fila {
  clave: string
  descripcion: string
  cantidad: number | null
  total: number | null
  categoriaId: string
}

const hojaDe = (ruta: string) => ruta.split(' › ').pop() ?? ruta
const padresDe = (ruta: string) => ruta.split(' › ').slice(0, -1).join(' › ')
const positivo = (n: number | null) => ((n ?? 0) > 0 ? n : 0)

function Revision({
  lectura,
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
  const [totalTexto, setTotalTexto] = useState(campos.total > 0 ? textoDeMonto(campos.total) : '')
  const [comercio, setComercio] = useState(campos.comercio ?? '')
  const [dia, setDia] = useState(campos.dia ?? diaDe(ahora()))
  const [cuentaId, setCuentaId] = useState(() => cuentaSugerida(lectura, datos.cuentas))
  const [filas, setFilas] = useState<Fila[]>(() =>
    lectura.items.map((i) => ({
      clave: `l${i.linea}`,
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      total: i.total,
      categoriaId: categoriaSugerida(i.categoriaSugerida, datos.categorias),
    })),
  )
  const conMonto = filas.filter((f) => (f.total ?? 0) > 0).length
  const [modo, setModo] = useState<'una' | 'items'>(conMonto >= 2 ? 'items' : 'una')
  const [categoriaId, setCategoriaId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [nota, setNota] = useState('')
  const { error, guardar } = useGuardarFactura(movimientos, setGuardando, alCerrar)

  const validas = useMemo(() => categoriasPara('expense', datos.categorias), [datos.categorias])
  const rutas = useMemo(
    () => validas.map((c) => ({ id: c.id, ...rutaDeCategoria(c.id, datos.categorias) })),
    [validas, datos.categorias],
  )
  const opciones = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase('es')
    if (!q) return []
    return rutas.filter((c) => c.texto.toLocaleLowerCase('es').includes(q)).slice(0, 8)
  }, [busqueda, rutas])
  const elegida = categoriaId ? rutaDeCategoria(categoriaId, datos.categorias) : null

  const monto = leerMonto(totalTexto)
  const montoValido = Number.isFinite(monto) && monto > 0
  const montos = filas.map((f) => positivo(f.total))
  const diferencia = montoValido ? diferenciaDe(monto, montos) : 0
  const suma = sumaDe(montos)
  const partes = modo === 'items' ? partesDe(filas) : null

  const motivo = !montoValido
    ? 'Escribe un total mayor que cero'
    : !cuentaId
      ? 'Elige la cuenta para poder guardar'
      : modo === 'una' && !categoriaId
        ? 'Elige una categoría para poder guardar'
        : modo === 'items' && diferencia !== 0
          ? 'Los ítems no cuadran con el total'
          : modo === 'items' && !partes
            ? 'Elige la categoría de cada ítem'
            : null
  const resumen =
    motivo ?? (partes && partes.length >= 2 ? `Se guarda un gasto con ${partes.length} partes` : 'Se guarda un gasto')

  function agregarDiferencia() {
    setFilas((f) => [
      ...f,
      { clave: `d${f.length}`, descripcion: 'Diferencia con el total', cantidad: null, total: diferencia, categoriaId: '' },
    ])
  }

  async function registrar(guardarIgual: boolean) {
    if (motivo) return
    await guardar('registrar_movimiento_de_factura', {
      p_household_id: datos.hogarId,
      p_receipt_id: reciboId,
      p_account_id: cuentaId,
      p_amount: monto,
      p_category_id: modo === 'una' ? categoriaId : null,
      p_occurred_at: fechaParaServidor(dia, ahora()),
      p_note: nota.trim() || null,
      p_merchant_name: comercio.trim() || null,
      p_merchant_nit: campos.nit,
      p_partes: modo === 'items' ? partes : null,
      p_guardar_igual: guardarIgual,
      p_id: nuevoId,
    })
  }

  return (
    <>
      <div className="factura-cuerpo">
        <Vista archivo={archivo} url={vista} leyendo={false} />
        <div className="factura-lado">
          <div className="factura-arriba">
            <div className="campo">
              <label htmlFor="f-total">Total</label>
              <div className="monto gasto izq">
                <span aria-hidden="true">$</span>
                <input
                  id="f-total"
                  className="num"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  style={{ width: `${Math.max(1, totalTexto.length) + 0.3}ch` }}
                  value={totalTexto}
                  onChange={(e) => setTotalTexto(e.target.value)}
                />
              </div>
            </div>
            <div className="dos-columnas">
              <div className="campo">
                <label htmlFor="f-comercio">Comercio</label>
                <input id="f-comercio" autoComplete="off" value={comercio} onChange={(e) => setComercio(e.target.value)} />
                {campos.nit && <span className="nota">NIT {campos.nit}</span>}
              </div>
              <div className="campo">
                <label htmlFor="f-fecha">Fecha</label>
                <CampoDeFecha id="f-fecha" dia={dia} hoy={diaDe(ahora())} alCambiar={setDia} />
              </div>
            </div>
          </div>

          <ElegirCuenta tipo="expense" leyenda="Sale de" datos={datos} cuentaId={cuentaId} alElegir={setCuentaId} />

          <div className="fila-etiqueta">
            <span className="etiqueta">Categoría</span>
            <div className="segmento" role="group" aria-label="Cómo se clasifica">
              <button type="button" aria-pressed={modo === 'una'} onClick={() => setModo('una')}>
                Una para todo
              </button>
              <button type="button" aria-pressed={modo === 'items'} disabled={conMonto === 0} onClick={() => setModo('items')}>
                Repartir por ítem
              </button>
            </div>
          </div>

          {modo === 'una' && (
            <div className="campo">
              {elegida && !buscando ? (
                <button type="button" className="categoria-elegida" onClick={() => setBuscando(true)}>
                  <span className="punto" style={{ background: colorDe(elegida.color) }} />
                  <span className="categoria-texto">
                    <b>{hojaDe(elegida.texto)}</b>
                    <span className="apagado">{padresDe(elegida.texto)}</span>
                  </span>
                  <span className="cambiar">Cambiar</span>
                </button>
              ) : (
                <input
                  aria-label="Categoría"
                  placeholder="Buscar categoría…"
                  autoComplete="off"
                  autoFocus={buscando}
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  onBlur={() => {
                    if (!busqueda.trim()) setBuscando(false)
                  }}
                />
              )}
              {opciones.length > 0 && (
                <ul className="sugerencias" role="listbox" aria-label="Categorías">
                  {opciones.map((o) => (
                    <li
                      key={o.id}
                      role="option"
                      aria-selected={o.id === categoriaId}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setCategoriaId(o.id)
                        setBusqueda('')
                        setBuscando(false)
                      }}
                    >
                      <span className="punto" style={{ background: colorDe(o.color) }} />
                      {o.texto}
                    </li>
                  ))}
                </ul>
              )}
              {busqueda.trim() && opciones.length === 0 && <span className="nota">Ninguna categoría coincide.</span>}
            </div>
          )}

          {modo === 'items' && (
            <>
              <div className="tabla-envoltura">
                <table className="tabla-items num">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Descripción</th>
                      <th>Cant.</th>
                      <th>Total</th>
                      <th>Categoría</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f, i) => (
                      <tr key={f.clave}>
                        <td>
                          <span className="nro">{i + 1}</span>
                        </td>
                        <td className="descripcion">{f.descripcion}</td>
                        <td>{f.cantidad == null ? '' : f.cantidad.toLocaleString('es-CO')}</td>
                        <td>{f.total == null ? '—' : dinero(f.total)}</td>
                        <td>
                          {(f.total ?? 0) > 0 && (
                            <select
                              aria-label={`Categoría del ítem ${i + 1}`}
                              value={f.categoriaId}
                              onChange={(e) => {
                                const id = e.target.value
                                setFilas((todas) => todas.map((x) => (x.clave === f.clave ? { ...x, categoriaId: id } : x)))
                              }}
                            >
                              <option value="">Elige…</option>
                              {rutas.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.texto}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {montoValido && diferencia === 0 && (
                <span className="cuadra">
                  Los {conMonto} ítems suman {dinero(suma)} · cuadra con el total
                </span>
              )}
              {montoValido && diferencia !== 0 && (
                <div role="alert" className="aviso">
                  <span>
                    <b>
                      {diferencia > 0 ? 'Faltan' : 'Sobran'} {dinero(Math.abs(diferencia))}.
                    </b>{' '}
                    Los ítems suman {dinero(suma)} y el total es {dinero(monto)}. Compara con la foto.
                  </span>
                  <div className="acciones">
                    {diferencia > 0 && (
                      <button type="button" className="secundario" onClick={agregarDiferencia}>
                        Agregar {dinero(diferencia)} como ítem
                      </button>
                    )}
                    <button type="button" className="secundario" onClick={() => setTotalTexto(textoDeMonto(suma))}>
                      Cambiar el total
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

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
        </div>
      </div>

      <div className="factura-pie">
        <span className="apagado">{resumen}</span>
        <button type="button" className="secundario empujar" disabled={guardando} onClick={() => alCerrar(false)}>
          Cancelar
        </button>
        <button type="button" className="guardar-factura" disabled={!!motivo || guardando} onClick={() => void registrar(false)}>
          {montoValido ? `Guardar gasto · ${dinero(monto)}` : 'Guardar gasto'}
        </button>
      </div>
    </>
  )
}
