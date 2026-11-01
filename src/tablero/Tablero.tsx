import { useSesion } from '../auth/sesion'

/**
 * The month dashboard. For now only the frame: the dashboard itself is
 * built after the user picks one of three mockups.
 */
export function Tablero() {
  const { usuario, salir } = useSesion()

  return (
    <div className="marco">
      <header className="barra">
        <span className="marca-texto">Finanzas del hogar</span>
        <span className="apagado">{usuario?.email}</span>
        <button className="secundario" onClick={() => void salir()}>
          Salir
        </button>
      </header>
      <main className="contenido">
        <h1>Tablero del mes</h1>
        <p className="apagado">
          Aquí va a estar el mes de un vistazo: por persona, por rubro y comparado con
          los meses anteriores.
        </p>
      </main>
    </div>
  )
}
