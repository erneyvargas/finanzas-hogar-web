import { useEffect, useMemo, useRef, useState } from 'react'
import { miles } from '../core/formato'
import { BotonDeGuardar, Recurrencia, type EstadoDeGuardar } from '../core/ui/Recurrencia'
import { RelojDeAviso } from '../core/ui/RelojDeAviso'
import { recurrenciaInicial, type Recurrencia as ValorDeRecurrencia } from '../core/ui/recurrencia'
import { SelectorDeCuenta } from '../cuentas/SelectorDeCuenta'
import { opcionesDeCategoria, usosPorCategoria } from '../movimientos/categorias'
import { CampoDeFecha } from '../movimientos/CampoDeFecha'
import { CampoDeCategoria } from '../movimientos/SelectorDeCategoria'
import { ErrorDelServidor, MENSAJE_GENERICO, cuentasPara, leerMonto, rutaDeCategoria, type DatosDeMovimientos } from '../movimientos/reglas'
import type { FuncionDeReglas } from '../porvencer/fuente'
import { diaCorto, type DeudaDeRegla, type Regla } from '../porvencer/reglas'
import { idDelRubroDeAjuste } from '../tablero/calculo'
import { siguientesFechas } from './fechas'
import { horaDeRecurrencia, patronDeRecurrencia, recurrenciaDeRegla } from './patron'

type TipoDeRegla = 'expense' | 'income' | 'debt_payment'
const TIPOS: [TipoDeRegla, string][] = [
  ['expense', 'Gasto'],
  ['income', 'Ingreso'],
  ['debt_payment', 'Cuota de deuda'],
]
const quieto = () => typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches

/** `14500` → `14.500` while typing; a decimal comma is left as typed. */
function agrupar(texto: string): string {
  if (texto.includes(',')) return texto
  const digitos = texto.replace(/\D/g, '')
  return digitos ? miles(Number(digitos)) : ''
}

/**
 * The side panel that creates a recurring payment, or edits [regla]:
 * name, kind, amount, account, category (or the debt of an installment),
 * from when, until when, how many days before to remind, and the Moxen
 * «Recurrencia» editor for the pattern and the reminder time. Writes go
 * through the 0051 server functions; their rejections show here and the
 * panel stays open. A `biweekly` rule keeps its pattern: the editor has
 * no control for it.
 */
export function PanelDeRegla({
  datos,
  deudas,
  regla,
  hoy,
  ejecutar,
  alCerrar,
}: {
  /** The movements' accounts and categories. */
  datos: DatosDeMovimientos
  deudas: DeudaDeRegla[]
  /** The rule being edited; `null` creates one. */
  regla: Regla | null
  /** Today in Bogotá, `YYYY-MM-DD`. */
  hoy: string
  ejecutar: (funcion: FuncionDeReglas, params: Record<string, unknown>) => Promise<unknown>
  /** Whether something was saved, so the page reloads. */
  alCerrar: (guardado: boolean) => void
}) {
  const editando = regla !== null
  const leida = regla
    ? recurrenciaDeRegla({
        frecuencia: regla.frecuencia,
        diaDelMes: regla.diaDelMes,
        dias: regla.dias ?? null,
        semanaDelMes: regla.semanaDelMes ?? null,
        proximaFecha: regla.proximaFecha,
        horaAviso: regla.horaAviso ?? null,
      })
    : null
  const cadaDosSemanas = editando && leida === null
  const [tipo, setTipo] = useState<TipoDeRegla>(regla?.tipo ?? 'expense')
  const [nombre, setNombre] = useState(regla?.nombre ?? '')
  const [montoTexto, setMontoTexto] = useState(regla ? miles(regla.monto) : '')
  const [categoriaId, setCategoriaId] = useState(regla?.categoriaId ?? '')
  const [deudaId, setDeudaId] = useState(regla?.deudaId ?? '')
  const tipoDeCuenta = tipo === 'income' ? 'income' : 'expense'
  const ofrecidas = useMemo(() => {
    const deTipo = cuentasPara(tipoDeCuenta, datos.cuentas)
    // An edited rule keeps showing its account even if it no longer qualifies.
    const actual = datos.cuentas.find((c) => c.id === regla?.cuentaId)
    return actual && !deTipo.includes(actual) ? [...deTipo, actual] : deTipo
  }, [tipoDeCuenta, datos.cuentas, regla])
  const [cuentaId, setCuentaId] = useState(regla?.cuentaId ?? ofrecidas[0]?.id ?? '')
  // An edited rule moves on from the next date it shows; a new one from today.
  const [inicio, setInicio] = useState(regla?.proximaFecha ?? hoy)
  const [fin, setFin] = useState(regla?.fin ?? '')
  const [avisoDias, setAvisoDias] = useState(String(regla?.avisoDias ?? 1))
  const [patron, setPatron] = useState<ValorDeRecurrencia>(
    () => leida ?? { ...recurrenciaInicial(), freq: 'mensual', modoMes: 'dia', diaMes: Number(hoy.slice(8)) },
  )
  const [estado, setEstado] = useState<EstadoDeGuardar>('reposo')
  const [error, setError] = useState<string | null>(null)
  const [borrando, setBorrando] = useState(false)
  /** A new rule's id, fixed when the panel opens: a retry cannot store it twice. */
  const [nuevoId] = useState(() => crypto.randomUUID())
  const ocupado = estado !== 'reposo'

  const guardado = editando && leida === null ? { frecuencia: 'biweekly' as const, dia: null, dias: null, semana: null, mes: null } : patronDeRecurrencia(patron)
  const fechas = useMemo(
    () => (cadaDosSemanas ? [] : siguientesFechas(guardado, inicio, 12, fin || null)),
    // guardado is rebuilt from patron each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patron, inicio, fin, cadaDosSemanas],
  )

  const tipoDeCategoria = tipo === 'income' ? 'income' : 'expense'
  const opciones = useMemo(
    () => opcionesDeCategoria(tipoDeCategoria, datos.categorias, idDelRubroDeAjuste(datos.hogarId)),
    [tipoDeCategoria, datos.categorias, datos.hogarId],
  )
  const usos = useMemo(
    () => usosPorCategoria(datos.historial ?? datos.movimientos, tipoDeCategoria),
    [datos.historial, datos.movimientos, tipoDeCategoria],
  )
  const rutaDeRespaldo = categoriaId
    ? rutaDeCategoria(categoriaId, datos.categorias).texto.split(' › ').slice(-2).join(' › ')
    : null

  // Escape closes, like the ✕, but not while a save is on its way.
  const cerrarRef = useRef(() => {})
  cerrarRef.current = () => {
    if (!ocupado) alCerrar(false)
  }
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrarRef.current()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [])
  const raiz = useRef<HTMLElement>(null)
  useEffect(() => {
    raiz.current?.querySelector<HTMLElement>('#r-nombre')?.focus()
  }, [])

  function cambiarTipo(t: TipoDeRegla) {
    if (t === tipo) return
    setTipo(t)
    setCategoriaId('')
    setError(null)
    const deTipo = cuentasPara(t === 'income' ? 'income' : 'expense', datos.cuentas)
    if (!deTipo.some((c) => c.id === cuentaId)) setCuentaId(deTipo[0]?.id ?? '')
  }

  /** Shows the ✓ a moment, then closes; at once under reduced motion. */
  const terminar = () => {
    setEstado('guardado')
    window.setTimeout(() => alCerrar(true), quieto() ? 0 : 700)
  }

  async function guardar() {
    const monto = leerMonto(montoTexto)
    const dias = Number(avisoDias)
    let mensaje: string | null = null
    if (!nombre.trim()) mensaje = 'Ponle un nombre al pago.'
    else if (!Number.isFinite(monto) || monto <= 0) mensaje = 'Escribe un valor mayor que cero.'
    else if (tipo === 'debt_payment' && !deudaId) mensaje = 'Elige a qué deuda va la cuota.'
    else if (tipo !== 'debt_payment' && !categoriaId) mensaje = 'Elige una categoría.'
    else if (!cuentaId) mensaje = 'Elige la cuenta.'
    else if (!Number.isInteger(dias) || dias < 0) mensaje = 'Los días de aviso van de 0 en adelante.'
    if (mensaje) return setError(mensaje)
    setError(null)
    setEstado('guardando')
    const comun = {
      p_household_id: datos.hogarId,
      ...(editando ? { p_id: regla.id } : {}),
      p_nombre: nombre.trim(),
      ...(editando ? {} : { p_tipo: tipo }),
      p_cuenta: cuentaId,
      p_categoria: tipo === 'debt_payment' ? null : categoriaId,
      p_deuda: tipo === 'debt_payment' ? deudaId : null,
      p_monto: monto,
      p_frecuencia: guardado.frecuencia,
      p_dia: guardado.dia,
      p_dias: guardado.dias,
      p_semana: guardado.semana,
      p_mes: guardado.mes,
      p_inicio: inicio,
      p_fin: fin || null,
      p_aviso_dias: dias,
      p_hora: horaDeRecurrencia(patron),
    }
    try {
      if (editando) await ejecutar('editar_regla_recurrente', comun)
      else await ejecutar('crear_regla_recurrente', { ...comun, p_id: nuevoId })
      terminar()
    } catch (e) {
      setError(e instanceof ErrorDelServidor ? e.message : MENSAJE_GENERICO)
      setEstado('reposo')
    }
  }

  async function borrar() {
    if (!regla) return
    setEstado('guardando')
    setError(null)
    try {
      await ejecutar('borrar_regla_recurrente', { p_household_id: datos.hogarId, p_id: regla.id })
      alCerrar(true)
    } catch (e) {
      setError(e instanceof ErrorDelServidor ? e.message : MENSAJE_GENERICO)
      setEstado('reposo')
      setBorrando(false)
    }
  }

  const titulo = editando ? 'Editar pago recurrente' : 'Nuevo pago recurrente'
  return (
    <aside ref={raiz} className="panel panel-de-regla" role="dialog" aria-labelledby="t-regla">
      <div className="panel-cabeza">
        <h2 id="t-regla">{titulo}</h2>
        <button className="flecha" aria-label="Cerrar" onClick={() => !ocupado && alCerrar(false)}>
          ✕
        </button>
      </div>
      <form
        className="panel-cuerpo"
        onSubmit={(e) => {
          e.preventDefault()
          if (!ocupado) void guardar()
        }}
      >
        <div className="campo">
          <label htmlFor="r-nombre">Nombre</label>
          <input id="r-nombre" type="text" autoComplete="off" maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="cabecera-monto">
          <div className="alternar tres-tipos" role="group" aria-label="Tipo">
            {TIPOS.map(([t, texto]) => (
              <button key={t} type="button" aria-pressed={tipo === t} disabled={editando} onClick={() => cambiarTipo(t)}>
                {texto}
              </button>
            ))}
          </div>
          <label htmlFor="r-valor">Valor</label>
          <div className={`monto ${tipo === 'income' ? 'ingreso' : 'gasto'}`}>
            <span aria-hidden="true">$</span>
            <input
              id="r-valor"
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

        {tipo === 'debt_payment' ? (
          <div className="campo">
            <label htmlFor="r-deuda">Deuda</label>
            <select id="r-deuda" value={deudaId} onChange={(e) => setDeudaId(e.target.value)}>
              <option value="">Elige una deuda</option>
              {deudas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <CampoDeCategoria
            tipo={tipoDeCategoria}
            opciones={opciones}
            usos={usos}
            categoriaId={categoriaId}
            rutaDeRespaldo={rutaDeRespaldo}
            alElegir={setCategoriaId}
          />
        )}

        <div className="campo">
          <SelectorDeCuenta
            etiqueta={tipo === 'income' ? 'Entra a' : 'Sale de'}
            opciones={ofrecidas.map((c) => ({ id: c.id, nombre: c.nombre, foto: c.foto, detalle: '' }))}
            valor={cuentaId}
            alElegir={setCuentaId}
          />
        </div>

        <div className="dos-columnas">
          <div className="campo">
            <label htmlFor="r-desde">{editando ? 'Próxima desde' : 'Desde'}</label>
            <CampoDeFecha id="r-desde" dia={inicio} hoy={hoy} alCambiar={setInicio} />
          </div>
          <div className="campo">
            <label htmlFor="r-hasta">Hasta (opcional)</label>
            <input id="r-hasta" type="date" value={fin} min={inicio} onChange={(e) => setFin(e.target.value)} />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="r-aviso">Avisar días antes</label>
          <input id="r-aviso" type="number" min={0} max={30} value={avisoDias} onChange={(e) => setAvisoDias(e.target.value)} />
        </div>

        {cadaDosSemanas ? (
          <div className="campo">
            <p className="nota">Se repite cada dos semanas; la próxima es el {diaCorto(regla.proximaFecha)}. Esta repetición se hizo en el celular y no se cambia aquí; lo demás sí.</p>
            <RelojDeAviso valor={patron} alCambiar={(h) => setPatron((p) => ({ ...p, ...h }))} />
          </div>
        ) : (
          <Recurrencia valor={patron} alCambiar={setPatron} fechas={fechas} hoy={hoy} />
        )}

        {error && (
          <div role="alert" className="aviso">
            <span>{error}</span>
          </div>
        )}

        {borrando ? (
          <div className="confirmar pie">
            <span>¿Borrar este pago recurrente?</span>
            <button type="button" className="peligro" disabled={ocupado} onClick={() => void borrar()}>
              Sí, borrar
            </button>
            <button type="button" className="secundario" disabled={ocupado} onClick={() => setBorrando(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <div className="acciones pie">
            <BotonDeGuardar estado={estado} texto="Guardar" className="guardar" />
            {editando && (
              <button type="button" className="secundario" disabled={ocupado} onClick={() => setBorrando(true)}>
                Borrar
              </button>
            )}
          </div>
        )}
      </form>
    </aside>
  )
}
