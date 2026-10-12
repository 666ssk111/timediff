// pages/todo/todo.js —— 待办事项清单（本地存储 + 定时提醒）
const STORAGE_KEY = 'todo_items';

// 提醒间隔（毫秒）
const REMINDER_INTERVALS = {
  2: 3600000,    // 高：1 小时
  1: 10800000,   // 中：3 小时
  0: 18000000,   // 低：5 小时
};

const REMINDER_LABELS = {
  2: '每 1 小时',
  1: '每 3 小时',
  0: '每 5 小时',
};

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Page({
  data: {
    input: '',
    priority: 1,
    items: [],
    displayItems: [],
    filter: 'all',
    stats: { total: 0, active: 0, done: 0 },
    adding: false,
    remindEnabled: true,   // 全局提醒开关
    showRemindModal: false,
    remindTitle: '',
    remindPriority: '',
  },

  onLoad() {
    this._checkTimer = null;
    this._remindingIds = new Set(); // 已在弹窗中的提醒，防止重复弹
    this.load();
    this._startReminderLoop();
  },

  onShow() {
    this._startReminderLoop();
  },

  onHide() {
    this._stopReminderLoop();
  },

  onUnload() {
    this._stopReminderLoop();
  },

  // ===================== 提醒循环 =====================
  _startReminderLoop() {
    this._stopReminderLoop();
    this._checkReminders();
    // 每 30 秒检查一次
    this._checkTimer = setInterval(() => {
      this._checkReminders();
    }, 30000);
  },

  _stopReminderLoop() {
    if (this._checkTimer) {
      clearInterval(this._checkTimer);
      this._checkTimer = null;
    }
  },

  _checkReminders() {
    const items = wx.getStorageSync(STORAGE_KEY) || [];
    const now = Date.now();
    let hasDue = false;

    for (const item of items) {
      if (item.done) continue;
      if (!item.reminder) continue;
      if (this._remindingIds.has(item.id)) continue;

      const interval = REMINDER_INTERVALS[item.priority] || REMINDER_INTERVALS[1];
      const lastReminded = item.lastRemindedAt || item._ts;
      if (now - lastReminded >= interval) {
        hasDue = true;
        this._remindingIds.add(item.id);
        this._showReminder(item);
      }
    }

    // 如果没有到期提醒，无需额外操作
    if (!hasDue && this._remindingIds.size === 0) {
      // 清理所有标记
    }
  },

  _showReminder(item) {
    const pLabel = item.priority === 2 ? '高' : item.priority === 1 ? '中' : '低';
    this.setData({
      showRemindModal: true,
      remindTitle: item.title,
      remindPriority: `${pLabel}优先级 · ${REMINDER_LABELS[item.priority]}提醒`,
      _remindItemId: item.id,
    });
  },

  closeRemindModal() {
    const id = this.data._remindItemId;
    this.setData({ showRemindModal: false });
    if (id) {
      // 更新提醒时间
      const items = wx.getStorageSync(STORAGE_KEY) || [];
      const idx = items.findIndex(i => i.id === id);
      if (idx !== -1) {
        items[idx].lastRemindedAt = Date.now();
        wx.setStorageSync(STORAGE_KEY, items);
      }
      this._remindingIds.delete(id);
      this._render(items);
    }
  },

  // ===================== 订阅消息 =====================
  requestSubscribe() {
    wx.requestSubscribeMessage({
      tmplIds: [], // 需要在小程序后台配置模板 ID 后填入
      success: () => {
        wx.showToast({ title: '已开启消息推送', icon: 'success' });
      },
      fail: () => {
        wx.showToast({ title: '订阅失败，提醒仍会在应用内弹出', icon: 'none', duration: 2000 });
      }
    });
  },

  // ===================== 输入 =====================
  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  setPriority(e) {
    this.setData({ priority: Number(e.currentTarget.dataset.priority) });
  },

  add() {
    if (this.data.adding) return;
    const title = (this.data.input || '').trim();
    if (!title) {
      wx.showToast({ title: '请输入待办内容', icon: 'none' });
      return;
    }

    this.setData({ adding: true });

    const items = wx.getStorageSync(STORAGE_KEY) || [];
    const now = Date.now();
    items.push({
      id: genId(),
      title,
      priority: this.data.priority,
      done: false,
      reminder: true,          // 默认开启提醒
      lastRemindedAt: now,     // 创建时间作为首次提醒起点
      created_at: formatDate(now),
      _ts: now,
    });

    wx.setStorageSync(STORAGE_KEY, items);
    this.setData({ input: '', adding: false });
    this._render(items);
  },

  // ===================== 操作 =====================
  toggle(e) {
    const id = e.currentTarget.dataset.id;
    const items = wx.getStorageSync(STORAGE_KEY) || [];
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return;
    items[idx].done = !items[idx].done;
    wx.setStorageSync(STORAGE_KEY, items);
    this._render(items);
  },

  toggleReminder(e) {
    const id = e.currentTarget.dataset.id;
    const items = wx.getStorageSync(STORAGE_KEY) || [];
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return;
    items[idx].reminder = !items[idx].reminder;
    wx.setStorageSync(STORAGE_KEY, items);
    this._render(items);
  },

  edit(e) {
    const id = e.currentTarget.dataset.id;
    const items = wx.getStorageSync(STORAGE_KEY) || [];
    const item = items.find(i => i.id === id);
    if (!item) return;

    wx.showModal({
      title: '编辑待办',
      editable: true,
      placeholderText: '请输入新的内容',
      content: item.title,
      success: (res) => {
        if (res.confirm && res.content && res.content.trim()) {
          const fresh = wx.getStorageSync(STORAGE_KEY) || [];
          const idx = fresh.findIndex(i => i.id === id);
          if (idx === -1) return;
          fresh[idx].title = res.content.trim();
          wx.setStorageSync(STORAGE_KEY, fresh);
          this._render(fresh);
        }
      }
    });
  },

  remove(e) {
    const id = e.currentTarget.dataset.id;
    const items = wx.getStorageSync(STORAGE_KEY) || [];
    const filtered = items.filter(i => i.id !== id);
    wx.setStorageSync(STORAGE_KEY, filtered);
    this._remindingIds.delete(id);
    this._render(filtered);
  },

  clearDone() {
    const items = wx.getStorageSync(STORAGE_KEY) || [];
    const doneItems = items.filter(item => item.done);
    if (doneItems.length === 0) return;

    wx.showModal({
      title: '清空已完成',
      content: `确定要删除 ${doneItems.length} 条已完成的待办吗？`,
      success: (res) => {
        if (res.confirm) {
          const fresh = (wx.getStorageSync(STORAGE_KEY) || []).filter(i => !i.done);
          wx.setStorageSync(STORAGE_KEY, fresh);
          if (this.data.filter === 'done') this.setData({ filter: 'all' });
          this._render(fresh);
        }
      }
    });
  },

  setFilter(e) {
    const filter = e.currentTarget.dataset.filter;
    this.setData({ filter, displayItems: this.applyFilter(this.data.items, filter) });
  },

  // ===================== 渲染 =====================
  load() {
    const items = wx.getStorageSync(STORAGE_KEY) || [];
    this._render(items);
  },

  _render(items) {
    const active = items.filter(i => !i.done).length;
    const done = items.length - active;

    const sorted = items.slice().sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return (b._ts || 0) - (a._ts || 0);
    });

    const displayAll = sorted.map(item => {
      const p = item.priority;
      return Object.assign({}, item, {
        priorityLabel: p === 2 ? '高' : p === 1 ? '中' : '低',
        priorityClass: p === 2 ? 'p-high' : p === 1 ? 'p-mid' : 'p-low',
        reminderLabel: REMINDER_LABELS[p],
      });
    });

    this.setData({
      items: displayAll,
      displayItems: this.applyFilter(displayAll, this.data.filter),
      stats: { total: items.length, active, done }
    });
  },

  applyFilter(items, filter) {
    if (filter === 'active') return items.filter(i => !i.done);
    if (filter === 'done') return items.filter(i => i.done);
    return items;
  },

  noop() {},
});