import { ChessEngine, type Square, type PieceSymbol } from './chess/ChessEngine'
import { StockfishWorker } from './chess/StockfishWorker'
import { OpeningBook, type BookOption } from './chess/OpeningBook'
import { Board } from './ui/Board'
import italianData from './chess/openings/italian.json'

// ── DOM refs ───────────────────────────────────────────────
const statusEl    = document.getElementById('status')!
const boardEl     = document.getElementById('board')!
const moveLogEl   = document.getElementById('move-log')!
const evalFillEl  = document.getElementById('eval-fill')!
const bookLabelEl = document.getElementById('book-label')!
const bookFillEl  = document.getElementById('book-fill')!
const btnReset    = document.getElementById('btn-reset') as HTMLButtonElement

// ── State ──────────────────────────────────────────────────
const engine = new ChessEngine()
const sf     = new StockfishWorker()
const book   = new OpeningBook()
book.load(italianData)

let sfThinking = false
let pendingPromo: { from: Square; to: Square } | null = null

interface BookState {
  inBook: boolean
  bookMovesPlayed: number   // суммарно (белые+чёрные) ходов в теории подряд
  leftAtPly: number | null  // номер полухода, на котором впервые ушли из книги
}
let bookState: BookState = freshBookState()

function freshBookState(): BookState {
  return { inBook: true, bookMovesPlayed: 0, leftAtPly: null }
}

// ── Board ──────────────────────────────────────────────────
const board = new Board(boardEl, handleBoardClick)

// ── Init ───────────────────────────────────────────────────
board.render(engine)
updateKnowledgeBar()
setStatus('Загрузка Stockfish...')

sf.init(1400).then(() => {
  setStatus('Белые ходят')
  btnReset.disabled = false
}).catch((err) => {
  setStatus('Ошибка движка: ' + err)
})

sf.onEval((cp) => {
  const whiteCp = engine.turn() === 'w' ? cp : -cp
  updateEvalBar(whiteCp)
})

// ── Click handler ──────────────────────────────────────────
function handleBoardClick(from: Square, to: Square) {
  if (sfThinking || engine.isGameOver()) return
  if (engine.turn() !== 'w') return   // only white (player) can click

  // from === to means "select intent" sent by Board
  if (from === to) {
    const pieces = engine.getBoardPieces()
    const clickedPiece = pieces.find((p) => p.square === from && p.color === 'w')
    if (clickedPiece) {
      const targets = engine.getLegalTargets(from)
      board.selectSquare(from, targets)
    } else {
      board.clearSelection()
    }
    return
  }

  // Actual move
  const piece = engine.getBoardPieces().find((p) => p.square === from)
  const isPawnPromo =
    piece?.type === 'p' &&
    ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'))

  if (isPawnPromo) {
    pendingPromo = { from, to }
    showPromoPicker(to)
    return
  }

  doMove(from, to)
}

function doMove(from: Square, to: Square, promo?: PieceSymbol) {
  board.clearSelection()

  const fenBefore = engine.fen()
  const move = engine.move(from, to, promo ?? 'q')
  if (!move) return

  const isBook = applyBookCheck(fenBefore, move.san)

  board.render(engine)
  board.setLastMove(move, isBook ? 'book' : 'normal')
  updateMoveLog()
  updateKnowledgeBar()
  checkGameOver()

  if (!engine.isGameOver()) {
    aiReply()
  }
}

// ── AI reply (book or Stockfish) ───────────────────────────
async function aiReply() {
  // 1) Try book first
  if (bookState.inBook) {
    const fenBefore = engine.fen()
    const options = book.getBookMoves(fenBefore)
    if (options.length > 0) {
      const chosen = pickWeighted(options)
      const move = engine.moveBySan(chosen.san)
      if (move) {
        applyBookCheck(fenBefore, move.san)   // confirms still in book
        board.render(engine)
        board.setLastMove(move, 'book')
        updateMoveLog()
        updateKnowledgeBar()
        if (engine.isGameOver()) {
          setStatus(gameOverMessage())
        } else {
          setStatus('Белые ходят')
        }
        return
      }
    }
  }

  // 2) Fallback: Stockfish
  sfThinking = true
  setStatus('Чёрные думают...')

  const fenBefore = engine.fen()
  const uciMove = await sf.getBestMove(fenBefore)
  sfThinking = false

  if (!uciMove || uciMove === '(none)') {
    setStatus(gameOverMessage())
    return
  }

  const from = uciMove.slice(0, 2) as Square
  const to   = uciMove.slice(2, 4) as Square
  const promo = uciMove.length === 5 ? (uciMove[4] as PieceSymbol) : undefined

  const move = engine.move(from, to, promo)
  if (!move) return

  const isBook = applyBookCheck(fenBefore, move.san)
  board.render(engine)
  board.setLastMove(move, isBook ? 'book' : 'normal')
  updateMoveLog()
  updateKnowledgeBar()

  if (engine.isGameOver()) {
    setStatus(gameOverMessage())
  } else {
    setStatus('Белые ходят')
  }
}

function pickWeighted(options: BookOption[]): BookOption {
  const total = options.reduce((s, o) => s + o.weight, 0)
  let r = Math.random() * total
  for (const o of options) {
    r -= o.weight
    if (r <= 0) return o
  }
  return options[options.length - 1]
}

// Returns true if the move *was* a book move.
// Mutates bookState. Once we leave the book, we never return.
function applyBookCheck(fenBefore: string, san: string): boolean {
  if (!bookState.inBook) return false

  const isBook = book.isBookMove(fenBefore, san)
  if (isBook) {
    bookState.bookMovesPlayed += 1
    return true
  }

  bookState.inBook = false
  bookState.leftAtPly = engine.history().length   // ply we just played
  return false
}

// ── Promotion picker ───────────────────────────────────────
function showPromoPicker(toSq: Square) {
  document.getElementById('promo-picker')?.remove()

  const sqEl = boardEl.querySelector(`[data-sq="${toSq}"]`) as HTMLElement | null
  if (!sqEl) return

  const picker = document.createElement('div')
  picker.id = 'promo-picker'

  type PromoSymbol = 'q' | 'r' | 'b' | 'n'
  const pieces: PromoSymbol[] = ['q', 'r', 'b', 'n']
  const glyphs: Record<PromoSymbol, string> = { q: '♕', r: '♖', b: '♗', n: '♘' }

  for (const p of pieces) {
    const btn = document.createElement('button')
    btn.textContent = glyphs[p]
    btn.onclick = () => {
      picker.remove()
      if (pendingPromo) {
        doMove(pendingPromo.from, pendingPromo.to, p as PieceSymbol)
        pendingPromo = null
      }
    }
    picker.appendChild(btn)
  }

  const rect = sqEl.getBoundingClientRect()
  const boardRect = boardEl.getBoundingClientRect()
  picker.style.left = `${rect.left - boardRect.left}px`
  picker.style.top  = `${rect.bottom - boardRect.top}px`

  boardEl.parentElement!.style.position = 'relative'
  boardEl.parentElement!.appendChild(picker)
}

// ── Move log ───────────────────────────────────────────────
function updateMoveLog() {
  const history = engine.history()
  moveLogEl.innerHTML = ''
  for (let i = 0; i < history.length; i += 2) {
    const div = document.createElement('div')
    div.className = 'move-pair'
    div.innerHTML =
      `<span class="move-num">${Math.floor(i / 2) + 1}.</span>` +
      `<span class="white-move">${history[i] ?? ''}</span>` +
      `<span class="black-move">${history[i + 1] ?? ''}</span>`
    moveLogEl.appendChild(div)
  }
  moveLogEl.scrollTop = moveLogEl.scrollHeight
}

// ── Eval bar ───────────────────────────────────────────────
function updateEvalBar(cp: number) {
  const clamped = Math.max(-800, Math.min(800, cp))
  const pct = 50 + (clamped / 800) * 50
  evalFillEl.style.width = `${pct.toFixed(1)}%`
}

// ── Knowledge bar ──────────────────────────────────────────
function updateKnowledgeBar() {
  const played = bookState.bookMovesPlayed
  if (bookState.inBook) {
    bookLabelEl.textContent = `📖 ${book.getName()} · ${played} ${plural(played, 'ход', 'хода', 'ходов')} в теории`
    bookLabelEl.classList.remove('out-of-book')
  } else {
    const ply = bookState.leftAtPly ?? 0
    const moveNo = Math.floor((ply - 1) / 2) + 1
    const side = (ply % 2 === 1) ? 'белые' : 'чёрные'
    bookLabelEl.textContent = `❌ Вышли из теории на ${moveNo}-м ходу (${side}). В книге было ${played}.`
    bookLabelEl.classList.add('out-of-book')
  }
  // Fill grows with each book move; cap visually at ~16 plies of theory
  const pct = Math.min(100, (played / 16) * 100)
  bookFillEl.style.width = `${pct.toFixed(0)}%`
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10, mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

// ── Helpers ────────────────────────────────────────────────
function setStatus(msg: string) { statusEl.textContent = msg }

function checkGameOver() {
  if (engine.isGameOver()) setStatus(gameOverMessage())
}

function gameOverMessage(): string {
  if (engine.isCheckmate()) return engine.turn() === 'w' ? 'Чёрные победили' : 'Белые победили'
  if (engine.isStalemate()) return 'Пат'
  if (engine.isDraw())      return 'Ничья'
  return 'Конец игры'
}

// ── Reset ──────────────────────────────────────────────────
btnReset.addEventListener('click', () => {
  engine.reset()
  pendingPromo = null
  sfThinking = false
  bookState = freshBookState()
  document.getElementById('promo-picker')?.remove()
  board.clearSelection()
  board.render(engine)
  updateMoveLog()
  updateEvalBar(0)
  updateKnowledgeBar()
  setStatus('Белые ходят')
})
