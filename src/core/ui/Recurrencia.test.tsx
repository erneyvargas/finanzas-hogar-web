import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BotonDeGuardar, Recurrencia } from './Recurrencia'
import { RelojDeAviso } from './RelojDeAviso'
import { recurrenciaInicial, type Recurrencia as Valor } from './recurrencia'

const fechas = ['2026-11-16', '2026-11-18', '2026-11-23', '2026-11-25', '2026-11-30', '2026-12-02', '2026-12-07']

function Montado({ inicial = recurrenciaInicial(), alCambiar }: { inicial?: Valor; alCambiar?: (v: Valor) => void }) {
  const [v, setV] = useState(inicial)
  return (
    <Recurrencia
      valor={v}
      alCambiar={(n) => {
        setV(n)
        alCambiar?.(n)
      }}
      fechas={fechas}
      hoy="2026-11-15"
    />
  )
}

const frase = () => document.querySelector('[data-frase] .sk-sr')?.textContent?.replace(/\u00A0/g, ' ')
const expresion = () => screen.getByLabelText(/^Expresión de repetición/).getAttribute('aria-label')

describe('Recurrencia', () => {
  it('1 · the frequency switch is a radio group that shows each frequency’s own controls', async () => {
    const alCambiar = vi.fn()
    render(<Montado alCambiar={alCambiar} />)
    const grupo = screen.getByRole('radiogroup', { name: 'Frecuencia' })
    expect(within(grupo).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Diaria', 'Semanal', 'Mensual', 'Anual'])
    expect(within(grupo).getByRole('radio', { name: 'Semanal' })).toHaveAttribute('aria-checked', 'true')

    await userEvent.click(within(grupo).getByRole('radio', { name: 'Mensual' }))

    expect(within(grupo).getByRole('radio', { name: 'Mensual' })).toHaveAttribute('aria-checked', 'true')
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ freq: 'mensual' }))
    expect(screen.getByRole('group', { name: 'Opciones de la repetición mensual' })).toBeVisible()
    expect(screen.queryByRole('group', { name: 'Opciones de la repetición semanal' })).not.toBeInTheDocument()

    await userEvent.keyboard('{ArrowRight}')
    expect(within(grupo).getByRole('radio', { name: 'Anual' })).toHaveAttribute('aria-checked', 'true')
    expect(within(grupo).getByRole('radio', { name: 'Anual' })).toHaveFocus()
  })

  it('2 · the day pills toggle, the shortcuts set them, and the last day cannot go', async () => {
    render(<Montado />)
    const pildora = (n: string) => screen.getByRole('button', { name: n })
    expect(pildora('lunes')).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(pildora('viernes'))
    expect(pildora('viernes')).toHaveAttribute('aria-pressed', 'true')
    expect(expresion()).toBe('Expresión de repetición: 0 9 * * 1,3,5')

    await userEvent.click(screen.getByRole('button', { name: 'Fines de semana' }))
    expect(screen.getByRole('button', { name: 'Fines de semana' })).toHaveAttribute('aria-pressed', 'true')
    expect(pildora('sábado')).toHaveAttribute('aria-pressed', 'true')
    expect(pildora('lunes')).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(pildora('sábado'))
    await userEvent.click(pildora('domingo'))
    expect(pildora('domingo')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Deja al menos un día')).toBeInTheDocument()
  })

  it('3 · «el primer lunes» wheels turn with a click or the arrows, and the day steps with − and +', async () => {
    const alCambiar = vi.fn()
    render(<Montado inicial={{ ...recurrenciaInicial(), freq: 'mensual', modoMes: 'nth' }} alCambiar={alCambiar} />)
    const semana = screen.getByRole('spinbutton', { name: 'Qué semana del mes' })
    expect(semana).toHaveAttribute('aria-valuetext', 'primer')
    await userEvent.click(semana)
    expect(semana).toHaveAttribute('aria-valuetext', 'segundo')
    semana.focus()
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    expect(semana).toHaveAttribute('aria-valuetext', 'último')
    const dia = screen.getByRole('spinbutton', { name: 'Qué día de la semana' })
    dia.focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(dia).toHaveAttribute('aria-valuetext', 'viernes')
    expect(expresion()).toBe('Expresión de repetición: 0 9 * * 5L')
    expect(frase()).toBe('Se repite el último viernes de cada mes, a las 9:00 a. m.')

    await userEvent.click(screen.getByRole('button', { name: 'Un día después' }))
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ modoMes: 'dia', diaMes: 16 }))
    expect(screen.getByRole('radio', { name: 'El día' })).toBeChecked()
    expect(expresion()).toBe('Expresión de repetición: 0 9 16 * *')
  })

  it('3 · the day stops at 1 and 31', async () => {
    render(<Montado inicial={{ ...recurrenciaInicial(), freq: 'mensual', modoMes: 'dia', diaMes: 31 }} />)
    expect(screen.getByRole('button', { name: 'Un día después' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('anual: the month is a radio group and the day is clipped to it', async () => {
    render(<Montado inicial={{ ...recurrenciaInicial(), freq: 'anual', mes: 0, diaAnual: 31 }} />)
    await userEvent.click(screen.getByRole('radio', { name: 'febrero' }))
    expect(screen.getByRole('radio', { name: 'febrero' })).toHaveAttribute('aria-checked', 'true')
    expect(expresion()).toBe('Expresión de repetición: 0 9 29 2 *')
  })

  it('diaria: the switch skips the weekends', async () => {
    render(<Montado inicial={{ ...recurrenciaInicial(), freq: 'diaria' }} />)
    await userEvent.click(screen.getByRole('switch', { name: 'Omitir fines de semana' }))
    expect(screen.getByRole('switch', { name: 'Omitir fines de semana' })).toHaveAttribute('aria-checked', 'true')
    expect(expresion()).toBe('Expresión de repetición: 0 9 * * 1-5')
  })

  it('5 · the sentence says the rule in plain Spanish', async () => {
    render(<Montado />)
    expect(frase()).toBe('Se repite cada semana, los lunes y miércoles, a las 9:00 a. m.')
    await userEvent.click(screen.getByRole('button', { name: 'Todos los días' }))
    expect(frase()).toBe('Se repite todos los días, a las 9:00 a. m.')
  })

  it('6 · the cron chip shows the five fields with their labels', () => {
    render(<Montado />)
    const chip = screen.getByLabelText(/^Expresión de repetición/)
    expect(expresion()).toBe('Expresión de repetición: 0 9 * * 1,3')
    expect([...chip.querySelectorAll('small')].map((s) => s.textContent)).toEqual(['min', 'hora', 'día', 'mes', 'sem'])
  })

  it('7 · the calendar lights the next dates, the first five strong, and lists those five', () => {
    render(<Montado />)
    const cal = screen.getByRole('region', { name: 'Calendario de las próximas repeticiones' })
    expect(within(cal).getByRole('heading', { name: 'Noviembre 2026' })).toBeInTheDocument()
    expect(cal.querySelectorAll('[data-o="1"]')).toHaveLength(5)
    expect(cal.querySelector('[data-dn="2026-11-16"]')).toHaveAttribute('data-o', '1')
    expect(cal.querySelector('[data-dn="2026-12-02"]')).toHaveAttribute('data-o', '2')
    expect(cal.querySelector('[data-dn="2026-11-15"]')).toHaveAttribute('data-hoy')
    const filas = within(screen.getByRole('list', { name: 'Próximas cinco' })).getAllByRole('listitem')
    expect(filas).toHaveLength(5)
    expect(filas[0]).toHaveTextContent('16')
    expect(filas[0]).toHaveTextContent('Lunes')
    expect(filas[0]).toHaveTextContent('nov · mañana')
    expect(filas[0]).toHaveTextContent('9:00')
  })

  it('7 · the month arrows move the calendar', async () => {
    render(<Montado />)
    const cal = screen.getByRole('region', { name: 'Calendario de las próximas repeticiones' })
    await userEvent.click(within(cal).getByRole('button', { name: 'Mes siguiente' }))
    expect(within(cal).getByRole('heading', { name: 'Diciembre 2026' })).toBeInTheDocument()
    expect(cal.querySelector('[data-dn="2026-12-07"]')).toHaveAttribute('data-o', '2')
  })

  it('7 · says so when there are no dates', () => {
    render(<Recurrencia valor={recurrenciaInicial()} alCambiar={() => {}} fechas={[]} hoy="2026-11-15" />)
    expect(screen.getByText('No hay fechas en adelante.')).toBeInTheDocument()
  })
})

describe('RelojDeAviso', () => {
  function Reloj() {
    const [v, setV] = useState({ h: 9, min: 0, pm: false })
    return <RelojDeAviso valor={v} alCambiar={(n) => setV((p) => ({ ...p, ...n }))} />
  }

  it('4 · the hands are sliders: arrows, Page keys, Home and End', async () => {
    render(<Reloj />)
    const hora = screen.getByRole('slider', { name: 'Hora' })
    const minutos = screen.getByRole('slider', { name: 'Minutos' })
    expect(hora).toHaveAttribute('aria-valuetext', '9 a. m.')
    hora.focus()
    await userEvent.keyboard('{ArrowUp}{PageUp}')
    expect(hora).toHaveAttribute('aria-valuetext', '1 a. m.')
    await userEvent.keyboard('{End}')
    expect(hora).toHaveAttribute('aria-valuenow', '12')
    minutos.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(minutos).toHaveAttribute('aria-valuetext', '55 minutos')
    await userEvent.keyboard('{Home}{PageUp}')
    expect(minutos).toHaveAttribute('aria-valuenow', '15')
    expect(screen.getByLabelText('Hora del aviso: 12:15 a. m.')).toBeInTheDocument()
  })

  it('4 · a. m. and p. m. are a radio group', async () => {
    render(<Reloj />)
    await userEvent.click(screen.getByRole('radio', { name: 'p. m.' }))
    expect(screen.getByRole('radio', { name: 'p. m.' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('slider', { name: 'Hora' })).toHaveAttribute('aria-valuetext', '9 p. m.')
  })
})

describe('BotonDeGuardar', () => {
  it('8 · Guardar becomes Guardando… and then a drawn ✓', () => {
    const { rerender } = render(<BotonDeGuardar estado="reposo" texto="Guardar" />)
    const boton = screen.getByRole('button', { name: 'Guardar' })
    expect(boton).toHaveAttribute('data-estado', 'reposo')
    rerender(<BotonDeGuardar estado="guardando" texto="Guardar" />)
    expect(screen.getByRole('button', { name: 'Guardando…' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled()
    rerender(<BotonDeGuardar estado="guardado" texto="Guardar" />)
    expect(screen.getByRole('button', { name: 'Guardado' })).toHaveAttribute('data-estado', 'guardado')
  })
})
