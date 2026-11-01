import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Entrar } from './auth/Entrar'
import { ProveedorDeSesion, useSesion, type ClienteDeAuth } from './auth/sesion'
import { Tablero } from './tablero/Tablero'
import type { FuenteDelTablero } from './tablero/fuente'
import type { FuenteDeMovimientos } from './movimientos/fuente'

/**
 * Hash routes because GitHub Pages serves static files: a path like
 * `/tablero` would answer 404 on reload, `#/tablero` never leaves the page.
 */
function Rutas({ fuente, movimientos }: { fuente: FuenteDelTablero; movimientos?: FuenteDeMovimientos }) {
  const { usuario } = useSesion()

  if (usuario === undefined) return <p className="cargando">Cargando…</p>
  if (usuario === null) return <Entrar />

  return (
    <Routes>
      <Route path="/" element={<Tablero fuente={fuente} movimientos={movimientos} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export function App({
  cliente,
  fuente,
  movimientos,
}: {
  cliente: ClienteDeAuth
  fuente: FuenteDelTablero
  movimientos?: FuenteDeMovimientos
}) {
  return (
    <ProveedorDeSesion cliente={cliente}>
      <HashRouter>
        <Rutas fuente={fuente} movimientos={movimientos} />
      </HashRouter>
    </ProveedorDeSesion>
  )
}
