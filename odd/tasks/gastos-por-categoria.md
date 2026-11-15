Port of Moxen "Gastos" (moxen.cl/recursos/gastos) as a "Por categoría" card on the Tablero.
Branch: feat/gastos-por-categoria (on top of feat/buscar-rubros). Delivery: single PR. Runner: `npx vitest run <files>`.

## Specs

- S1 Card «Por categoría» on the Resumen tab: a ring with one segment per category of the month (top 6, the rest as «Otras»). Segments grow one after another, the selected one separates with a spring. Colors come from the project palette (`--p-*`), never Moxen hex values.
- S2 The ring's center total rolls digit by digit when it changes (odometer); it shows the selected category's total when one is chosen.
- S3 Category list: name, amount, percentage pill and thin bar. Tapping a row or a ring segment (or keys 1–6) selects it; tapping again, Escape or the filter pill clears it.
- S4 Comparison with the previous month per category, with the same cut-off day as «Gastado en» for a running month.
- S5 The month's movements, filtered by the chosen category, enter and leave animated.
- S6 Month change: the existing `selector-mes` (no second selector) slides the month name and takes ←/→ keys; the card follows that month.
- S7 «Añadir gasto» opens the existing `Panel` with the chosen category already set; after saving, a toast «Gasto añadido» with «Deshacer» calls `borrar_movimiento`.
- Every animation has an instant path under `prefers-reduced-motion`.

## Tasks

- T1 S4 numbers per category in `calculo.ts` (inline)
- T2 S1 S2 domain-free `Anillo` and `Cifra` in `src/core/ui` (inline)
- T3 S1 S3 S4 S5 card «Por categoría» in the Tablero (inline)
- T4 S6 month slide and ←/→ keys (inline)
- T5 S7 Añadir gasto with the category and undo toast (inline)

## Log

- L1 (2026-11-15) "ayudame a mejorar finanzas hogar web, usa moxen para logragr un mejor diseño" → chose resource 1 (Gastos) "en el tablero", parts "todos"; part 7 option "1" (opens the existing Panel with the category, Deshacer via borrar_movimiento).
- Part 6 reuses the existing month selector; parts 5 and 7 reuse the movements source and the Panel.
