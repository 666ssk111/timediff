// pages/snake/snake.js —— 贪吃蛇小游戏（view 网格渲染 + 后端排行）
const api = require('../../utils/api.js');
const GRID = 20;   // 20x20 网格
const CELL = 35;   // 每格 35rpx，游戏区 700rpx

Page({
  data: {
    score: 0,
    best: 0,
    rank: null,
    status: 'ready',      // ready | playing | over
    snakeView: [],
    food: { left: '0rpx', top: '0rpx' },
    leaderboard: [],
    showRank: false       // 排行榜弹窗
  },

  onLoad() {
    this.loadLeaderboard();
  },

  onUnload() {
    this.stop();
  },

  reset() {
    // 初始蛇：三节，头朝右
    this.snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    this.dir = { x: 1, y: 0 };
    this.nextDir = { x: 1, y: 0 };
    this.score = 0;
    this.rank = null;
    this.placeFood();
    this.setData({ score: 0, rank: null, status: 'playing' });
    this.render();
  },

  start() {
    this.stop();
    this.reset();
    this.loop = setInterval(() => this.step(), 150);
  },

  stop() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  },

  placeFood() {
    while (true) {
      const f = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
      if (!this.snake.some(s => s.x === f.x && s.y === f.y)) {
        this.food = f;
        return;
      }
    }
  },

  setDir(dx, dy) {
    if (this.data.status !== 'playing') return;
    if (this.dir.x + dx === 0 && this.dir.y + dy === 0) return; // 禁止 180 度掉头
    this.nextDir = { x: dx, y: dy };
  },

  step() {
    this.dir = this.nextDir;
    const head = { x: this.snake[0].x + this.dir.x, y: this.snake[0].y + this.dir.y };
    // 撞墙
    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) return this.gameOver();
    // 撞身（尾节即将让位，排除尾节）
    if (this.snake.slice(0, -1).some(s => s.x === head.x && s.y === head.y)) return this.gameOver();

    this.snake.unshift(head);
    if (head.x === this.food.x && head.y === this.food.y) {
      this.score += 10;
      this.setData({ score: this.score });
      this.placeFood();
    } else {
      this.snake.pop();
    }
    this.render();
  },

  // 将蛇/食物坐标转换为 view 样式
  render() {
    const snakeView = this.snake.map((s, i) => ({
      left: (s.x * CELL) + 'rpx',
      top: (s.y * CELL) + 'rpx',
      isHead: i === 0
    }));
    const food = {
      left: (this.food.x * CELL) + 'rpx',
      top: (this.food.y * CELL) + 'rpx'
    };
    this.setData({ snakeView, food });
  },

  gameOver() {
    this.stop();
    this.setData({ status: 'over' });
    // 更新本地最高分
    const best = Math.max(this.data.best, this.score);
    this.setData({ best });
    // 提交分数到后端
    api.post('/snake/score', { score: this.score })
      .then(d => {
        this.setData({ rank: d.rank });
        this.loadLeaderboard();
      })
      .catch(() => {});
    wx.showToast({ title: `游戏结束，得分 ${this.score}`, icon: 'none' });
  },

  loadLeaderboard() {
    api.get('/snake/leaderboard')
      .then(d => this.setData({ leaderboard: d.items || [] }))
      .catch(() => {});
  },

  showRank() {
    this.loadLeaderboard();
    this.setData({ showRank: true });
  },

  hideRank() {
    this.setData({ showRank: false });
  },

  noop() {},

  onUp() { this.setDir(0, -1); },
  onDown() { this.setDir(0, 1); },
  onLeft() { this.setDir(-1, 0); },
  onRight() { this.setDir(1, 0); }
});