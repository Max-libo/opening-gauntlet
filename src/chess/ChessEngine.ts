import { Chess, type Move, type Square, type PieceSymbol, type Color } from 'chess.js'

export type { Square, PieceSymbol, Color, Move }

export interface BoardPiece {
  type: PieceSymbol
  color: Color
  square: Square
}

export class ChessEngine {
  private chess = new Chess()

  move(from: Square, to: Square, promotion: PieceSymbol = 'q'): Move | null {
    try {
      return this.chess.move({ from, to, promotion })
    } catch {
      return null
    }
  }

  moveBySan(san: string): Move | null {
    try {
      return this.chess.move(san)
    } catch {
      return null
    }
  }

  getLegalTargets(square: Square): Square[] {
    return this.chess
      .moves({ square, verbose: true })
      .map((m) => m.to as Square)
  }

  getBoardPieces(): BoardPiece[] {
    const pieces: BoardPiece[] = []
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (cell) pieces.push({ type: cell.type, color: cell.color, square: cell.square })
      }
    }
    return pieces
  }

  fen(): string { return this.chess.fen() }
  turn(): Color { return this.chess.turn() }
  isGameOver(): boolean { return this.chess.isGameOver() }
  isCheck(): boolean { return this.chess.isCheck() }
  isCheckmate(): boolean { return this.chess.isCheckmate() }
  isDraw(): boolean { return this.chess.isDraw() }
  isStalemate(): boolean { return this.chess.isStalemate() }

  history(): string[] { return this.chess.history() }

  reset(): void { this.chess.reset() }
}
