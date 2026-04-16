type Resolver = (value: string) => void

export class StockfishWorker {
  private worker: Worker
  private resolvers = new Map<string, Resolver>()
  private evalCallback: ((cp: number) => void) | null = null
  private _ready = false

  get ready() { return this._ready }

  constructor() {
    this.worker = new Worker('/stockfish/stockfish.js')
    this.worker.addEventListener('message', (e: MessageEvent<string>) => {
      this.handleLine(e.data)
    })
  }

  private handleLine(line: string) {
    if (line === 'uciok') {
      this.resolvers.get('uciok')?.(line)
    } else if (line === 'readyok') {
      this.resolvers.get('readyok')?.(line)
    } else if (line.startsWith('bestmove')) {
      this.resolvers.get('bestmove')?.(line)
    } else if (line.includes(' score cp ') && this.evalCallback) {
      // e.g. "info depth 10 ... score cp 35 ..."
      const m = line.match(/score cp (-?\d+)/)
      if (m) this.evalCallback(parseInt(m[1], 10))
    }
  }

  private send(cmd: string) { this.worker.postMessage(cmd) }

  private waitFor(token: string): Promise<string> {
    return new Promise((resolve) => this.resolvers.set(token, resolve))
  }

  async init(elo = 1400): Promise<void> {
    this.send('uci')
    await this.waitFor('uciok')
    this.send('setoption name UCI_LimitStrength value true')
    this.send(`setoption name UCI_Elo value ${elo}`)
    this.send('isready')
    await this.waitFor('readyok')
    this._ready = true
  }

  onEval(cb: (cp: number) => void) { this.evalCallback = cb }

  async getBestMove(fen: string, depth = 12): Promise<string> {
    this.send('ucinewgame')
    this.send(`position fen ${fen}`)
    this.send(`go depth ${depth}`)
    const result = await this.waitFor('bestmove')
    const m = result.match(/bestmove\s+(\S+)/)
    return m?.[1] ?? ''
  }

  terminate() { this.worker.terminate() }
}
