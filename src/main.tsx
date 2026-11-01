import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { supabase } from './core/supabase'
import { fuenteDeSupabase } from './tablero/fuente'

const raiz = createRoot(document.getElementById('root')!)

raiz.render(
  <StrictMode>
    {supabase ? (
      <App cliente={supabase.auth} fuente={fuenteDeSupabase(supabase)} />
    ) : (
      <p className="cargando">
        Falta configurar la conexión: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.
      </p>
    )}
  </StrictMode>,
)
