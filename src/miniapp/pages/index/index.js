// pages/index/index.js —— 工具箱首页（分区宫格导航，可下滑）
Page({
  data: {
    statusBarHeight: 20,
    // 实用工具
    practicalTools: [
      { name: '日期计算', url: '/pages/datecalc/datecalc', icon: '📆', bg: '#EAF2FE' },
      { name: '房贷计算', url: '/pages/mortgage/mortgage', icon: '🏠', bg: '#EDEFFE' },
      { name: '个税计算', url: '/pages/tax/tax', icon: '🧾', bg: '#E6F8F0' },
      { name: '单位换算', url: '/pages/unit/unit', icon: '📏', bg: '#F1ECFE' },
      { name: 'OCR 与翻译', url: '/pages/ocr/ocr', icon: '📷', bg: '#FEF3E3' },
      { name: '历史上的今天', url: '/pages/history/history', icon: '📅', bg: '#FDEAEA' },
      { name: '记账本', url: '/pages/account/account', icon: '💰', bg: '#E4F8F5' },
      { name: '进制转换', url: '/pages/base/base', icon: '🔢', bg: '#EDF0F4' },
      { name: '身份证解析', url: '/pages/idcard/idcard', icon: '🪪', bg: '#FDE8F2' },
      { name: '待办清单', url: '/pages/todo/todo', icon: '✅', bg: '#F3FAE2' },
      { name: '喝水打卡', url: '/pages/habit/habit', icon: '💧', bg: '#E4F4FD' }
    ],
    // 趣味工具与小游戏
    funTools: [
      { name: '壁纸头像', url: '/pages/avatar/avatar', icon: '🎨', bg: 'linear-gradient(135deg,#8B5CF6,#A78BFA)', desc: '渐变壁纸与励志文案制作' },
      { name: '表情包', url: '/pages/meme/meme', icon: '😂', bg: 'linear-gradient(135deg,#F59E0B,#FBBF24)', desc: '图片配字，一键生成表情包' },
      { name: '星座运势', url: '/pages/horoscope/horoscope', icon: '✨', bg: 'linear-gradient(135deg,#6366F1,#8B5CF6)', desc: '每日运势与幸运指南' },
      { name: '随机决定', url: '/pages/random/random', icon: '🎲', bg: 'linear-gradient(135deg,#EC4899,#F472B6)', desc: '抛硬币·转盘·抽签' },
      { name: '扫雷', url: '/pages/minesweeper/minesweeper', icon: '💣', bg: 'linear-gradient(135deg,#334155,#64748B)', desc: '经典扫雷小游戏' },
      { name: '贪吃蛇', url: '/pages/snake/snake', icon: '🐍', bg: 'linear-gradient(135deg,#10B981,#34D399)', desc: '经典贪吃蛇小游戏' },
      { name: '消灭星星', url: '/pages/starpop/starpop', icon: '⭐', bg: 'linear-gradient(135deg,#7C3AED,#A78BFA)', desc: '点击消除同色星星' },
      { name: '2048', url: '/pages/game2048/game2048', icon: '🔢', bg: 'linear-gradient(135deg,#F59E0B,#FBBF24)', desc: '滑动合并数字挑战' },
      { name: '蜘蛛纸牌', url: '/pages/spider/spider', icon: '🕷️', bg: 'linear-gradient(135deg,#065F46,#10B981)', desc: '经典蜘蛛纸牌接龙' },
      { name: '数独', url: '/pages/sudoku/sudoku', icon: '🧩', bg: 'linear-gradient(135deg,#1E293B,#3B82F6)', desc: '经典数独推理游戏' }
    ]
  },

  onLoad() {
    let statusBarHeight = 20;
    try {
      const info = wx.getSystemInfoSync();
      statusBarHeight = info.statusBarHeight || 20;
    } catch (e) {
      // 获取失败时使用默认值
    }
    this.setData({ statusBarHeight });
  },

  goTool(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.navigateTo({ url });
  }
});
