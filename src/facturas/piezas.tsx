import { useState, type ReactNode } from 'react'
import { Cara } from '../movimientos/ListaDeMovimientos'
import { cuentasPara, masUsadas, type DatosDeMovimientos, type Tipo } from '../movimientos/reglas'
import { extensionDe } from './reglas'

/** The receipt as uploaded: the photo, the PDF, or a tile when it cannot be shown. */
export function Vista({ archivo, url, leyendo }: { archivo: File; url: string | null; leyendo: boolean }) {
  const pdf = extensionDe(archivo) === 'pdf'
  const teja = (
    <div className="teja-pdf">
      <span className="icono-hoja" aria-hidden="true" />
      <b>{pdf ? 'PDF' : 'Foto'}</b>
      <span>{archivo.name}</span>
    </div>
  )
  return (
    <div className="mesa">
      {!url ? (
        teja
      ) : pdf ? (
        <object data={url} type="application/pdf" aria-label="La factura en PDF">
          {teja}
        </object>
      ) : (
        <img src={url} alt="La foto de la factura" />
      )}
      {leyendo && <span className="barrido" aria-hidden="true" />}
    </div>
  )
}

/**
 * The account chips: the accounts that take a movement of [tipo], the
 * most used first, four at most plus «Otra…» for the rest. Required.
 */
export function ElegirCuenta({
  tipo,
  leyenda,
  datos,
  cuentaId,
  alElegir,
}: {
  tipo: Tipo
  leyenda: ReactNode
  datos: DatosDeMovimientos
  cuentaId: string
  alElegir: (id: string) => void
}) {
  const [otra, setOtra] = useState(false)
  const ofrecidas = cuentasPara(tipo, datos.cuentas)
  const usadas = masUsadas(datos.movimientos, tipo, ofrecidas)
  const orden = [...usadas, ...ofrecidas.map((c) => c.id).filter((id) => !usadas.includes(id))]
  let chips = orden.slice(0, 4)
  if (cuentaId && !chips.includes(cuentaId)) chips = [...chips.slice(0, 3), cuentaId]

  return (
    <fieldset className="campo">
      <legend>
        {leyenda} <span className="requerido">*</span>
        {!cuentaId && <span className="apagado"> — elige la cuenta para poder guardar</span>}
      </legend>
      <div className={`chips ${cuentaId ? '' : 'pide'}`}>
        {chips.map((id) => {
          const c = datos.cuentas.find((x) => x.id === id)!
          return (
            <button key={id} type="button" className="chip" aria-pressed={id === cuentaId} onClick={() => alElegir(id)}>
              <Cara nombre={c.nombre} foto={c.foto} />
              {c.nombre}
            </button>
          )
        })}
        {ofrecidas.length > chips.length && (
          <button type="button" className="chip" aria-expanded={otra} onClick={() => setOtra(!otra)}>
            Otra…
          </button>
        )}
      </div>
      {otra && (
        <select
          aria-label="Otra cuenta"
          value={cuentaId}
          onChange={(e) => {
            alElegir(e.target.value)
            setOtra(false)
          }}
        >
          <option value="">Elige una cuenta</option>
          {ofrecidas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      )}
    </fieldset>
  )
}
