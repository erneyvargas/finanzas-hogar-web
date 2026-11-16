import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Ayuda } from './Ayuda'

describe('Ayuda', () => {
  it('opens on hover as a tooltip that describes the trigger, and closes on leave', async () => {
    render(
      <Ayuda texto="Guarda el movimiento">
        <button type="button">Guardar</button>
      </Ayuda>,
    )
    const boton = screen.getByRole('button', { name: 'Guardar' })
    expect(screen.queryByRole('tooltip')).toBeNull()

    await userEvent.hover(boton)
    const ayuda = await screen.findByRole('tooltip')
    expect(ayuda).toHaveTextContent('Guarda el movimiento')
    expect(boton).toHaveAttribute('aria-describedby', ayuda.id)
    expect(boton).toHaveAccessibleDescription('Guarda el movimiento')

    await userEvent.unhover(boton)
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
    expect(boton).not.toHaveAttribute('aria-describedby')
  })

  it('opens on keyboard focus and closes on Escape', async () => {
    render(
      <Ayuda texto="Cambia el orden">
        <button type="button">⇅</button>
      </Ayuda>,
    )
    await userEvent.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Cambia el orden')

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
  })

  it('closes when the trigger loses focus', async () => {
    render(
      <>
        <Ayuda texto="Primero">
          <button type="button">A</button>
        </Ayuda>
        <button type="button">B</button>
      </>,
    )
    await userEvent.tab()
    await screen.findByRole('tooltip')
    await userEvent.tab()
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
  })

  it('keeps the handlers and the ref the trigger already had', async () => {
    const alEntrar = vi.fn()
    const alTocar = vi.fn()
    let nodo: HTMLButtonElement | null = null
    render(
      <Ayuda texto="Hola">
        <button type="button" onMouseEnter={alEntrar} onClick={alTocar} ref={(el) => void (nodo = el)}>
          X
        </button>
      </Ayuda>,
    )
    const boton = screen.getByRole('button', { name: 'X' })
    await userEvent.click(boton)
    expect(alEntrar).toHaveBeenCalled()
    expect(alTocar).toHaveBeenCalledTimes(1)
    expect(nodo).toBe(boton)
  })

  it('does not repeat as a description what the trigger is already named', async () => {
    render(
      <Ayuda texto="Invertir">
        <button type="button" aria-label="Invertir">
          ⇅
        </button>
      </Ayuda>,
    )
    const boton = screen.getByRole('button', { name: 'Invertir' })
    await userEvent.hover(boton)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Invertir')
    expect(boton).not.toHaveAttribute('aria-describedby')
  })

  it('without a text it leaves the trigger alone', async () => {
    render(
      <Ayuda texto="">
        <button type="button">Nada</button>
      </Ayuda>,
    )
    await userEvent.hover(screen.getByRole('button', { name: 'Nada' }))
    await new Promise((r) => setTimeout(r, 250))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('works on an SVG piece', async () => {
    const { container } = render(
      <svg role="img" aria-label="Gráfico">
        <Ayuda texto="Karen · Oct: $1.000">
          <rect width={10} height={10} />
        </Ayuda>
      </svg>,
    )
    await userEvent.hover(container.querySelector('rect')!)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Karen · Oct: $1.000')
  })
})
