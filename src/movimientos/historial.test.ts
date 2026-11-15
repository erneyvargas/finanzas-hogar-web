import { describe, expect, it } from 'vitest'
import { historialDeTextos, sugerir, type TextoUsado } from './historial'

const u = (comercio: string | null, nota: string | null, categoriaId: string | null, fecha: string): TextoUsado => ({
  comercio,
  nota,
  categoriaId,
  fecha,
})

const usados = [
  u('Jardín Infantil', 'Pensión jardín', 'educacion', '2026-10-01T10:00:00Z'),
  u('Jardin infantil', 'Pensión jardín', 'educacion', '2026-10-15T10:00:00Z'),
  u('Juan Valdez', 'Café', 'cafe', '2026-10-20T10:00:00Z'),
  u('Juan Valdez', 'Café con Karen', 'cafe', '2026-10-21T10:00:00Z'),
  u('Juan Valdez', null, 'cafe', '2026-10-22T10:00:00Z'),
  u('Tienda Don Jacinto', null, 'mercado', '2026-10-23T10:00:00Z'),
]

describe('suggestions from the household history', () => {
  const h = historialDeTextos(usados)

  it('matches the start of any word, ignoring case and accents, the most used first', () => {
    expect(sugerir(h.comercios, 'ja')).toEqual(['Jardin infantil', 'Tienda Don Jacinto'])
    expect(sugerir(h.comercios, 'J')).toEqual(['Juan Valdez', 'Jardin infantil', 'Tienda Don Jacinto'])
    expect(sugerir(h.notas, 'jar')).toEqual(['Pensión jardín'])
  })

  it('shows the most recent spelling and never what is already typed whole', () => {
    expect(sugerir(h.comercios, 'jardin infantil')).toEqual([])
    expect(sugerir(h.comercios, 'infan')).toEqual(['Jardin infantil'])
  })

  it('puts first what was used with the chosen category', () => {
    expect(sugerir(h.comercios, 'j', 'mercado')[0]).toBe('Tienda Don Jacinto')
  })

  it('suggests nothing for a blank text, and at most five', () => {
    expect(sugerir(h.comercios, '   ')).toEqual([])
    const muchos = historialDeTextos(Array.from({ length: 8 }, (_, i) => u(`Tienda ${i}`, null, null, '2026-10-01T00:00:00Z')))
    expect(sugerir(muchos.comercios, 'tien')).toHaveLength(5)
  })
})
