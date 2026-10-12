// pages/starpop/starpop.js —— 消灭星星（10关 · 自由选择关卡）
const STAR_COLORS = ['#FF6B6B', '#FFA94D', '#FFD43B', '#51CF66', '#4DABF7', '#CC5DE8'];
const STAR_LIGHT  = ['#FF9999', '#FFC480', '#FFE680', '#80E8A0', '#80C8FF', '#E080FF'];

const LEVELS = [
  { id: 1,  rows: 6,  cols: 6,  colors: 3, time: 50, name: '初识星空' },
  { id: 2,  rows: 6,  cols: 6,  colors: 4, time: 48, name: '渐入佳境' },
  { id: 3,  rows: 7,  cols: 7,  colors: 4, time: 46, name: '小试牛刀' },
  { id: 4,  rows: 7,  cols: 7,  colors: 5, time: 44, name: '星罗棋布' },
  { id: 5,  rows: 8,  cols: 8,  colors: 4, time: 42, name: '璀璨星河' },
  { id: 6,  rows: 8,  cols: 8,  colors: 5, time: 40, name: '流光溢彩' },
  { id: 7,  rows: 8,  cols: 8,  colors: 6, time: 38, name: '繁星点点' },
  { id: 8,  rows: 9,  cols: 9,  colors: 5, time: 36, name: '星海无涯' },
  { id: 9,  rows: 9,  cols: 9,  colors: 6, time: 34, name: '斗转星移' },
  { id: 10, rows: 10, cols: 10, colors: 6, time: 32, name: '万物归星' },
];

Page({
  data: {
    level: 1, totalLevels: 10, levelName: '第 1 关 · 初识星空',
    score: 0, totalScore: 0,
    timeLeft: 0, timePercent: 100,
    status: 'playing',
    comboText: '', comboShow: false,
    starsLeft: 0,
    showLevelWin: false, isLastLevel: false, levelWinScore: 0,
    showFail: false, failReason: '',
    canvasPx: 300,
    canvasReady: false,
    showLevelSelect: false,
    levels: LEVELS,
    unlockedUpTo: 1,        // 最高已解锁关卡（第 1 关默认解锁）
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    const rpxRate = sys.windowWidth / 750;
    const sideMargin = Math.round(32 * rpxRate);
    const canvasPx = sys.windowWidth - sideMargin * 2;
    
    // 读取已解锁进度
    const saved = wx.getStorageSync('starpop_unlocked') || 1;
    
    this.setData({ canvasPx, unlockedUpTo: saved });
    this._canvasW = canvasPx;
    this._canvasH = canvasPx;
    this._grid = [];
    this._selected = [];
    this._cellSize = 0;
    this._animating = false;
    this._timerId = null;
    this._totalScore = 0;
  },

  onReady() {
    setTimeout(() => {
      this._initCanvas(() => {
        this.startLevel(1);
      });
    }, 300);
  },

  _initCanvas(callback) {
    const query = wx.createSelectorQuery().in(this);
    query.select('#starCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) {
        console.warn('[starpop] canvas node not ready, retrying...');
        setTimeout(() => this._initCanvas(callback), 500);
        return;
      }
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getSystemInfoSync().pixelRatio || 2;
      canvas.width = this._canvasW * dpr;
      canvas.height = this._canvasH * dpr;
      ctx.scale(dpr, dpr);
      this._ctx = ctx;
      this.setData({ canvasReady: true });
      if (callback) callback();
    });
  },

  // ---------- 关卡启动 ----------
  startLevel(lv) {
    this._stopTimer();
    this._closeAllOverlays();
    this._ctx = null; // 旧上下文已失效，待重新初始化
    const cfg = LEVELS[lv - 1];
    this._rows = cfg.rows;
    this._cols = cfg.cols;
    this._numColors = cfg.colors;
    this._timeTotal = cfg.time;
    this._initGrid();
    this._selected = [];
    this._animating = false;

    const cs = Math.floor(Math.min(this._canvasW, this._canvasH) / Math.max(this._cols, this._rows));
    this._cellSize = cs;
    this._offsetX = Math.floor((this._canvasW - cs * this._cols) / 2);
    this._offsetY = Math.floor((this._canvasH - cs * this._rows) / 2);

    this.setData({
      level: lv, levelName: `第 ${lv} 关 · ${cfg.name}`,
      score: 0, timeLeft: cfg.time, timePercent: 100,
      status: 'playing', comboText: '', comboShow: false,
      starsLeft: this._countStars(),
      isLastLevel: lv >= LEVELS.length,
    }, () => {
      // setData 回调：DOM 已更新，canvas 已重建，重新获取上下文
      this._initCanvas(() => {
        this.draw();
        this._startTimer();
      });
    });
  },

  _closeAllOverlays() {
    this.setData({ showLevelWin: false, showFail: false, showLevelSelect: false });
  },

  _initGrid() {
    this._grid = [];
    for (let r = 0; r < this._rows; r++) {
      this._grid[r] = [];
      for (let c = 0; c < this._cols; c++) {
        this._grid[r][c] = Math.floor(Math.random() * this._numColors) + 1;
      }
    }
  },

  _countStars() {
    let c = 0;
    for (let r = 0; r < this._rows; r++)
      for (let cc = 0; cc < this._cols; cc++)
        if (this._grid[r][cc] !== 0) c++;
    return c;
  },

  _startTimer() {
    this._stopTimer();
    this._timerId = setInterval(() => {
      let t = this.data.timeLeft - 1;
      if (t <= 0) { t = 0; this._stopTimer(); if (this.data.status === 'playing') this._onTimeout(); }
      this.setData({ timeLeft: t, timePercent: this._timeTotal > 0 ? Math.round((t / this._timeTotal) * 100) : 0 });
    }, 1000);
  },

  _stopTimer() { if (this._timerId) { clearInterval(this._timerId); this._timerId = null; } },
  _onTimeout() {
    this._totalScore += this.data.score;
    this.setData({ status: 'timeout', totalScore: this._totalScore, showFail: true, failReason: '⏰ 时间到！' });
  },

  // ========== 绘制 ==========
  draw() {
    const ctx = this._ctx;
    if (!ctx) return;
    const cs = this._cellSize, ox = this._offsetX, oy = this._offsetY;
    const rows = this._rows, cols = this._cols;
    if (!cs || cs <= 0) return;

    ctx.clearRect(0, 0, this._canvasW, this._canvasH);

    const pad = 4;
    ctx.fillStyle = '#1a1a2e';
    this._roundRect(ctx, ox - pad, oy - pad, cs * cols + pad * 2, cs * rows + pad * 2, 12);
    ctx.fill();

    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
        ctx.fillRect(ox + c * cs + 1, oy + r * cs + 1, cs - 2, cs - 2);
      }

    const selSet = new Set(this._selected.map(s => `${s.r},${s.c}`));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ci = this._grid[r][c];
        if (ci === 0) continue;
        const cx = ox + c * cs + cs / 2, cy = oy + r * cs + cs / 2;
        const size = cs * 0.38;
        const isSel = selSet.has(`${r},${c}`);
        const color = STAR_COLORS[ci - 1], light = STAR_LIGHT[ci - 1];

        ctx.save();
        ctx.translate(cx, cy);
        if (isSel) ctx.scale(1.2, 1.2);

        const glow = ctx.createRadialGradient(0, 0, size * 0.2, 0, 0, size * 1.6);
        glow.addColorStop(0, color + '66'); glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow; ctx.beginPath();
        ctx.arc(0, 0, size * 1.6, 0, Math.PI * 2); ctx.fill();

        this._drawShape(ctx, ci - 1, size, color, light);

        if (isSel) {
          ctx.strokeStyle = '#FFF'; ctx.lineWidth = 2.5;
          ctx.shadowColor = '#FFF'; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.arc(0, 0, size * 1.25, 0, Math.PI * 2); ctx.stroke();
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      }
    }
  },

  _drawShape(ctx, idx, size, color, light) {
    const methods = [this._star5, this._sparkle, this._star6, this._diamond, this._heart, this._burst];
    (methods[idx] || methods[0]).call(this, ctx, size, color, light);
  },

  _star5(ctx, s, c, l) {
    const R = s, r = s * 0.42; let rot = -Math.PI / 2;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const rr = i % 2 === 0 ? R : r; ctx.lineTo(Math.cos(rot) * rr, Math.sin(rot) * rr); rot += Math.PI / 5; }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -R, 0, R); g.addColorStop(0, l); g.addColorStop(1, c);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
    this._shine(ctx, s);
  },
  _sparkle(ctx, s, c, l) {
    ctx.beginPath();
    ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * 0.3, -s * 0.15, s * 0.85, 0);
    ctx.quadraticCurveTo(s * 0.3, s * 0.15, 0, s);
    ctx.quadraticCurveTo(-s * 0.3, s * 0.15, -s * 0.85, 0);
    ctx.quadraticCurveTo(-s * 0.3, -s * 0.15, 0, -s);
    ctx.closePath();
    const g = ctx.createRadialGradient(0, 0, s * 0.1, 0, 0, s); g.addColorStop(0, l); g.addColorStop(1, c);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 0.8; ctx.stroke();
    this._shine(ctx, s);
  },
  _star6(ctx, s, c, l) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      if (i === 0) ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s);
      else ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
      const ia = a + Math.PI / 6; ctx.lineTo(Math.cos(ia) * s * 0.45, Math.sin(ia) * s * 0.45);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -s, 0, s); g.addColorStop(0, l); g.addColorStop(1, c);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
    this._shine(ctx, s);
  },
  _diamond(ctx, s, c, l) {
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.7, 0); ctx.closePath();
    const g = ctx.createLinearGradient(-s * 0.35, -s * 0.5, s * 0.35, s * 0.5);
    g.addColorStop(0, l); g.addColorStop(0.5, c); g.addColorStop(1, this._darken(c, 0.35));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(0, -s * 0.6); ctx.lineTo(0, s * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 0.4, 0); ctx.lineTo(s * 0.4, 0); ctx.stroke();
    this._shine(ctx, s);
  },
  _heart(ctx, s, c, l) {
    const sz = s * 0.82;
    ctx.beginPath(); ctx.moveTo(0, sz * 0.7);
    ctx.bezierCurveTo(-sz, -sz * 0.3, -sz * 0.5, -sz, 0, -sz * 0.35);
    ctx.bezierCurveTo(sz * 0.5, -sz, sz, -sz * 0.3, 0, sz * 0.7);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -sz, 0, sz); g.addColorStop(0, l); g.addColorStop(1, c);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
    this._shine(ctx, s);
  },
  _burst(ctx, s, c, l) {
    ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.45); g.addColorStop(0, l); g.addColorStop(1, c);
    ctx.fillStyle = g; ctx.fill();
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i - Math.PI / 2;
      const bx = Math.cos(a) * s * 0.5, by = Math.sin(a) * s * 0.5;
      const ex = Math.cos(a) * s, ey = Math.sin(a) * s;
      const pa = a + Math.PI / 2; const pw = s * 0.12;
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(pa) * pw, by + Math.sin(pa) * pw);
      ctx.lineTo(ex, ey);
      ctx.lineTo(bx - Math.cos(pa) * pw, by - Math.sin(pa) * pw);
      ctx.closePath();
      ctx.fillStyle = c; ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2); ctx.stroke();
    this._shine(ctx, s);
  },

  _shine(ctx, size) {
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.arc(-size * 0.18, -size * 0.28, size * 0.22, 0, Math.PI * 2); ctx.fill();
  },
  _darken(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${Math.max(0, (n >> 16) - Math.round(255 * a))},${Math.max(0, ((n >> 8) & 0xff) - Math.round(255 * a))},${Math.max(0, (n & 0xff) - Math.round(255 * a))})`;
  },
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  },

  // ========== 触摸 ==========
  onTouchStart(e) {
    if (this._animating || this.data.status !== 'playing') return;
    const rc = this._touchToRC(e.touches[0]);
    if (!rc) { this._selected = []; this.draw(); return; }
    if (this._grid[rc.r][rc.c] === 0) { this._selected = []; this.draw(); return; }
    const conn = this._findConnected(rc.r, rc.c);
    this._selected = conn.length >= 2 ? conn : [];
    this.draw();
  },
  onTouchEnd() {
    if (this._animating || this.data.status !== 'playing') return;
    if (this._selected.length < 2) return;
    this._eliminate();
  },

  _touchToRC(touch) {
    if (!this._cellSize) return null;
    const c = Math.floor((touch.x - this._offsetX) / this._cellSize);
    const r = Math.floor((touch.y - this._offsetY) / this._cellSize);
    if (r < 0 || r >= this._rows || c < 0 || c >= this._cols) return null;
    return { r, c };
  },
  _findConnected(r, c) {
    const color = this._grid[r][c];
    if (color === 0) return [];
    const visited = new Set(), queue = [{ r, c }], result = [];
    visited.add(`${r},${c}`);
    while (queue.length) {
      const cur = queue.shift(); result.push(cur);
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nr = cur.r + dr, nc = cur.c + dc, k = `${nr},${nc}`;
        if (nr >= 0 && nr < this._rows && nc >= 0 && nc < this._cols &&
            !visited.has(k) && this._grid[nr][nc] === color) {
          visited.add(k); queue.push({ r: nr, c: nc });
        }
      }
    }
    return result;
  },

  // ========== 消除 ==========
  _eliminate() {
    const n = this._selected.length;
    const pts = 10 * n * (n - 1);
    this._animating = true;
    this.setData({ comboText: '+' + pts, comboShow: true });
    setTimeout(() => this.setData({ comboShow: false }), 900);

    for (const s of this._selected) this._grid[s.r][s.c] = 0;
    const ns = this.data.score + pts;
    this.setData({ score: ns, starsLeft: this._countStars() });
    this._selected = [];

    this._fall(() => {
      this._compressLeft(() => {
        this._animating = false; this.draw();
        const left = this._countStars();
        this.setData({ starsLeft: left });
        if (left === 0) this._onLevelWin(ns);
        else if (this._checkNoMoves()) this._onLose(ns);
      });
    });
  },

  _fall(cb) {
    let moved = false;
    for (let c = 0; c < this._cols; c++) {
      let wr = this._rows - 1;
      for (let r = this._rows - 1; r >= 0; r--) {
        if (this._grid[r][c] !== 0) {
          if (wr !== r) { this._grid[wr][c] = this._grid[r][c]; this._grid[r][c] = 0; moved = true; }
          wr--;
        }
      }
    }
    this.draw(); setTimeout(cb, moved ? 150 : 50);
  },
  _compressLeft(cb) {
    let moved = false, wc = 0;
    for (let c = 0; c < this._cols; c++) {
      let has = false;
      for (let r = 0; r < this._rows; r++) { if (this._grid[r][c] !== 0) { has = true; break; } }
      if (has) {
        if (wc !== c) {
          for (let r = 0; r < this._rows; r++) { this._grid[r][wc] = this._grid[r][c]; this._grid[r][c] = 0; }
          moved = true;
        }
        wc++;
      }
    }
    this.draw(); setTimeout(cb, moved ? 150 : 50);
  },
  _checkNoMoves() {
    for (let r = 0; r < this._rows; r++)
      for (let c = 0; c < this._cols; c++)
        if (this._grid[r][c] !== 0 && this._findConnected(r, c).length >= 2) return false;
    return true;
  },

  _onLevelWin(s) {
    this._stopTimer(); this._totalScore += s;
    // 解锁下一关
    const nextLevel = this.data.level + 1;
    if (nextLevel <= 10 && nextLevel > this.data.unlockedUpTo) {
      wx.setStorageSync('starpop_unlocked', nextLevel);
      this.setData({ unlockedUpTo: nextLevel });
    }
    this.setData({ status: 'win', totalScore: this._totalScore, showLevelWin: true, levelWinScore: s });
  },
  _onLose(s) {
    this._stopTimer(); this._totalScore += s;
    this.setData({ status: 'lose', totalScore: this._totalScore, showFail: true, failReason: '没有可消除的星星了' });
  },

  // ========== 关卡操作 ==========
  nextLevel() {
    const n = this.data.level + 1;
    if (n > 10) return;
    this.startLevel(n);
  },
  restartLevel() { this.startLevel(this.data.level); },

  // 关卡选择
  showLevelPick() { this.setData({ showLevelSelect: true }); },
  closeLevelSelect() { this.setData({ showLevelSelect: false }); },

  goToLevel(e) {
    const lv = Number(e.currentTarget.dataset.lv);
    if (lv > this.data.unlockedUpTo) {
      wx.showToast({ title: '请先通过上一关', icon: 'none', duration: 1500 });
      return;
    }
    this.setData({ showLevelSelect: false, showLevelWin: false, showFail: false });
    this.startLevel(lv);
  },

  noop() {},

  onUnload() { this._stopTimer(); },
  onHide() { this._stopTimer(); },
});