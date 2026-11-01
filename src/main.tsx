import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { supabase } from './core/supabase'
import { fuenteDeSupabase, hogarEnCache } from './tablero/fuente'
import { fuenteDeMovimientosDeSupabase } from './movimientos/fuente'

const raiz = createRoot(document.getElementById('root')!)
const hogar = supabase ? hogarEnCache(supabase) : null

raiz.render(
  <StrictMode>
    {supabase ? (
      <App
        cliente={supabase.auth}
        fuente={fuenteDeSupabase(supabase, hogar!)}
        movimientos={fuenteDeMovimientosDeSupabase(supabase, hogar!)}
      />
    ) : (
      <p className="cargando">
        Falta configurar la conexión: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.
      </p>
    )}
  </StrictMode>,
)
