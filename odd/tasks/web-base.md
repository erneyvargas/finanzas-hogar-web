# Web version: base

Objective: a React web version of finanzas-hogar, only for the owner, published on GitHub Pages. Branch: main (new repo). Delivery: ask-on-risk. Test runner: vitest.

## Specs

- S1. "Quiero empezar a realizar mi versión web de mi aplicación, quiero hacela con react y publicarlo en github pages". React app, deployed to GitHub Pages from the public repo `erneyvargas/finanzas-hogar-web` (the app repo stays private; chosen by the user: "Repo público solo web").
- S2. Sign in with the same Supabase account as the phone app (email and password). Pages need a session; signing out returns to the sign-in screen.
- S3. First screen: "El dasboard de los movimientos", "Verlo mas global": the whole month at a glance, how much went by person and by rubro, and how it compares with other months. Design chosen from 3 mockups before building (user preference for every design).
- S4. "Si poder registrar y corregir movimientos" from the web. Phase 2: first decide how the rules that today live only in the phone (balance, duplicates, which account takes an expense) apply on the web.
- S5. Only for the owner ("Pará mi").

## Tasks

| ID | Specs | Route | Status | Evidence |
|----|-------|-------|--------|----------|
| T1 | S1 | inline | done | 9034244: Vite 6 + React 19 + TS, base path for Pages |
| T2 | S2 | inline | done | 9034244: sign-in, session guard, 4 tests |
| T3 | S1 | inline | done | publish workflow; repo variables set by the user; live bundle checked |
| T4 | S3 | inline | done (not checked with real data) | user picked option A; calculo.ts mirrors the app rules (splits, voided, adjustment rubro, Bogotá months); 14 tests |
| T5 | S4 | - | pending | phase 2, needs a decision on rules |

## Log

- L1 (2026-11-01, user): "Quiero empezar a realizar mi versión web de mi aplicación, quiero hacela con react y publicarlo en github pages"
- L2: answers: "El dasboard de los movimientos", "Verlo mas global" (confirmed: month at a glance by person and rubro, compared with other months), "Si poder registrar y corregir movimientos", "Pará mi", "Dale ejecuta".
- L3: the app repo is private; GitHub Pages on a private repo needs GitHub Pro. User chose a separate public repo only for the web.
- L4: the anon key travels inside the page anyway; data is protected by RLS on the household.
- L5: dashboard mockups https://claude.ai/artifact/DEPMBdJi5yuhqYDtTUcBsZ; user answer: "a".
- L6: "persona" in the dashboard is the app's rubro (Karen, Hijo Isaac, Erney, Hogar); the table rows are level-2 categories grouped by name.
