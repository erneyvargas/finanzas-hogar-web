import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Entrar } from './auth/Entrar'
import { ProveedorDeSesion, useSesion, type ClienteDeAuth } from './auth/sesion'
import { Tablero } from './tablero/Tablero'
import { EsqueletoDeInicio } from './tablero/esqueletos'
import type { FuenteDelTablero } from './tablero/fuente'
import type { FuenteDeMovimientos } from './movimientos/fuente'
import type { FuenteDeFacturas } from './facturas/fuente'
import type { FuenteDeCuentas } from './cuentas/fuente'
import type { FuenteDePorVencer } from './porvencer/fuente'

/**
 * Hash routes because GitHub Pages serves static files: a path like
 * `/tablero` would answer 404 on reload, `#/tablero` never leaves the page.
 */
function Rutas({
  fuente,
  movimientos,
  facturas,
  cuentas,
  porVencer,
}: {
  fuente: FuenteDelTablero
  movimientos?: FuenteDeMovimientos
  facturas?: FuenteDeFacturas
  cuentas?: FuenteDeCuentas
  porVencer?: FuenteDePorVencer
}) {
  const { usuario } = useSesion()

  if (usuario === undefined) return <EsqueletoDeInicio />
  if (usuario === null) return <Entrar />

  return (
    <Routes>
      <Route path="/" element={<Tablero fuente={fuente} movimientos={movimientos} facturas={facturas} cuentas={cuentas} porVencer={porVencer} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export function App({
  cliente,
  fuente,
  movimientos,
  facturas,
  cuentas,
  porVencer,
}: {
  cliente: ClienteDeAuth
  fuente: FuenteDelTablero
  movimientos?: FuenteDeMovimientos
  facturas?: FuenteDeFacturas
  cuentas?: FuenteDeCuentas
  porVencer?: FuenteDePorVencer
}) {
  return (
    <ProveedorDeSesion cliente={cliente}>
      <HashRouter>
        <Rutas fuente={fuente} movimientos={movimientos} facturas={facturas} cuentas={cuentas} porVencer={porVencer} />
      </HashRouter>
    </ProveedorDeSesion>
  )
}
