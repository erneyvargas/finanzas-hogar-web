import { useEffect, useMemo, useRef, useState } from 'react'
import { dinero, miles } from '../core/formato'
import { diaDe, idDelRubroDeAjuste } from '../tablero/calculo'
import { CampoConSugerencias } from './CampoConSugerencias'
import { opcionesDeCategoria, usosPorCategoria } from './categorias'
import { CampoDeFecha } from './CampoDeFecha'
import { historialDeTextos, sugerir } from './historial'
import type { FuenteDeFacturas } from '../facturas/fuente'
import { problemaDelArchivo } from '../facturas/reglas'
import type { FuenteDeMovimientos } from './fuente'
import { Cara } from './ListaDeMovimientos'
import { CampoDeCategoria } from './SelectorDeCategoria'
import {
  ErrorDelServidor,
  MENSAJE_GENERICO,
  cambiosDe,
  cuentasPara,
  fechaParaServidor,
  leerMonto,
  masUsadas,
  rutaDeCategoria,
  type DatosDeMovimientos,
  type FilaDeMovimiento,
  type Llamada,
  type Tipo,
} from './reglas'

/** `14500` → `14.500` while typing; a decimal comma is left as typed. */
function agrupar(texto: string): string {
  if (texto.includes(',')) return texto
  const digitos = texto.replace(/\D/g, '')
  return digitos ? miles(Number(digitos)) : ''
}

/** `Guardar gasto · $14.500`, without the amount until there is one. */
function textoDeGuardar(tipo: Tipo, monto: number): string {
  const base = tipo === 'expense' ? 'Guardar gasto' : 'Guardar ingreso'
  return Number.isFinite(monto) && monto > 0 ? `${base} · ${dinero(monto)}` : base
}

const comoError = (e: unknown) =>
  e instanceof ErrorDelServidor ? e : new ErrorDelServidor(MENSAJE_GENERICO, null)

/** The original with the fields of [llamada] already applied by the server. */
function aplicar(m: FilaDeMovimiento, { funcion, params }: Llamada): FilaDeMovimiento {
  switch (funcion) {
    case 'cambiar_categoria':
      return { ...m, categoriaId: params.p_category_id as string }
    case 'cambiar_cuenta':
      return { ...m, cuentaId: params.p_account_id as string }
    case 'cambiar_monto':
      return { ...m, monto: params.p_amount as number }
    case 'cambiar_fecha':
      return { ...m, fecha: params.p_occurred_at as string }
    case 'cambiar_nota':
      return { ...m, nota: params.p_note as string | null }
    default:
      return m
  }
}

/**
 * The side panel (option A): registers a movement, or corrects
 * [original] when given. A registration from [copia] (Duplicar) starts
 * with that movement's fields and today as its date. Every write is a server function; its
 * rejections are shown here and the panel stays open. [alCerrar] says
 * whether something was saved, so the page reloads.
 */
export function Panel({
  datos,
  original,
  copia = null,
  categoriaInicial,
  busquedaInicial = '',
  montoInicial,
  cuentaInicial,
  comercioInicial,
  fuente,
  facturas,
  ahora,
  alCerrar,
  alDuplicar,
}: {
  datos: DatosDeMovimientos
  original: FilaDeMovimiento | null
  /** The movement a new registration copies; ignored while correcting. */
  copia?: FilaDeMovimiento | null
  /** A new movement's category, already chosen. */
  categoriaInicial?: string
  /** A new movement's category search, already typed (the picker opens on it). */
  busquedaInicial?: string
  /** A new movement's amount, account and merchant, already filled (Pagar in Por vencer). */
  montoInicial?: number
  cuentaInicial?: string
  comercioInicial?: string
  fuente: FuenteDeMovimientos
  /** Where a new movement's receipt goes as evidence; without `vincular`, no receipt is offered. */
  facturas?: Pick<FuenteDeFacturas, 'subir' | 'vincular'>
  ahora: () => Date
  /** Whether something was saved; a registration also gives the new id. */
  alCerrar: (guardado: boolean, idNuevo?: string) => void
  /** Offers Duplicar while correcting; gets the movement as it now stands. */
  alDuplicar?: (m: FilaDeMovimiento) => void
}) {
  const corrigiendo = original !== null
  // What fills the fields: the movement being corrected, or the one copied.
  const desde = original ?? copia
  const inicial = (t: Tipo) => {
    const ofrecidas = cuentasPara(t, datos.cuentas)
    return masUsadas(datos.movimientos, t, ofrecidas)[0] ?? ofrecidas[0]?.id ?? ''
  }

  const [base, setBase] = useState(original)
  const [tipo, setTipo] = useState<Tipo>(desde?.tipo ?? 'expense')
  const [montoTexto, setMontoTexto] = useState(
    desde ? miles(desde.monto) : montoInicial && montoInicial > 0 ? miles(montoInicial) : '',
  )
  const [categoriaId, setCategoriaId] = useState(desde?.categoriaId ?? categoriaInicial ?? '')
  const [cuentaId, setCuentaId] = useState(
    desde?.cuentaId ??
      (cuentaInicial && datos.cuentas.some((c) => c.id === cuentaInicial) ? cuentaInicial : inicial(desde?.tipo ?? 'expense')),
  )
  const [otra, setOtra] = useState(false)
  const [dia, setDia] = useState(original ? diaDe(original.fecha) : diaDe(ahora()))
  const [comercio, setComercio] = useState(desde?.comercio ?? comercioInicial ?? '')
  const [nota, setNota] = useState(desde?.nota ?? '')
  const [saldos, setSaldos] = useState<Record<string, number | null>>({})
  const [error, setError] = useState<ErrorDelServidor | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [huboCambios, setHuboCambios] = useState(false)
  /**
   * The new movement's id, fixed when the panel opens: a retry after a
   * lost answer sends the same id, so the server cannot store it twice.
   */
  const [nuevoId] = useState(() => crypto.randomUUID())
  const yaIntento = useRef(false)
  /** The receipt attached as evidence, its fixed id, and how far its save got. */
  const [archivo, setArchivo] = useState<File | null>(null)
  const [reciboId] = useState(() => crypto.randomUUID())
  const subido = useRef<File | null>(null)
  const registrado = useRef(false)
  const ofreceFactura = !original && !!facturas?.vincular

  // A copied image (a screenshot, an image copied from a page) or a copied
  // file pasted anywhere in the panel with Ctrl+V becomes the receipt.
  const elegirRef = useRef<(f: File | undefined) => void>(() => {})
  useEffect(() => {
    if (!ofreceFactura) return
    const pegar = (e: ClipboardEvent) => {
      const archivos = Array.from(e.clipboardData?.files ?? [])
      const pegado = archivos.find((a) => a.type.startsWith('image/') || a.type === 'application/pdf')
      if (!pegado) return
      e.preventDefault()
      // The browser names every pasted screenshot «image.png».
      const nombre = /^image\.(png|jpe?g)$/i.test(pegado.name) ? `captura.${pegado.name.split('.').pop()}` : pegado.name
      elegirRef.current(nombre === pegado.name ? pegado : new File([pegado], nombre, { type: pegado.type }))
    }
    window.addEventListener('paste', pegar)
    return () => window.removeEventListener('paste', pegar)
  }, [ofreceFactura])

  function elegirArchivo(elegido: File | undefined) {
    if (!elegido) return
    const problema = problemaDelArchivo(elegido)
    if (problema) {
      setError(new ErrorDelServidor('Sube una foto JPG o PNG, o un PDF de hasta 10 MB.', 'local'))
      return
    }
    setError(null)
    setArchivo(elegido)
  }
  elegirRef.current = (f) => {
    if (!guardando && !registrado.current) elegirArchivo(f)
  }

  // Escape closes, like the ✕, but not while a save is on its way: its
  // answer (or its error) still belongs to this panel.
  const cerrarRef = useRef(() => {})
  cerrarRef.current = () => {
    if (!guardando) alCerrar(huboCambios)
  }
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrarRef.current()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [])

  // The focus moves into the panel when it opens, to the first field that
  // takes input; the dashboard gives it back to its opener when it closes.
  const raiz = useRef<HTMLElement>(null)
  useEffect(() => {
    raiz.current?.querySelector<HTMLElement>('input:not(:disabled), button')?.focus()
  }, [])

  const ofrecidas = useMemo(() => {
    const deTipo = cuentasPara(tipo, datos.cuentas)
    // A correction keeps showing its account even if it no longer qualifies.
    const actual = datos.cuentas.find((c) => c.id === desde?.cuentaId)
    return actual && !deTipo.includes(actual) ? [...deTipo, actual] : deTipo
  }, [tipo, datos.cuentas, desde])
  const usadas = masUsadas(datos.movimientos, tipo, ofrecidas)
  const chips = usadas.filter((id) => id !== cuentaId).slice(0, 3)
  const cuenta = datos.cuentas.find((c) => c.id === cuentaId)

  const opcionesPara = (t: Tipo) => opcionesDeCategoria(t, datos.categorias, idDelRubroDeAjuste(datos.hogarId))
  const opciones = useMemo(
    () => opcionesDeCategoria(tipo, datos.categorias, idDelRubroDeAjuste(datos.hogarId)),
    [tipo, datos.categorias, datos.hogarId],
  )
  const usos = useMemo(
    () => usosPorCategoria(datos.historial ?? datos.movimientos, tipo),
    [datos.historial, datos.movimientos, tipo],
  )
  // A chosen category no longer offered (archived, being corrected) still shows its last two levels.
  const rutaDeRespaldo = categoriaId
    ? rutaDeCategoria(categoriaId, datos.categorias).texto.split(' › ').slice(-2).join(' › ')
    : null

  // What this household already wrote for this kind, to suggest.
  const historial = useMemo(
    () => historialDeTextos((datos.historial ?? datos.movimientos).filter((m) => m.tipo === tipo)),
    [datos.historial, datos.movimientos, tipo],
  )

  useEffect(() => {
    if (!cuentaId || cuentaId in saldos) return
    let vivo = true
    fuente
      .saldo(cuentaId)
      .catch(() => null)
      .then((s) => {
        if (vivo) setSaldos((prev) => ({ ...prev, [cuentaId]: s }))
      })
    return () => {
      vivo = false
    }
  }, [cuentaId, saldos, fuente])

  function cambiarTipo(t: Tipo) {
    if (t === tipo) return
    setTipo(t)
    if (!opcionesPara(t).some((o) => o.id === categoriaId)) setCategoriaId('')
    setCuentaId(inicial(t))
    setOtra(false)
    setError(null)
  }

  function validar(): number | null {
    const monto = leerMonto(montoTexto)
    let mensaje: string | null = null
    if (!Number.isFinite(monto) || monto <= 0) mensaje = 'Escribe un valor mayor que cero.'
    else if (!categoriaId) mensaje = 'Elige una categoría.'
    else if (!cuentaId) mensaje = tipo === 'expense' ? 'Elige de qué cuenta sale.' : 'Elige a qué cuenta entra.'
    else if (!dia) mensaje = 'Elige la fecha.'
    if (mensaje) {
      setError(new ErrorDelServidor(mensaje, 'local'))
      return null
    }
    return monto
  }

  async function registrar(guardarIgual: boolean) {
    const monto = validar()
    if (monto === null) return
    setGuardando(true)
    setError(null)
    // The receipt goes up first: if it cannot, nothing is stored yet.
    if (archivo && facturas && subido.current !== archivo) {
      try {
        await facturas.subir(reciboId, archivo)
        subido.current = archivo
      } catch {
        setError(new ErrorDelServidor('No se pudo subir la factura. Revisa la conexión e intenta de nuevo.', 'local'))
        setGuardando(false)
        return
      }
    }
    if (!registrado.current) {
      try {
        await fuente.ejecutar('registrar_movimiento', {
          p_household_id: datos.hogarId,
          p_account_id: cuentaId,
          p_kind: tipo,
          p_amount: monto,
          p_category_id: categoriaId,
          p_occurred_at: fechaParaServidor(dia, ahora()),
          p_note: nota.trim() || null,
          p_merchant_name: comercio.trim() || null,
          p_guardar_igual: guardarIgual,
          p_id: nuevoId,
        })
        registrado.current = true
      } catch (e) {
        const fallo = comoError(e)
        // Only a retry after an unknown outcome (no answer, no rule) can meet
        // its own earlier save; a rule rejection stored nothing.
        if (fallo.codigo === 'ya_existe' && yaIntento.current) {
          registrado.current = true
        } else {
          if (fallo.codigo === null) yaIntento.current = true
          setError(fallo)
          setGuardando(false)
          return
        }
      }
    }
    // The movement is stored; a failed link only retries the link.
    if (archivo && facturas?.vincular) {
      try {
        await facturas.vincular(nuevoId, reciboId)
      } catch {
        setError(
          new ErrorDelServidor('El movimiento quedó guardado, pero la factura no quedó pegada. Intenta de nuevo.', 'local'),
        )
        setHuboCambios(true)
        setGuardando(false)
        return
      }
    }
    alCerrar(true, nuevoId)
  }

  async function corregir() {
    const monto = validar()
    if (monto === null || !base) return
    const llamadas = cambiosDe(base, { monto, categoriaId, cuentaId, dia, nota })
    if (llamadas.length === 0) return alCerrar(huboCambios)
    setGuardando(true)
    setError(null)
    let hecho = base
    try {
      for (const l of llamadas) {
        await fuente.ejecutar(l.funcion, l.params)
        hecho = aplicar(hecho, l)
      }
      alCerrar(true)
    } catch (e) {
      // What the server already took stays; a retry sends only the rest.
      if (hecho !== base) {
        setBase(hecho)
        setHuboCambios(true)
      }
      setError(comoError(e))
      setGuardando(false)
    }
  }

  async function borrar() {
    if (!base) return
    setGuardando(true)
    setError(null)
    try {
      await fuente.ejecutar('borrar_movimiento', { p_id: base.id })
      alCerrar(true)
    } catch (e) {
      setError(comoError(e))
      setGuardando(false)
      setBorrando(false)
    }
  }

  const titulo = corrigiendo ? 'Corregir movimiento' : copia ? 'Duplicar movimiento' : 'Registrar movimiento'
  const saldo = cuentaId ? saldos[cuentaId] : undefined

  return (
    <aside ref={raiz} className="panel" role="dialog" aria-labelledby="t-panel">
      <div className="panel-cabeza">
        <h2 id="t-panel">{titulo}</h2>
        <button className="flecha" aria-label="Cerrar" onClick={() => alCerrar(huboCambios)}>
          ✕
        </button>
      </div>

      <form
        className="panel-cuerpo"
        onSubmit={(e) => {
          e.preventDefault()
          void (corrigiendo ? corregir() : registrar(false))
        }}
      >
        <div className="cabecera-monto">
          <div className="alternar" role="group" aria-label="Tipo">
            {(['expense', 'income'] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tipo === t}
                disabled={corrigiendo}
                onClick={() => cambiarTipo(t)}
              >
                {t === 'expense' ? 'Gasto' : 'Ingreso'}
              </button>
            ))}
          </div>
          <label htmlFor="p-valor">Valor</label>
          <div className={`monto ${tipo === 'expense' ? 'gasto' : 'ingreso'}`}>
            <span aria-hidden="true">$</span>
            <input
              id="p-valor"
              className="num"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              style={{ width: `${Math.max(1, montoTexto.length) + 0.3}ch` }}
              value={montoTexto}
              onChange={(e) => setMontoTexto(agrupar(e.target.value))}
            />
          </div>
        </div>

        <CampoDeCategoria
          tipo={tipo}
          opciones={opciones}
          usos={usos}
          categoriaId={categoriaId}
          rutaDeRespaldo={rutaDeRespaldo}
          busquedaInicial={desde ? '' : busquedaInicial}
          alElegir={setCategoriaId}
        />

        <fieldset className="campo cuenta">
          <legend>{tipo === 'expense' ? 'Sale de' : 'Entra a'}</legend>
          <div className="cuenta-elegida">
            {cuenta ? (
              <>
                <Cara nombre={cuenta.nombre} foto={cuenta.foto} />
                <b>{cuenta.nombre}</b>
                {typeof saldo === 'number' && (
                  <span className="apagado saldo num">
                    saldo {saldo < 0 ? `−${dinero(-saldo)}` : dinero(saldo)}
                  </span>
                )}
              </>
            ) : (
              <span className="apagado">Sin cuenta para este tipo</span>
            )}
          </div>
          <div className="chips">
            {chips.map((id) => {
              const c = datos.cuentas.find((x) => x.id === id)!
              return (
                <button key={id} type="button" className="chip" onClick={() => setCuentaId(id)}>
                  <Cara nombre={c.nombre} foto={c.foto} />
                  {c.nombre}
                </button>
              )
            })}
            <button type="button" className="chip" aria-expanded={otra} onClick={() => setOtra(!otra)}>
              Otra…
            </button>
          </div>
          {otra && (
            <select
              aria-label="Otra cuenta"
              value={cuentaId}
              onChange={(e) => {
                setCuentaId(e.target.value)
                setOtra(false)
              }}
            >
              {ofrecidas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          )}
        </fieldset>

        <div className="dos-columnas">
          <div className="campo">
            <label htmlFor="p-fecha">Fecha</label>
            <CampoDeFecha id="p-fecha" dia={dia} hoy={diaDe(ahora())} alCambiar={setDia} />
          </div>
          <div className="campo">
            <label htmlFor="p-comercio">Comercio</label>
            <CampoConSugerencias
              id="p-comercio"
              valor={comercio}
              alCambiar={setComercio}
              sugerencias={sugerir(historial.comercios, comercio, categoriaId)}
              nombreDeLista="Sugerencias de comercio"
              disabled={corrigiendo}
              title={corrigiendo ? 'El comercio no se corrige desde aquí' : undefined}
            />
          </div>
        </div>

        <div className="campo">
          <label htmlFor="p-nota">Observaciones</label>
          <CampoConSugerencias
            id="p-nota"
            valor={nota}
            alCambiar={setNota}
            sugerencias={sugerir(historial.notas, nota, categoriaId)}
            nombreDeLista="Sugerencias de observaciones"
            placeholder="Opcional"
          />
        </div>

        {ofreceFactura && (
          <div className="campo">
            <span className="etiqueta-de-campo">Factura o comprobante</span>
            {archivo ? (
              <div className="adjunto-elegido">
                <span className="adjunto-nombre">{archivo.name}</span>
                <button
                  type="button"
                  className="secundario"
                  aria-label="Quitar la factura"
                  disabled={guardando || registrado.current}
                  onClick={() => setArchivo(null)}
                >
                  Quitar
                </button>
              </div>
            ) : (
              <label className="adjuntar">
                <input
                  type="file"
                  className="sk-sr"
                  aria-label="Factura o comprobante"
                  accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                  disabled={guardando}
                  onChange={(e) => {
                    elegirArchivo(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                <span>Adjuntar foto o PDF</span>
                <small>Opcional · o pega una captura con Ctrl+V</small>
              </label>
            )}
          </div>
        )}

        {error && (
          <div role="alert" className="aviso">
            <span>{error.message}</span>
            {error.codigo === 'posible_duplicado' && !corrigiendo && (
              <button type="button" disabled={guardando} onClick={() => void registrar(true)}>
                Guardar igual
              </button>
            )}
          </div>
        )}

        {borrando ? (
          <div className="confirmar pie">
            <span>¿Borrar este movimiento?</span>
            <button type="button" className="peligro" disabled={guardando} onClick={() => void borrar()}>
              Sí, borrar
            </button>
            <button type="button" className="secundario" disabled={guardando} onClick={() => setBorrando(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <div className="acciones pie">
            <button type="submit" className="guardar" disabled={guardando}>
              {corrigiendo ? 'Guardar cambios' : textoDeGuardar(tipo, leerMonto(montoTexto))}
            </button>
            {corrigiendo && alDuplicar && base && (
              <button type="button" className="secundario" disabled={guardando} onClick={() => alDuplicar(base)}>
                Duplicar
              </button>
            )}
            {corrigiendo && (
              <button type="button" className="secundario" disabled={guardando} onClick={() => setBorrando(true)}>
                Borrar
              </button>
            )}
          </div>
        )}
      </form>
    </aside>
  )
}
