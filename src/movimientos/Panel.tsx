import { useEffect, useMemo, useRef, useState } from 'react'
import { colorDe, dinero, miles } from '../core/formato'
import { diaDe } from '../tablero/calculo'
import type { FuenteDeMovimientos } from './fuente'
import { Cara } from './ListaDeMovimientos'
import {
  ErrorDelServidor,
  MENSAJE_GENERICO,
  cambiosDe,
  categoriasPara,
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

const hojaDe = (ruta: string) => ruta.split(' › ').pop() ?? ruta
const padresDe = (ruta: string) => ruta.split(' › ').slice(0, -1).join(' › ')

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
 * [original] when given. Every write is a server function; its
 * rejections are shown here and the panel stays open. [alCerrar] says
 * whether something was saved, so the page reloads.
 */
export function Panel({
  datos,
  original,
  fuente,
  ahora,
  alCerrar,
}: {
  datos: DatosDeMovimientos
  original: FilaDeMovimiento | null
  fuente: FuenteDeMovimientos
  ahora: () => Date
  alCerrar: (guardado: boolean) => void
}) {
  const corrigiendo = original !== null
  const inicial = (t: Tipo) => {
    const ofrecidas = cuentasPara(t, datos.cuentas)
    return masUsadas(datos.movimientos, t, ofrecidas)[0] ?? ofrecidas[0]?.id ?? ''
  }

  const [base, setBase] = useState(original)
  const [tipo, setTipo] = useState<Tipo>(original?.tipo ?? 'expense')
  const [montoTexto, setMontoTexto] = useState(original ? miles(original.monto) : '')
  const [categoriaId, setCategoriaId] = useState(original?.categoriaId ?? '')
  const [busqueda, setBusqueda] = useState('')
  /** The search box shows while there is no category yet, or after Cambiar. */
  const [buscando, setBuscando] = useState(false)
  const [cuentaId, setCuentaId] = useState(original?.cuentaId ?? inicial('expense'))
  const [otra, setOtra] = useState(false)
  const [dia, setDia] = useState(original ? diaDe(original.fecha) : diaDe(ahora()))
  const [comercio, setComercio] = useState(original?.comercio ?? '')
  const [nota, setNota] = useState(original?.nota ?? '')
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

  const ofrecidas = useMemo(() => {
    const deTipo = cuentasPara(tipo, datos.cuentas)
    // A correction keeps showing its account even if it no longer qualifies.
    const actual = datos.cuentas.find((c) => c.id === original?.cuentaId)
    return actual && !deTipo.includes(actual) ? [...deTipo, actual] : deTipo
  }, [tipo, datos.cuentas, original])
  const usadas = masUsadas(datos.movimientos, tipo, ofrecidas)
  const chips = usadas.filter((id) => id !== cuentaId).slice(0, 3)
  const cuenta = datos.cuentas.find((c) => c.id === cuentaId)

  const opciones = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase('es')
    if (!q) return []
    return categoriasPara(tipo, datos.categorias)
      .map((c) => ({ id: c.id, ...rutaDeCategoria(c.id, datos.categorias) }))
      .filter((c) => c.texto.toLocaleLowerCase('es').includes(q))
      .slice(0, 8)
  }, [busqueda, tipo, datos.categorias])
  const elegida = categoriaId ? rutaDeCategoria(categoriaId, datos.categorias) : null

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
    if (!categoriasPara(t, datos.categorias).some((c) => c.id === categoriaId)) setCategoriaId('')
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
      alCerrar(true)
    } catch (e) {
      const fallo = comoError(e)
      // Only a retry after an unknown outcome (no answer, no rule) can meet
      // its own earlier save; a rule rejection stored nothing.
      if (fallo.codigo === 'ya_existe' && yaIntento.current) {
        alCerrar(true)
        return
      }
      if (fallo.codigo === null) yaIntento.current = true
      setError(fallo)
      setGuardando(false)
    }
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

  const titulo = corrigiendo ? 'Corregir movimiento' : 'Registrar movimiento'
  const saldo = cuentaId ? saldos[cuentaId] : undefined

  return (
    <aside className="panel" role="dialog" aria-labelledby="t-panel">
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
              value={montoTexto}
              onChange={(e) => setMontoTexto(agrupar(e.target.value))}
            />
          </div>
        </div>

        <div className="campo">
          {elegida && !buscando ? (
            <>
              <span className="etiqueta">Categoría</span>
              <button
                type="button"
                className="categoria-elegida"
                onClick={() => setBuscando(true)}
              >
                <span className="punto" style={{ background: colorDe(elegida.color) }} />
                <span className="categoria-texto">
                  <b>{hojaDe(elegida.texto)}</b>
                  <span className="apagado">{padresDe(elegida.texto)}</span>
                </span>
                <span className="cambiar">Cambiar</span>
              </button>
            </>
          ) : (
            <>
              <label htmlFor="p-categoria">Categoría</label>
              <input
                id="p-categoria"
                placeholder="Buscar categoría…"
                autoComplete="off"
                autoFocus={buscando}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onBlur={() => {
                  if (!busqueda.trim()) setBuscando(false)
                }}
              />
            </>
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
            <input id="p-fecha" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="p-comercio">Comercio</label>
            <input
              id="p-comercio"
              autoComplete="off"
              value={comercio}
              disabled={corrigiendo}
              title={corrigiendo ? 'El comercio no se corrige desde aquí' : undefined}
              onChange={(e) => setComercio(e.target.value)}
            />
          </div>
        </div>

        <div className="campo">
          <label htmlFor="p-nota">Observaciones</label>
          <input
            id="p-nota"
            autoComplete="off"
            placeholder="Opcional"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
        </div>

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
