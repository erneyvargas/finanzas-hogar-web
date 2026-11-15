import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Glifo } from './Glifo'
import { GLIFO_NEUTRO, glifoDe } from './glifos'

describe('the category glyphs', () => {
  it('translates a stored name to its Material Symbols ligature, like the phone', () => {
    expect(glifoDe('shopping-cart')).toBe('shopping_cart')
    expect(glifoDe('wifi')).toBe('router')
  })

  it('falls back to the neutral label for a missing or unknown name', () => {
    expect(glifoDe(null)).toBe(GLIFO_NEUTRO)
    expect(glifoDe('nuevo-del-futuro')).toBe(GLIFO_NEUTRO)
  })

  it('renders a decorative glyph that adds no text', () => {
    const { container } = render(<Glifo nombre="home" />)
    const g = container.querySelector('.glifo')!
    expect(g).toHaveAttribute('aria-hidden', 'true')
    expect(g).toHaveAttribute('data-glifo', 'home')
    expect(g.textContent).toBe('')
  })
})
