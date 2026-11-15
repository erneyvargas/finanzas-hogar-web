import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Anillo } from './Anillo'
import { Cifra } from './Cifra'

describe('Cifra', () => {
  it('reads as its text and draws one rolling column per digit', () => {
    const { container, rerender } = render(<Cifra texto="$45.000" />)

    expect(screen.getByText('$45.000')).toBeInTheDocument()
    expect(container.querySelectorAll('.cifra-col')).toHaveLength(5)
    expect(container.querySelectorAll('.cifra-sep')).toHaveLength(1)

    rerender(<Cifra texto="$1.245.000" />)
    expect(screen.getByText('$1.245.000')).toBeInTheDocument()
    expect(container.querySelectorAll('.cifra-col')).toHaveLength(7)
  })

  it('moves each digit strip to its digit', async () => {
    const { container } = render(<Cifra texto="$907" />)
    const tiras = () => [...container.querySelectorAll<HTMLElement>('.cifra-tira')].map((t) => t.style.getPropertyValue('--d'))
    await vi.waitFor(() => expect(tiras()).toEqual(['9', '0', '7']))
  })
})

describe('Anillo', () => {
  const partes = [
    { id: 'a', valor: 3, color: 'red', nombre: 'Uno' },
    { id: 'b', valor: 1, color: 'blue', nombre: 'Dos' },
  ]

  it('is an image named by its label, with one segment per part', () => {
    const { container } = render(<Anillo etiqueta="Gasto por categoría" partes={partes} elegido={null} alElegir={() => {}} />)

    expect(screen.getByRole('img', { name: 'Gasto por categoría' })).toBeInTheDocument()
    expect(container.querySelectorAll('.anillo-seg')).toHaveLength(2)
  })

  it('draws its segments also after a StrictMode remount', async () => {
    const { container } = render(
      <StrictMode>
        <Anillo etiqueta="x" partes={partes} elegido={null} alElegir={() => {}} />
      </StrictMode>,
    )
    await vi.waitFor(() => {
      for (const p of container.querySelectorAll('.anillo-seg')) expect(p.getAttribute('d')).toMatch(/^M/)
    }, { timeout: 3000 })
  })

  it('a click on a segment chooses its part, and marks the chosen one', async () => {
    const alElegir = vi.fn()
    const { container, rerender } = render(<Anillo etiqueta="x" partes={partes} elegido={null} alElegir={alElegir} />)

    await userEvent.click(container.querySelectorAll('.anillo-seg')[1])
    expect(alElegir).toHaveBeenCalledWith('b')

    rerender(<Anillo etiqueta="x" partes={partes} elegido="b" alElegir={alElegir} />)
    expect(container.querySelectorAll('.anillo-seg')[1]).toHaveAttribute('data-elegido', 'true')
    expect(container.querySelectorAll('.anillo-seg')[0]).not.toHaveAttribute('data-elegido')
  })
})
