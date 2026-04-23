import type { ChessEngine, Square, PieceSymbol, Move } from '../chess/ChessEngine'

const PIECE_UNICODE: Record<PieceSymbol, string> = {
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const

export type MoveHandler = (from: Square, to: Square, promotion?: PieceSymbol) => void

export class Board {
  private el: HTMLElement
  private squares = new Map<Square, HTMLElement>()
  private selected: Square | null = null
  private hints: Square[] = []
  private lastMove: [Square, Square] | null = null
  private onMove: MoveHandler
  private flipped = false

  constructor(container: HTMLElement, onMove: MoveHandler) {
    this.el = container
    this.onMove = onMove
    this.buildGrid()
  }

  private buildGrid() {
    this.el.innerHTML = ''
    this.squares.clear()

    const ranks = this.flipped ? [...RANKS].reverse() : RANKS
    const files = this.flipped ? [...FILES].reverse() : FILES

    for (const rank of ranks) {
      for (const file of files) {
        const sq = `${file}${rank}` as Square
        const div = document.createElement('div')
        const isLight = (FILES.indexOf(file) + RANKS.indexOf(rank)) % 2 === 0
        div.className = `sq ${isLight ? 'light' : 'dark'}`
        div.dataset.sq = sq

        // Corner labels
        if (file === (this.flipped ? 'h' : 'a')) {
          const r = document.createElement('span')
          r.className = 'coord coord-rank'
          r.textContent = rank
          div.appendChild(r)
        }
        if (rank === (this.flipped ? '8' : '1')) {
          const f = document.createElement('span')
          f.className = 'coord coord-file'
          f.textContent = file
          div.appendChild(f)
        }

        div.addEventListener('click', () => this.handleClick(sq))
        this.squares.set(sq, div)
        this.el.appendChild(div)
      }
    }
  }

  private handleClick(sq: Square) {
    if (this.selected) {
      if (this.hints.includes(sq)) {
        this.onMove(this.selected, sq)
        this.clearSelection()
        return
      }
      if (sq === this.selected) { this.clearSelection(); return }
    }
    // Select new square (handled externally via selectSquare)
    this.onMove(sq, sq) // signal "select" — main.ts ignores from===to as select intent
  }

  selectSquare(sq: Square, hints: Square[]) {
    this.clearSelection()
    this.selected = sq
    this.hints = hints
    this.squares.get(sq)?.classList.add('selected')
    for (const h of hints) {
      const el = this.squares.get(h)
      if (!el) continue
      el.classList.add('hint')
      if (el.querySelector('.piece')) el.classList.add('occupied')
    }
  }

  clearSelection() {
    if (this.selected) this.squares.get(this.selected)?.classList.remove('selected')
    for (const h of this.hints) {
      this.squares.get(h)?.classList.remove('hint', 'occupied')
    }
    this.selected = null
    this.hints = []
  }

  render(engine: ChessEngine) {
    // Clear pieces
    for (const [, el] of this.squares) {
      el.querySelector('.piece')?.remove()
    }

    // Place pieces
    for (const { type, color, square } of engine.getBoardPieces()) {
      const el = this.squares.get(square)
      if (!el) continue
      const span = document.createElement('span')
      span.className = `piece piece-${color}`
      span.textContent = PIECE_UNICODE[type]
      el.appendChild(span)
    }

    // Last-move highlight
    if (this.lastMove) {
      for (const sq of this.lastMove) this.squares.get(sq)?.classList.remove('last-move')
    }
    // (set by setLastMove)
  }

  setLastMove(move: Move, kind: 'book' | 'normal' = 'normal') {
    if (this.lastMove) {
      for (const sq of this.lastMove) {
        this.squares.get(sq)?.classList.remove('last-move', 'last-move-book')
      }
    }
    this.lastMove = [move.from as Square, move.to as Square]
    const cls = kind === 'book' ? 'last-move-book' : 'last-move'
    for (const sq of this.lastMove) this.squares.get(sq)?.classList.add(cls)
  }

  flip() {
    this.flipped = !this.flipped
    this.buildGrid()
  }
}
