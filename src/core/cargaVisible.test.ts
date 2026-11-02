import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCargaVisible } from './cargaVisible'

describe('useCargaVisible', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const cargarDurante = (ms: number) => {
    const h = renderHook(({ c }) => useCargaVisible(c), { initialProps: { c: true } })
    act(() => vi.advanceTimersByTime(ms))
    h.rerender({ c: false })
    return h
  }

  it('a fast load turns the skeleton off at once', () => {
    expect(cargarDurante(50).result.current).toBe(false)
  })

  it('a skeleton that appeared stays until 600 ms', () => {
    const h = cargarDurante(300)
    expect(h.result.current).toBe(true)
    act(() => vi.advanceTimersByTime(299))
    expect(h.result.current).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(h.result.current).toBe(false)
  })

  it('a slow load turns it off at once', () => {
    expect(cargarDurante(1500).result.current).toBe(false)
  })
})
