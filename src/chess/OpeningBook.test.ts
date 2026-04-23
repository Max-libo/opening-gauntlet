import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { OpeningBook } from './OpeningBook'
import italianData from './openings/italian.json'

describe('OpeningBook.normalizeFen', () => {
  it('drops halfmove and fullmove counters', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    expect(OpeningBook.normalizeFen(fen))
      .toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -')
  })

  it('matches positions reached by different move orders (counters differ)', () => {
    // Same position, two different move sequences produce same normalized FEN
    const a = new Chess(); a.move('e4'); a.move('e5'); a.move('Nf3')
    const b = new Chess(); b.move('Nf3'); b.move('Nf6'); b.move('e4')
    // (different positions actually — let's use a real transposition test instead)
    // 1.e4 Nf6 2.Nc3 vs 1.Nc3 Nf6 2.e4 → same position
    const c = new Chess(); c.move('e4'); c.move('Nf6'); c.move('Nc3')
    const d = new Chess(); d.move('Nc3'); d.move('Nf6'); d.move('e4')
    expect(OpeningBook.normalizeFen(c.fen()))
      .toBe(OpeningBook.normalizeFen(d.fen()))
    // sanity: a and b are different positions
    expect(OpeningBook.normalizeFen(a.fen()))
      .not.toBe(OpeningBook.normalizeFen(b.fen()))
  })
})

describe('OpeningBook with Italian data', () => {
  const book = new OpeningBook()
  book.load(italianData)

  it('exposes the opening name', () => {
    expect(book.getName()).toBe('Italian Game')
  })

  it('recognises 1.e4 as a book move from the start position', () => {
    const start = new Chess().fen()
    expect(book.isBookMove(start, 'e4')).toBe(true)
    expect(book.isBookMove(start, 'd4')).toBe(false)
  })

  it('recognises a deep main-line move (Giuoco Pianissimo)', () => {
    const c = new Chess()
    for (const m of ['e4','e5','Nf3','Nc6','Bc4','Bc5','c3']) c.move(m)
    expect(book.isBookMove(c.fen(), 'Nf6')).toBe(true)
  })

  it('returns multiple book options at branch points', () => {
    const c = new Chess()
    for (const m of ['e4','e5','Nf3','Nc6','Bc4']) c.move(m)
    const opts = book.getBookMoves(c.fen()).map(o => o.san).sort()
    // Italian (Bc5), Two Knights (Nf6), Hungarian (Be7) are all in our JSON
    expect(opts).toEqual(['Bc5','Be7','Nf6'])
  })

  it('returns empty for an out-of-book position', () => {
    const c = new Chess()
    for (const m of ['e4','e5','Nf3','Nc6','Bb5']) c.move(m)   // Ruy Lopez, not in book
    expect(book.getBookMoves(c.fen())).toEqual([])
  })
})
