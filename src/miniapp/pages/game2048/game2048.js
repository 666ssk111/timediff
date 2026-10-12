// pages/game2048/game2048.js —— 2048 经典数字游戏
const SIZE = 4;

// 每个数字对应的背景色和文字色
const TILE_STYLES = {
  0:    { bg: '#CDC1B4', color: 'transparent', fontSize: 1 },
  2:    { bg: '#EEE4DA', color: '#776E65', fontSize: 1 },
  4:    { bg: '#EDE0C8', color: '#776E65', fontSize: 1 },
  8:    { bg: '#F2B179', color: '#F9F6F2', fontSize: 1 },
  16:   { bg: '#F59563', color: '#F9F6F2', fontSize: 1 },
  32:   { bg: '#F67C5F', color: '#F9F6F2', fontSize: 1 },
  64:   { bg: '#F65E3B', color: '#F9F6F2', fontSize: 1 },
  128:  { bg: '#EDCF72', color: '#F9F6F2', fontSize: 0.85 },
  256:  { bg: '#EDCC61', color: '#F9F6F2', fontSize: 0.85 },
  512:  { bg: '#EDC850', color: '#F9F6F2', fontSize: 0.85 },
  1024: { bg: '#EDC53F', color: '#F9F6F2', fontSize: 0.65 },
  2048: { bg: '#EDC22E', color: '#F9F6F2', fontSize: 0.65 },
  4096: { bg: '#3C3A32', color: '#F9F6F2', fontSize: 0.55 },
  8192: { bg: '#3C3A32', color: '#F9F6F2', fontSize: 0.55 },
};

function getTileStyle(value) {
  return TILE_STYLES[value] || { bg: '#3C3A32', color: '#F9F6F2', fontSize: 0.5 };
}

Page({
  data: {
    board: [],       // [{value, row, col, isNew, isMerged}]
    score: 0,
    bestScore: 0,
    status: 'playing', // playing | win | over
    statusText: '',
    showResult: false,
    resultTitle: '',
    resultSub: '',
    resultScore: 0,
    resultBest: 0,
    resultIsWin: false,
  },

  onLoad() {
    this._bestScore = wx.getStorageSync('game2048_best') || 0;
    this.setData({ bestScore: this._bestScore });
    this.initGame();
  },

  initGame() {
    const board = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        board.push({ value: 0, row: r, col: c, isNew: false, isMerged: false });
      }
    }
    this.setData({ board, score: 0, status: 'playing', statusText: '', showResult: false });
    this._addRandom(board);
    this._addRandom(board);
    this._updateBoard(board);
  },

  _updateBoard(board) {
    const styled = board.map(t => {
      const s = getTileStyle(t.value);
      return { ...t, bg: s.bg, color: s.color, fontSize: s.fontSize };
    });
    this.setData({ board: styled });
  },

  _addRandom(board) {
    const empty = board.filter(t => t.value === 0);
    if (empty.length === 0) return null;
    const tile = empty[Math.floor(Math.random() * empty.length)];
    tile.value = Math.random() < 0.9 ? 2 : 4;
    tile.isNew = true;
    return tile;
  },

  _clearFlags(board) {
    board.forEach(t => { t.isNew = false; t.isMerged = false; });
  },

  // ---------- 触摸 ----------
  onTouchStart(e) {
    if (this.data.status !== 'playing') return;
    this._startX = e.touches[0].clientX;
    this._startY = e.touches[0].clientY;
  },

  onTouchEnd(e) {
    if (this.data.status !== 'playing') return;
    if (this._startX === undefined) return;
    const dx = e.changedTouches[0].clientX - this._startX;
    const dy = e.changedTouches[0].clientY - this._startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (Math.max(absDx, absDy) < 30) return;

    let dir;
    if (absDx > absDy) {
      dir = dx > 0 ? 'right' : 'left';
    } else {
      dir = dy > 0 ? 'down' : 'up';
    }
    this._move(dir);
    this._startX = undefined;
    this._startY = undefined;
  },

  // ---------- 移动逻辑 ----------
  _move(dir) {
    if (this.data.status !== 'playing') return;
    const board = this.data.board.map(t => ({ ...t, isNew: false, isMerged: false }));
    let moved = false;
    let scoreAdd = 0;

    const vectors = this._getTraversal(dir);

    for (const vec of vectors) {
      const cells = vec.map(idx => board[idx]);
      const { newCells, gained } = this._mergeLine(cells);
      vec.forEach((idx, i) => {
        if (board[idx].value !== newCells[i].value) moved = true;
        board[idx] = { ...board[idx], ...newCells[i] };
      });
      scoreAdd += gained;
    }

    if (!moved) return;

    const newScore = this.data.score + scoreAdd;
    this._addRandom(board);
    this._updateBoard(board);
    this.setData({ score: newScore });

    // 更新最高分
    this._updateBest(newScore);

    // 检查状态
    if (board.some(t => t.value === 2048)) {
      this._onWin(newScore);
    } else if (this._isGameOver(board)) {
      this._onGameOver(newScore);
    }
  },

  _updateBest(score) {
    if (score > this._bestScore) {
      this._bestScore = score;
      wx.setStorageSync('game2048_best', score);
      this.setData({ bestScore: score });
    }
  },

  _getTraversal(dir) {
    const vectors = [];
    if (dir === 'left') {
      for (let r = 0; r < SIZE; r++) {
        const vec = [];
        for (let c = 0; c < SIZE; c++) vec.push(r * SIZE + c);
        vectors.push(vec);
      }
    } else if (dir === 'right') {
      for (let r = 0; r < SIZE; r++) {
        const vec = [];
        for (let c = SIZE - 1; c >= 0; c--) vec.push(r * SIZE + c);
        vectors.push(vec);
      }
    } else if (dir === 'up') {
      for (let c = 0; c < SIZE; c++) {
        const vec = [];
        for (let r = 0; r < SIZE; r++) vec.push(r * SIZE + c);
        vectors.push(vec);
      }
    } else if (dir === 'down') {
      for (let c = 0; c < SIZE; c++) {
        const vec = [];
        for (let r = SIZE - 1; r >= 0; r--) vec.push(r * SIZE + c);
        vectors.push(vec);
      }
    }
    return vectors;
  },

  _mergeLine(cells) {
    const newCells = cells.map(c => ({ value: c.value, isNew: false, isMerged: false }));
    let gained = 0;

    // 压缩非零
    let pos = 0;
    const nonZero = newCells.filter(c => c.value !== 0);
    for (let i = 0; i < nonZero.length; i++) {
      newCells[pos].value = nonZero[i].value;
      newCells[pos].isNew = nonZero[i].isNew;
      newCells[pos].isMerged = false;
      pos++;
    }
    for (let i = pos; i < newCells.length; i++) {
      newCells[i].value = 0;
      newCells[i].isNew = false;
      newCells[i].isMerged = false;
    }

    // 合并相邻相同
    for (let i = 0; i < newCells.length - 1; i++) {
      if (newCells[i].value !== 0 && newCells[i].value === newCells[i + 1].value) {
        newCells[i].value *= 2;
        newCells[i].isMerged = true;
        gained += newCells[i].value;
        newCells[i + 1].value = 0;
        newCells[i + 1].isNew = false;
      }
    }

    // 再次压缩
    pos = 0;
    const merged = newCells.filter(c => c.value !== 0);
    for (let i = 0; i < merged.length; i++) {
      newCells[pos].value = merged[i].value;
      newCells[pos].isNew = merged[i].isNew;
      newCells[pos].isMerged = merged[i].isMerged;
      pos++;
    }
    for (let i = pos; i < newCells.length; i++) {
      newCells[i].value = 0;
      newCells[i].isNew = false;
      newCells[i].isMerged = false;
    }

    return { newCells, gained };
  },

  // 游戏失败：16格全满且所有相邻格子数字都不相等
  _isGameOver(board) {
    if (board.some(t => t.value === 0)) return false;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = board[r * SIZE + c].value;
        if (c < SIZE - 1 && board[r * SIZE + c + 1].value === v) return false;
        if (r < SIZE - 1 && board[(r + 1) * SIZE + c].value === v) return false;
      }
    }
    return true;
  },

  _onWin(finalScore) {
    this._updateBest(finalScore);
    this.setData({
      status: 'win',
      showResult: true,
      resultTitle: '恭喜通关！',
      resultSub: '你成功合成出了 2048',
      resultScore: finalScore,
      resultBest: this._bestScore,
      resultIsWin: true,
    });
  },

  _onGameOver(finalScore) {
    this.setData({
      status: 'over',
      showResult: true,
      resultTitle: '游戏结束',
      resultSub: '棋盘已满，无法继续移动',
      resultScore: finalScore,
      resultBest: this._bestScore,
      resultIsWin: false,
    });
  },

  // ---------- 操作 ----------
  restart() {
    this.initGame();
  },

  continueAfterWin() {
    this.setData({ status: 'playing', showResult: false, statusText: '' });
  },

  noop() {},
});