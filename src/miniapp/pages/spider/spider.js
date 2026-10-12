// pages/spider/spider.js —— 蜘蛛纸牌
const SUITS = ['♠', '♥', '♦', '♣'];
const RANK_NAMES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const MODES = {
  easy:   { name: '初级', suits: [0],                   decks: 8, desc: '1种花色 · 8副牌' },
  medium: { name: '中级', suits: [0, 1],                decks: 4, desc: '2种花色 · 4副牌' },
  hard:   { name: '高级', suits: [0, 1, 2, 3],          decks: 2, desc: '4种花色 · 2副牌' },
};

const MODE_ORDER = ['easy', 'medium', 'hard'];

const INIT_SCORE = 500;
const FOUNDATION_BONUS = 100;

Page({
  data: {
    mode: '',
    columns: [],
    columnsHeight: [],
    stockCount: 0,
    canDeal: false,
    stockEmpty: false,
    score: INIT_SCORE,
    moves: 0,
    foundations: 0,
    status: 'idle',          // idle | playing | won | lost
    showModeSelect: true,
    showWin: false,
    showLose: false,
    showNextMode: false,
    isLastMode: false,
    selectedCol: -1,
    selectedRow: -1,
  },

  onLoad() {
    this._columns = [];
    this._stock   = [];
    this._score   = INIT_SCORE;
    this._moves   = 0;
    this._foundations = 0;
    this._selectedCol = -1;
    this._selectedRow = -1;
    this._status      = 'idle';
  },

  // ===================== 模式选择 =====================
  selectMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ mode, showModeSelect: false });
    this.startGame(mode);
  },

  // ===================== 游戏初始化 =====================
  startGame(mode) {
    this._selectedCol = -1;
    this._selectedRow = -1;
    this._score       = INIT_SCORE;
    this._moves       = 0;
    this._foundations = 0;
    this._status      = 'playing';

    const cfg = MODES[mode];
    this._columns = Array.from({ length: 10 }, () => []);
    this._stock   = this._createDeck(cfg);
    this._shuffle(this._stock);
    this._dealInitial();
    this._renderGame();
  },

  _createDeck(cfg) {
    const deck = [];
    for (let d = 0; d < cfg.decks; d++) {
      for (const suit of cfg.suits) {
        for (let rank = 1; rank <= 13; rank++) {
          deck.push({ suit, rank, faceUp: false, id: `s${suit}_r${rank}_d${d}` });
        }
      }
    }
    return deck;
  },

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  },

  _dealInitial() {
    // 前4列各6张，后6列各5张，共54张；剩余50张在牌堆
    for (let col = 0; col < 10; col++) {
      const count = col < 4 ? 6 : 5;
      for (let i = 0; i < count; i++) {
        const card = this._stock.pop();
        card.faceUp = (i === count - 1);
        this._columns[col].push(card);
      }
    }
  },

  // ===================== 渲染 =====================
  _renderGame() {
    const columns = this._columns.map((col, colIdx) => {
      let top = 0;
      return col.map((card, rowIdx) => {
        const isSelected = this._selectedCol === colIdx
                        && this._selectedRow >= 0
                        && rowIdx >= this._selectedRow;
        const offset = card.faceUp ? 48 : 28;
        const cardTop = top;
        top += offset;
        return {
          suit: card.suit,
          rank: card.rank,
          faceUp: card.faceUp,
          rankText: RANK_NAMES[card.rank - 1],
          suitSymbol: SUITS[card.suit],
          isRed: card.suit === 1 || card.suit === 2,
          top: cardTop,
          selected: isSelected,
          isNew: card._isNew || false,
          justMoved: card._justMoved || false,
          dealDelay: card._isNew ? colIdx * 40 : 0,
          col: colIdx,
          row: rowIdx,
        };
      });
    });

    const columnsHeight = columns.map(col => {
      if (col.length === 0) return 100;
      return col[col.length - 1].top + 100;
    });

    const modeIdx = MODE_ORDER.indexOf(this.data.mode);
    const stockEmpty = this._stock.length === 0;

    this.setData({
      columns,
      columnsHeight,
      score: this._score,
      moves: this._moves,
      foundations: this._foundations,
      stockCount: this._stock.length,
      stockEmpty,
      canDeal: this._stock.length >= 10 && this._columns.every(c => c.length > 0),
      status: this._status,
      selectedCol: this._selectedCol,
      selectedRow: this._selectedRow,
      isLastMode: modeIdx >= MODE_ORDER.length - 1,
      showNextMode: modeIdx < MODE_ORDER.length - 1,
    });
  },

  // ===================== 交互 =====================
  onCardTap(e) {
    if (this._status !== 'playing') return;
    const col = Number(e.currentTarget.dataset.col);
    const row = Number(e.currentTarget.dataset.row);
    const column = this._columns[col];
    if (!column[row] || !column[row].faceUp) {
      return;
    }

    if (this._selectedCol >= 0) {
      if (col === this._selectedCol) {
        // 同列：取消选中
        this._selectedCol = -1;
        this._selectedRow = -1;
        this._renderGame();
      } else {
        // 不同列：尝试移动
        this._tryMove(col);
      }
    } else {
      // 未选中：尝试选中
      this._trySelect(col, row);
    }
  },

  onColumnTap(e) {
    if (this._status !== 'playing') return;
    const col = Number(e.currentTarget.dataset.col);
    if (this._selectedCol >= 0 && col !== this._selectedCol) {
      this._tryMove(col);
    }
  },

  _trySelect(col, row) {
    if (!this._canSelect(col, row)) {
      wx.showToast({ title: '需同花色连续降序', icon: 'none', duration: 1200 });
      return;
    }
    this._selectedCol = col;
    this._selectedRow = row;
    this._renderGame();
  },

  _canSelect(col, row) {
    const column = this._columns[col];
    if (!column[row] || !column[row].faceUp) return false;
    for (let i = row; i < column.length - 1; i++) {
      if (column[i].suit !== column[i + 1].suit
       || column[i].rank !== column[i + 1].rank + 1) {
        return false;
      }
    }
    return true;
  },

  _tryMove(toCol) {
    if (!this._canMove(this._selectedCol, this._selectedRow, toCol)) {
      // 无法移动 → 尝试改选目标列最后一张亮牌
      const toColArr = this._columns[toCol];
      if (toColArr.length > 0) {
        const lastIdx = toColArr.length - 1;
        if (this._canSelect(toCol, lastIdx)) {
          this._selectedCol = toCol;
          this._selectedRow = lastIdx;
          this._renderGame();
          return;
        }
      }
      this._selectedCol = -1;
      this._selectedRow = -1;
      this._renderGame();
      wx.showToast({ title: '无法移动到此位置', icon: 'none', duration: 1000 });
      return;
    }

    this._moveCards(this._selectedCol, this._selectedRow, toCol);
    this._selectedCol = -1;
    this._selectedRow = -1;
  },

  _canMove(fromCol, fromRow, toCol) {
    if (fromCol === toCol) return false;
    const fromColumn = this._columns[fromCol];
    const toColumn   = this._columns[toCol];
    const fromCard   = fromColumn[fromRow];
    if (toColumn.length === 0) return true;
    const toCard = toColumn[toColumn.length - 1];
    // 必须花色相同 + 数字连续
    return toCard.suit === fromCard.suit && toCard.rank === fromCard.rank + 1;
  },

  _moveCards(fromCol, fromRow, toCol) {
    const fromColumn = this._columns[fromCol];
    const toColumn   = this._columns[toCol];
    const movedCards = fromColumn.splice(fromRow);
    movedCards.forEach(c => c._justMoved = true);
    toColumn.push(...movedCards);

    this._moves++;
    this._score = Math.max(0, this._score - 1);

    // 翻开源列顶部暗牌
    if (fromColumn.length > 0 && !fromColumn[fromColumn.length - 1].faceUp) {
      fromColumn[fromColumn.length - 1].faceUp = true;
    }

    // 检查收牌（循环，可能连续收多组）
    this._checkFoundationCascade(toCol);
    this._renderGame();

    // 清除移动标记
    setTimeout(() => {
      let needRender = false;
      for (const card of movedCards) {
        if (card._justMoved) {
          card._justMoved = false;
          needRender = true;
        }
      }
      if (needRender) this._renderGame();
    }, 400);

    // 判断输赢
    if (this._foundations >= 8) {
      setTimeout(() => this._onWin(), 300);
    } else if (!this._hasValidMoves() && this._stock.length === 0) {
      setTimeout(() => this._onLose(), 400);
    }
  },

  _checkFoundationCascade(col) {
    let changed = true;
    while (changed) {
      changed = false;
      const column = this._columns[col];
      if (column.length < 13) break;
      const start = column.length - 13;
      const suit  = column[start].suit;
      let valid = true;
      for (let i = 0; i < 13; i++) {
        if (column[start + i].suit !== suit || column[start + i].rank !== 13 - i) {
          valid = false;
          break;
        }
      }
      if (valid) {
        column.splice(start, 13);
        this._foundations++;
        this._score += FOUNDATION_BONUS;
        changed = true;
        if (column.length > 0 && !column[column.length - 1].faceUp) {
          column[column.length - 1].faceUp = true;
        }
      }
    }
  },

  // ===================== 发牌 =====================
  onDeal() {
    if (this._status !== 'playing') return;
    if (this._stock.length < 10) return;
    if (!this._columns.every(c => c.length > 0)) {
      wx.showToast({ title: '每列至少需要一张牌才能发牌', icon: 'none', duration: 1500 });
      return;
    }

    this._selectedCol = -1;
    this._selectedRow = -1;

    for (let col = 0; col < 10; col++) {
      const card = this._stock.pop();
      card.faceUp = true;
      card._isNew = true;
      this._columns[col].push(card);
    }
    this._renderGame();

    // 400ms 后清除新增标记
    setTimeout(() => {
      for (let col = 0; col < 10; col++) {
        const last = this._columns[col][this._columns[col].length - 1];
        if (last) last._isNew = false;
      }
      this._renderGame();
    }, 450);

    // 发牌后检查是否有可移动
    if (!this._hasValidMoves() && this._stock.length === 0) {
      setTimeout(() => this._onLose(), 500);
    }
  },

  // ===================== 输赢判断 =====================
  _hasValidMoves() {
    for (let fromCol = 0; fromCol < 10; fromCol++) {
      const col = this._columns[fromCol];
      for (let fromRow = 0; fromRow < col.length; fromRow++) {
        if (!col[fromRow].faceUp) continue;
        for (let toCol = 0; toCol < 10; toCol++) {
          if (fromCol === toCol) continue;
          if (this._canMove(fromCol, fromRow, toCol)) return true;
        }
      }
    }
    return false;
  },

  _onWin() {
    this._status = 'won';
    this._renderGame();
    this.setData({ showWin: true });
  },

  _onLose() {
    this._status = 'lost';
    this._renderGame();
    this.setData({ showLose: true });
  },

  // ===================== 操作按钮 =====================
  restartGame() {
    this.setData({ showWin: false, showLose: false });
    this.startGame(this.data.mode);
  },

  nextMode() {
    const idx = MODE_ORDER.indexOf(this.data.mode);
    if (idx < MODE_ORDER.length - 1) {
      const next = MODE_ORDER[idx + 1];
      this.setData({ mode: next, showWin: false, showLose: false });
      this.startGame(next);
    }
  },

  exitGame() {
    wx.navigateBack();
  },

  backToMenu() {
    this.setData({
      showModeSelect: true,
      showWin: false,
      showLose: false,
    });
  },

  closeMenu() {
    // 关闭菜单，回到游戏（不重置状态）
    this.setData({ showModeSelect: false });
  },

  noop() {},
});