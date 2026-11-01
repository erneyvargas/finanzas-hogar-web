import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Entrar } from './auth/Entrar'
import { ProveedorDeSesion, useSesion, type ClienteDeAuth } from './auth/sesion'
import { Tablero } from './tablero/Tablero'

/**
 * Hash routes because GitHub Pages serves static files: a path like
 * `/tablero` would answer 404 on reload, `#/tablero` never leaves the page.
 */
function Rutas() {
  const { usuario } = useSesion()

  if (usuario === undefined) return <p className="cargando">Cargando…</p>
  if (usuario === null) return <Entrar />

  return (
    <Routes>
      <Route path="/" element={<Tablero />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export function App({ cliente }: { cliente: ClienteDeAuth }) {
  return (
    <ProveedorDeSesion cliente={cliente}>
      <HashRouter>
        <Rutas />
      </HashRouter>
    </ProveedorDeSesion>
  )
}
