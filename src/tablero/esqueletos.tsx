import { diasDelMes, huecoInicial } from '../core/ui/rejillaDelMes'

/*
 * Loading shapes that copy the component that comes next, measured on the
 * real DOM with data (Dosis loaded) at 1920, 1000, 800, 600 and 390px.
 * Shapes take the global `.skeleton` classes in index.css; the sizes that
 * change with a breakpoint live there too (`.sk-*` rules), so the media
 * queries of the real component apply to its skeleton as well.
 */

/** A text bar centered in a line box of [linea] px. */
function Linea({ linea, ancho, estilo }: { linea: number; ancho: string; estilo?: React.CSSProperties }) {
  return <span className="skeleton skeleton--text" style={{ ['--sk-line' as string]: `${linea}px`, width: ancho, ...estilo }} />
}

/**
 * The «Cuentas» tab: the Tienes − Debes = Patrimonio equation (78px, 127px
 * under 640px where the total wraps), the order chips (40px) and the ledger:
 * header 32px, group rows 36px and account rows 55px; under 640px no header,
 * group rows 34px and two-line rows 58px.
 */
export function EsqueletoDeCuentas() {
  const fila = (nombre: string, tipo: string, detalle: string, saldo: string, i: number) => (
    <div key={i} className="sk-libro-fila">
      <span className="sk-libro-cuenta">
        <span className="skeleton sk-cara" />
        <Linea linea={17} ancho={nombre} />
      </span>
      <Linea linea={17} ancho={tipo} estilo={{ marginInline: 16 }} />
      <Linea linea={17} ancho={detalle} estilo={{ marginInline: 16 }} />
      <Linea linea={17} ancho={saldo} estilo={{ justifySelf: 'end', marginInline: 16 }} />
    </div>
  )
  const grupo = (ancho: string) => (
    <div className="sk-libro-grupo">
      <Linea linea={19} ancho={ancho} />
      <Linea linea={19} ancho="90px" estilo={{ marginLeft: 'auto' }} />
    </div>
  )
  return (
    <div aria-busy="true" className="sk-delay">
      <p role="status" className="sk-sr">
        Cargando cuentas…
      </p>
      <div className="cuentas" aria-hidden="true">
        <div className="ecuacion">
          <div className="sk-ec sk-ec1">
            <Linea linea={15} ancho="60%" />
            <span className="skeleton sk-cifra" />
          </div>
          <span className="op">−</span>
          <div className="sk-ec sk-ec2">
            <Linea linea={15} ancho="60%" />
            <span className="skeleton sk-cifra" />
          </div>
          <span className="op">=</span>
          <div className="sk-ec total">
            <Linea linea={15} ancho="110px" />
            <span className="skeleton sk-cifra" />
          </div>
        </div>
        <div className="chips orden">
          {[95, 75, 54].map((w) => (
            <span key={w} className="skeleton skeleton--pill" style={{ width: w, height: 40 }} />
          ))}
        </div>
        <div className="libro">
          <div className="sk-libro-cab">
            {['30%', '40%', '30%', '40%'].map((w, i) => (
              <Linea key={i} linea={16} ancho={w} estilo={{ marginInline: 16, justifySelf: i === 3 ? 'end' : undefined }} />
            ))}
          </div>
          {grupo('110px')}
          {fila('45%', '55%', '40%', '55%', 1)}
          {fila('60%', '45%', '30%', '50%', 2)}
          {fila('35%', '50%', '0', '60%', 3)}
          {grupo('90px')}
          {fila('55%', '65%', '75%', '55%', 4)}
          {fila('50%', '55%', '60%', '60%', 5)}
          {grupo('80px')}
          {fila('40%', '50%', '0', '55%', 6)}
        </div>
      </div>
    </div>
  )
}

/**
 * The «Por vencer» tab, same 3fr/2fr grid (one column under 900px): the
 * summary card (header 96px: title 19px, amount 43px, two 17px lines and the
 * 146×35 switch; the 7-column calendar of [hoy]'s month with square days;
 * the weeks bar 36px and its 16px caption), «Por pagar» rows of 74px and,
 * with [conReglas], «Pagos recurrentes» (header 43px, rows 55px).
 */
export function EsqueletoPorVencer({ hoy, conReglas }: { hoy: string; conReglas: boolean }) {
  const mes = hoy.slice(0, 7)
  return (
    <div aria-busy="true" className="sk-delay">
      <p role="status" className="sk-sr">
        Cargando vencimientos…
      </p>
      <div className="por-vencer" aria-hidden="true">
        <section className="tarjeta">
          <div className="pv-cab">
            <div className="sk-ec sk-pv-resumen">
              <Linea linea={19} ancho="85%" />
              <span className="skeleton" style={{ height: 30, width: '70%', marginBlock: 6.5 }} />
              <Linea linea={17} ancho="100%" />
              <Linea linea={17} ancho="75%" />
            </div>
            <span className="skeleton sk-conmutador" />
          </div>
          <div className="cal-rejilla">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={`s${i}`} className="cal-dsem">
                <Linea linea={15} ancho="14px" estilo={{ marginInline: 'auto' }} />
              </span>
            ))}
            {Array.from({ length: huecoInicial(mes) }, (_, i) => (
              <span key={`v${i}`} className="cal-dia vacio" />
            ))}
            {Array.from({ length: diasDelMes(mes) }, (_, i) => (
              <span key={i} className="skeleton sk-dia" />
            ))}
          </div>
          <div className="cal-semanas-caja" style={{ display: 'flex', flexDirection: 'column', paddingTop: 12 }}>
            <span className="skeleton" style={{ height: 36 }} />
            <Linea linea={16} ancho="45%" estilo={{ marginTop: 4 + (16 - 11) / 2 }} />
          </div>
        </section>

        <section className="tarjeta">
          <Linea linea={19} ancho="30%" estilo={{ marginBottom: 10 + (19 - 11) / 2 }} />
          <ul className="lista-v">
            {['55%', '40%', '65%', '45%'].map((w, i) => (
              <li key={i}>
                <span className="skeleton skeleton--circle" style={{ width: 12 }} />
                <Linea linea={20} ancho={w} />
                <Linea linea={20} ancho="64px" />
                <span className="meta">
                  <Linea linea={29} ancho="45%" />
                  <span className="skeleton" style={{ width: 62, height: 29, borderRadius: 12 }} />
                </span>
              </li>
            ))}
          </ul>
        </section>

        {conReglas && (
          <section className="tarjeta">
            <div className="pv-reglas-cab">
              <Linea linea={19} ancho="35%" estilo={{ marginRight: 'auto' }} />
              <span className="skeleton" style={{ width: 190, height: 43, borderRadius: 12 }} />
            </div>
            <ul className="lista-reglas">
              {['35%', '25%', '45%', '30%'].map((w, i) => (
                <li key={i} className="sk-regla">
                  <Linea linea={17} ancho={w} />
                  <Linea linea={17} ancho="64px" />
                  <Linea linea={16} ancho="60%" estilo={{ gridColumn: '1 / -1' }} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

/**
 * The account panel's movements while they load: rows of the `.movs-de-cuenta`
 * list itself (34px: day, description, amount), so nothing moves when they come.
 */
export function EsqueletoDeMovimientosDeCuenta({ mes }: { mes: string }) {
  return (
    <div aria-busy="true" className="sk-delay">
      <p role="status" className="sk-sr">
        Cargando movimientos de {mes}…
      </p>
      <ul className="movs-de-cuenta" aria-hidden="true">
        {['60%', '80%', '45%', '70%'].map((w, i) => (
          <li key={i}>
            <Linea linea={17} ancho="16px" estilo={{ justifySelf: 'center' }} />
            <Linea linea={17} ancho={w} />
            <Linea linea={17} ancho="56px" />
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The app shell while the session is checked: the top bar (68px, 64px under
 * 900px and 110px on a phone, where the month wraps below), with the brand,
 * the month selector (191×38), the e-mail and «Salir» (60×43).
 */
export function EsqueletoDeInicio() {
  return (
    <div aria-busy="true" className="sk-delay">
      <p role="status" className="sk-sr">
        Cargando…
      </p>
      <header className="barra" aria-hidden="true">
        <span className="marca-texto">Finanzas del hogar</span>
        <span className="skeleton sk-barra-mes" />
        <span className="correo" style={{ width: 119 }}>
          <Linea linea={17} ancho="100%" />
        </span>
        <span className="skeleton sk-barra-salir" />
      </header>
    </div>
  )
}
