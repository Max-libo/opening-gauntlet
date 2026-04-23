import { Chess } from 'chess.js'

export interface OpeningData {
  name: string
  lines: string[][]
}

export interface BookOption {
  san: string
  weight: number
}

export class OpeningBook {
  private name = ''
  private positions = new Map<string, Map<string, number>>()

  load(data: OpeningData): void {
    this.name = data.name
    this.positions.clear()

    for (const line of data.lines) {
      const chess = new Chess()
      for (const san of line) {
        const key = OpeningBook.normalizeFen(chess.fen())
        let bucket = this.positions.get(key)
        if (!bucket) {
          bucket = new Map()
          this.positions.set(key, bucket)
        }
        bucket.set(san, (bucket.get(san) ?? 0) + 1)

        try {
          chess.move(san)
        } catch {
          console.warn(`OpeningBook: bad SAN "${san}" in line`, line)
          break
        }
      }
    }
  }

  getName(): string { return this.name }

  isBookMove(fenBefore: string, san: string): boolean {
    const bucket = this.positions.get(OpeningBook.normalizeFen(fenBefore))
    return !!bucket?.has(san)
  }

  getBookMoves(fenBefore: string): BookOption[] {
    const bucket = this.positions.get(OpeningBook.normalizeFen(fenBefore))
    if (!bucket) return []
    return [...bucket.entries()].map(([san, weight]) => ({ san, weight }))
  }

  static normalizeFen(fen: string): string {
    return fen.split(' ').slice(0, 4).join(' ')
  }
}
