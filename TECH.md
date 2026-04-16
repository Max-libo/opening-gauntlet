# Technical Architecture

## Stack

| Слой | Технология | Причина |
|------|-----------|---------|
| Язык | TypeScript | Типизация, лучше для сложной игровой логики |
| Сборка | Vite | Быстрая разработка, нет конфига |
| Шахм. логика | chess.js | Стандарт, валидация ходов, FEN/PGN |
| Доска | chessboard.js или кастомная SVG | Лёгкая, настраиваемая |
| Stockfish | stockfish.js (WASM) | Работает в браузере через WebWorker |
| Opening DB | Lichess Opening API или JSON-файл | Бесплатно, открыто |
| Стили | CSS (без фреймворка) | Минимализм, нет зависимостей |
| Хранилище | localStorage | Без бэкенда на v0.1 |
| Тесты | Vitest | Совместим с Vite |

**Нет React / Vue** — игра достаточно простая, компонентный фреймворк избыточен.
Можно переосмыслить если UI сильно усложнится.

---

## Структура проекта

```
game-project/
├── src/
│   ├── main.ts              # Точка входа
│   ├── game/
│   │   ├── GameState.ts     # Центральное состояние рана
│   │   ├── RunManager.ts    # Логика прогрессии рана
│   │   └── SaveManager.ts   # localStorage сохранения
│   ├── chess/
│   │   ├── ChessEngine.ts   # Обёртка над chess.js
│   │   ├── StockfishWorker.ts # Коммуникация с SF через Worker
│   │   └── OpeningBook.ts   # Загрузка и проверка дебютов
│   ├── enemies/
│   │   ├── Enemy.ts         # Интерфейс противника
│   │   ├── EnemyPool.ts     # Пул и выборка противников
│   │   └── data/            # JSON-файлы с данными врагов
│   │       ├── italian.json
│   │       ├── sicilian.json
│   │       └── ...
│   ├── ui/
│   │   ├── Board.ts         # Рендер доски
│   │   ├── EnemyPanel.ts    # Портрет + реплики
│   │   ├── HUD.ts           # HP, Knowledge Bar
│   │   ├── OpeningCards.ts  # Карты дебютов
│   │   └── Screens.ts       # MainMenu, GameOver, BetweenRounds
│   └── assets/
│       ├── portraits/       # SVG/PNG портреты врагов
│       └── pieces/          # SVG фигуры
├── public/
│   └── stockfish/
│       ├── stockfish.js
│       └── stockfish.wasm
├── tests/
├── docs/                    # Все .md документы
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Модули

### ChessEngine.ts
Обёртка над `chess.js`:
```typescript
interface ChessEngine {
  loadFen(fen: string): void
  move(move: string): MoveResult
  getLegalMoves(): string[]
  isGameOver(): boolean
  getResult(): GameResult
  toFen(): string
  toPgn(): string
}
```

### StockfishWorker.ts
WebWorker для Stockfish:
```typescript
interface StockfishWorker {
  setElo(elo: number): void
  getBestMove(fen: string, depth: number): Promise<string>
  evaluate(fen: string): Promise<Evaluation>
  stop(): void
}
```

### OpeningBook.ts
```typescript
interface OpeningBook {
  // Проверяет: этот ход есть в теории?
  isBookMove(fen: string, move: string): boolean
  // Возвращает все теоретические ходы из позиции
  getBookMoves(fen: string): BookMove[]
  // Глубина текущей позиции в теории
  getDepth(fen: string): number
  // Загрузка конкретной линии для противника
  loadLine(moves: string[]): void
}
```

### GameState.ts
Центральное состояние (простой объект, без реактивности):
```typescript
interface GameState {
  phase: 'menu' | 'battle' | 'between' | 'gameover'
  run: {
    floor: number
    maxFloors: number
    hp: number
    maxHp: number
    score: number
    knowledgePoints: number
  }
  battle: {
    enemy: Enemy
    playerColor: 'white' | 'black'
    moveCount: number
    inTheory: boolean
    theoryDepth: number
    pgn: string
  }
  meta: {
    unlockedEnemies: string[]
    openingCards: string[]
    achievements: string[]
    totalRuns: number
  }
}
```

---

## Stockfish: детали интеграции

### Источник
- Stockfish 16 WASM: https://github.com/lichess-org/stockfish.wasm
- Лицензия: GPL (можно использовать для некоммерческих проектов)
- Размер: ~6 MB (однократная загрузка, кешируется)

### Ограничение силы
Stockfish поддерживает UCI-опцию `UCI_LimitStrength` и `UCI_Elo`:
```
setoption name UCI_LimitStrength value true
setoption name UCI_Elo value 1400
```

### Глубина поиска для скорости
| ELO | Depth | Время хода |
|-----|-------|-----------|
| 800 | 5 | ~0.1s |
| 1200 | 8 | ~0.3s |
| 1600 | 12 | ~0.5s |

---

## Opening Book: источники данных

### Вариант A: Lichess API (онлайн)
```
GET https://explorer.lichess.ovh/masters?fen=<FEN>
```
Плюсы: актуально, глубокая база. Минусы: нужен интернет, лимиты.

### Вариант B: Локальный JSON (оффлайн, рекомендуется для v0.1)
Предзагруженный JSON с ходами по каждому дебюту:
```json
{
  "e4 e5 Nf3 Nc6 Bc4": {
    "name": "Итальянская партия",
    "moves": ["Nf6", "Bc5", "d6"],
    "main": "Bc5"
  }
}
```

Источник данных: `eco.json` из репозитория chess.js или Lichess opening tsv.

### Вариант C: Гибрид
Локальный JSON для основных линий + Lichess API для углублённых позиций.

**Рекомендация:** Вариант B для v0.1, Вариант C для v0.2.

---

## Производительность и размер

Целевые показатели:
- Первая загрузка: < 3 сек (без Stockfish WASM)
- С Stockfish: < 8 сек (Progressive Loading — SF грузится в фоне)
- Размер бандла (без SF): < 200 KB
- Поддержка: Chrome 90+, Firefox 88+, Safari 15+

---

## Деплой

v0.1 — статический сайт:
- GitHub Pages (бесплатно)
- Netlify / Vercel (бесплатно)
- Никакого бэкенда не требуется

Требования к хостингу для Stockfish WASM:
- Заголовки: `Cross-Origin-Opener-Policy: same-origin`
- Заголовки: `Cross-Origin-Embedder-Policy: require-corp`
(нужны для SharedArrayBuffer, Netlify/Vercel поддерживают)
