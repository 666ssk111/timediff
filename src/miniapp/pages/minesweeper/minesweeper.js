// pages/minesweeper/minesweeper.js —— 扫雷（难度选择 + 经典玩法）
const api = require('../../utils/api.js');

const DIFFICULTY = {
  easy:   { rows: 9,  cols: 9,  mines: 10, label: '初级', desc: '9×9 · 10 雷',   icon: '😊' },
  medium: { rows: 16, cols: 16, mines: 40, label: '中级', desc: '16×16 · 40 雷', icon: '😐' },
  hard:   { rows: 16, cols: 30, mines: 99, label: '高级', desc: '16×30 · 99 雷', icon: '😰' },
};

function makeCell(r, c) {
  return { r, c, bomb: false, adjacent: 0, revealed: false, flagged: false };
}

Page({
  data: {
    phase: 'menu',       // menu | playing | win | lose
    difficulty: null,    // 当前难度 key
    grid: [],
    rows: 0, cols: 0,
    flags: 0,
    time: 0,
    mineCount: 0,
    // 菜单数据
    levels: [
      { key: 'easy',   ...DIFFICULTY.easy   },
      { key: 'medium', ...DIFFICULTY.medium },
      { key: 'hard',   ...DIFFICULTY.hard   },
    ],
  },

  /* ---------- 难度选择 ---------- */
  selectLevel(e) {
    const key = e.currentTarget.dataset.key;
    const cfg = DIFFICULTY[key];
    if (!cfg) return;
    this.stopTimer();
    // 初始化空棋盘
    const grid = [];
    for (let r = 0; r < cfg.rows; r++) {
      const row = [];
      for (let c = 0; c < cfg.cols; c++) row.push(makeCell(r, c));
      grid.push(row);
    }
    this._firstClick = true;
    this.setData({
      phase: 'playing',
      difficulty: key,
      grid,
      rows: cfg.rows,
      cols: cfg.cols,
      flags: cfg.mines,
      mineCount: cfg.mines,
      time: 0,
    });
  },

  backToMenu() {
    this.stopTimer();
    this.setData({ phase: 'menu', grid: [], time: 0 });
  },

  /* ---------- 计时器（修复跳变：用本地变量） ---------- */
  startTimer() {
    this.stopTimer();
    this._seconds = 0;
    this.setData({ time: 0 });
    this._timer = setInterval(() => {
      this._seconds += 1;
      this.setData({ time: this._seconds });
    }, 1000);
  },

  stopTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  onUnload() { this.stopTimer(); },

  /* ---------- 触摸操作 ---------- */
  onTap(e) {
    if (this.data.phase !== 'playing') return;
    const r = Number(e.currentTarget.dataset.r);
    const c = Number(e.currentTarget.dataset.c);
    const grid = this.data.grid;
    const cell = grid[r][c];
    if (cell.revealed || cell.flagged) return;

    // 首次点击 → 请求后端生成棋盘
    if (this._firstClick) {
      this._firstClick = false;
      this._loadBoard(r, c, () => this._reveal(r, c));
    } else {
      this._reveal(r, c);
    }
  },

  onLongPress(e) {
    if (this.data.phase !== 'playing') return;
    const r = Number(e.currentTarget.dataset.r);
    const c = Number(e.currentTarget.dataset.c);
    const grid = this.data.grid;
    const cell = grid[r][c];
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;
    const delta = cell.flagged ? -1 : 1;
    this.setData({ grid, flags: this.data.flags + delta });
  },

  /* ---------- 后端请求 ---------- */
  _loadBoard(firstR, firstC, cb) {
    const cfg = DIFFICULTY[this.data.difficulty];
    api.post('/minesweeper/new', {
      rows: cfg.rows, cols: cfg.cols, mines: cfg.mines,
      first_r: firstR, first_c: firstC,
    }).then(d => {
      const bombSet = new Set((d.bombs || []).map(b => b.r * cfg.cols + b.c));
      const grid = this.data.grid;
      for (let r = 0; r < cfg.rows; r++) {
        for (let c = 0; c < cfg.cols; c++) {
          grid[r][c].bomb = bombSet.has(r * cfg.cols + c);
        }
      }
      // 计算相邻雷数
      for (let r = 0; r < cfg.rows; r++) {
        for (let c = 0; c < cfg.cols; c++) {
          if (grid[r][c].bomb) continue;
          let n = 0;
          for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++)
              if (dr || dc) {
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < cfg.rows && nc >= 0 && nc < cfg.cols && grid[nr][nc].bomb) n++;
              }
          grid[r][c].adjacent = n;
        }
      }
      this.setData({ grid });
      this.startTimer();
      if (cb) cb();
    }).catch(err => {
      this._firstClick = true;
      wx.showToast({ title: (err && err.message) || '生成失败', icon: 'none' });
    });
  },

  /* ---------- 核心逻辑 ---------- */
  _reveal(r, c) {
    const grid = this.data.grid;
    const rows = this.data.rows, cols = this.data.cols;
    const cell = grid[r][c];
    if (cell.revealed || cell.flagged) return;

    if (cell.bomb) {
      this.stopTimer();
      // 揭开所有雷
      for (let i = 0; i < rows; i++)
        for (let j = 0; j < cols; j++)
          if (grid[i][j].bomb) grid[i][j].revealed = true;
      this.setData({ grid, phase: 'lose' });
      return;
    }

    // 洪泛展开
    const stack = [[r, c]];
    while (stack.length) {
      const [cr, cc] = stack.pop();
      if (grid[cr][cc].revealed || grid[cr][cc].flagged) continue;
      grid[cr][cc].revealed = true;
      if (grid[cr][cc].adjacent === 0) {
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++)
            if (dr || dc) {
              const nr = cr + dr, nc = cc + dc;
              if (nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
                  !grid[nr][nc].revealed && !grid[nr][nc].flagged && !grid[nr][nc].bomb) {
                stack.push([nr, nc]);
              }
            }
      }
    }
    this.setData({ grid });
    this._checkWin();
  },

  _checkWin() {
    const grid = this.data.grid;
    const rows = this.data.rows, cols = this.data.cols;
    let revealed = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (grid[r][c].revealed) revealed++;
    if (revealed + this.data.mineCount === rows * cols) {
      this.stopTimer();
      // 自动插旗
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          if (grid[r][c].bomb) grid[r][c].flagged = true;
      this.setData({ grid, phase: 'win', flags: 0 });
    }
  },
});