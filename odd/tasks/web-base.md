# Web version: base

Objective: a React web version of finanzas-hogar, only for the owner, published on GitHub Pages. Branch: main (new repo). Delivery: ask-on-risk. Test runner: vitest.

## Specs

- S1. "Quiero empezar a realizar mi versión web de mi aplicación, quiero hacela con react y publicarlo en github pages". React app, deployed to GitHub Pages from the public repo `erneyvargas/finanzas-hogar-web` (the app repo stays private; chosen by the user: "Repo público solo web").
- S2. Sign in with the same Supabase account as the phone app (email and password). Pages need a session; signing out returns to the sign-in screen.
- S3. First screen: "El dasboard de los movimientos", "Verlo mas global": the whole month at a glance, how much went by person and by rubro, and how it compares with other months. Design chosen from 3 mockups before building (user preference for every design).
- S4. "Si poder registrar y corregir movimientos" from the web. Phase 2: first decide how the rules that today live only in the phone (balance, duplicates, which account takes an expense) apply on the web.
- S5. Only for the owner ("Pará mi").
- S6. Register and correct (detail of S4), design: option A "Panel al costado" of https://claude.ai/artifact/H2wv2j2iM1PRboLsgf5bwZ (user answer: "A"):
  - Below the dashboard, the list "Movimientos de octubre" (month of the selector): date, merchant (or category when none), category path with the rubro color dot, account with its face, signed amount. Transfers are not listed (same as the phone's Inicio).
  - "+ Registrar" in the top bar opens a panel on the right, dashboard still visible behind it: amount, Gasto/Ingreso, category (searchable, subcategories of that kind, shown as Rubro › Categoría › Subcategoría), "Sale de"/"Entra a" account large with its balance and the 3 most used other accounts as chips plus "Otra…", date (default today), comercio, observaciones. Save calls `registrar_movimiento`.
  - Clicking a movement in the list opens the same panel filled, titled "Corregir movimiento", with "Guardar cambios" and "Borrar". Each changed field calls its function: `cambiar_monto`, `cambiar_categoria`, `cambiar_cuenta`, `cambiar_fecha`, `cambiar_nota`; "Borrar" asks for confirmation inside the panel and calls `borrar_movimiento`.
  - Server errors (SQLSTATE P0001, code in `details`) show the server's Spanish `message` inside the panel. `posible_duplicado` shows the message with a "Guardar igual" button that retries with `p_guardar_igual = true`.
  - After saving, the panel closes and the dashboard and list reload.
- S7. Writes go ONLY through the server functions of migration 0041 (finanzas-hogar repo, in production); never insert or update `transactions` directly.

## Tasks

| ID | Specs | Route | Status | Evidence |
|----|-------|-------|--------|----------|
| T1 | S1 | inline | done | 9034244: Vite 6 + React 19 + TS, base path for Pages |
| T2 | S2 | inline | done | 9034244: sign-in, session guard, 4 tests |
| T3 | S1 | inline | done | publish workflow; repo variables set by the user; live bundle checked |
| T4 | S3 | inline | done (not checked with real data) | user picked option A; calculo.ts mirrors the app rules (splits, voided, adjustment rubro, Bogotá months); 14 tests |
| T5 | S4 | - | done | rules decided: server functions (migration 0041, in production) |
| T6 | S6, S7 | delegated (context backstop) | done (uncommitted; not checked against real data) | src/movimientos/{reglas,fuente,ListaDeMovimientos,Panel}; RED observed (modules missing), GREEN: 37 tests (19 new: 11 rules, 8 list/panel), build ok, lint 0 errors (2 old warnings in sesion.tsx); writes only via rpc |
| T7 | S2 | inline | done (not pushed: Supabase lacks the Google OAuth secret) | d88d019: "Entrar con Google", PKCE |
| T8 | S6 | inline | done | d333a04, then Escape fix: account photos (signed, bucket `categorias`), register retries reuse one `p_id` (duplicate key on a retry = saved), Escape closes the panel except while saving; 45 tests; review approved |

## Log

- L1 (2026-11-01, user): "Quiero empezar a realizar mi versión web de mi aplicación, quiero hacela con react y publicarlo en github pages"
- L2: answers: "El dasboard de los movimientos", "Verlo mas global" (confirmed: month at a glance by person and rubro, compared with other months), "Si poder registrar y corregir movimientos", "Pará mi", "Dale ejecuta".
- L3: the app repo is private; GitHub Pages on a private repo needs GitHub Pro. User chose a separate public repo only for the web.
- L4: the anon key travels inside the page anyway; data is protected by RLS on the household.
- L5: dashboard mockups https://claude.ai/artifact/DEPMBdJi5yuhqYDtTUcBsZ; user answer: "a".
- L6: "persona" in the dashboard is the app's rubro (Karen, Hijo Isaac, Erney, Hogar); the table rows are level-2 categories grouped by name.
- L7 (2026-11-01): user chose "Funciones en Supabase (Recomendado)"; migration 0041 applied to production after two reviews.
- L8: register/correct mockups: user answer "A".
- L9 (2026-11-01, user): "Para el login quiero poder ingresar con Google".
- L10 (2026-11-01, user): "Continua pulido la app web".
