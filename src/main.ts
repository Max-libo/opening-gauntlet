import { ChessEngine, type Square, type PieceSymbol } from './chess/ChessEngine'
import { StockfishWorker } from './chess/StockfishWorker'
import { Board } from './ui/Board'

// ── DOM refs ───────────────────────────────────────────────
const statusEl   = document.getElementById('status')!
const boardEl    = document.getElementById('board')!
const moveLogEl  = document.getElementById('move-log')!
const evalFillEl = document.getElementById('eval-fill')!
const btnReset   = document.getElementById('btn-reset') as HTMLButtonElement

// ── State ──────────────────────────────────────────────────
const engine = new ChessEngine()
const sf     = new StockfishWorker()
let   sfThinking = false
let   pendingPromo: { from: Square; to: Square } | null = null
// ── Board ──────────────────────────────────────────────────
const board = new Board(boardEl, handleBoardClick)

// ── Init ───────────────────────────────────────────────────
setStatus('Загрузка Stockfish...')

sf.init(1400).then(() => {
  setStatus('Белые ходят')
  btnReset.disabled = false
  board.render(engine)
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
      // selection cleared
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
  const move = engine.move(from, to, promo ?? 'q')
  if (!move) return

  board.render(engine)
  board.setLastMove(move)
  updateMoveLog()
  checkGameOver()

  if (!engine.isGameOver()) {
    stockfishReply()
  }
}

// ── Stockfish reply ────────────────────────────────────────
async function stockfishReply() {
  sfThinking = true
  setStatus('Чёрные думают...')

  const uciMove = await sf.getBestMove(engine.fen())
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

  board.render(engine)
  board.setLastMove(move)
  updateMoveLog()

  if (engine.isGameOver()) {
    setStatus(gameOverMessage())
  } else {
    setStatus('Белые ходят')
  }
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
  // Map centipawns → 0–100% (white's share)
  const clamped = Math.max(-800, Math.min(800, cp))
  const pct = 50 + (clamped / 800) * 50
  evalFillEl.style.width = `${pct.toFixed(1)}%`
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
  document.getElementById('promo-picker')?.remove()
  board.clearSelection()
  board.render(engine)
  updateMoveLog()
  updateEvalBar(0)
  setStatus('Белые ходят')
})
