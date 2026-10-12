// pages/account-category/account-category.js —— 分类消费明细
const api = require('../../utils/api.js');

const STORAGE_KEY = 'account_records';

function fmtMoney(n) {
  const v = Number(n);
  if (isNaN(v)) return String(n);
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pad(n) { return String(n).padStart(2, '0'); }

function fmtDate(dateStr) {
  const d = new Date(dateStr.replace(/-/g, '/'));
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}月${day}日 ${week[d.getDay()]}`;
}

function loadLocal() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function groupByDate(records) {
  const groups = {};
  records.forEach(r => {
    if (!groups[r.date]) {
      groups[r.date] = { date: r.date, dateLabel: fmtDate(r.date), income: 0, expense: 0, total: 0, bills: [] };
    }
    if (r.type === 1) {
      groups[r.date].income += Number(r.amount) || 0;
    } else {
      groups[r.date].expense += Number(r.amount) || 0;
    }
    groups[r.date].bills.push(r);
  });
  Object.values(groups).forEach(g => {
    g.total = g.income - g.expense;
  });
  return Object.values(groups);
}

Page({
  data: {
    category: '',
    categoryFirst: '?',
    currentMonth: '',
    dayGroups: [],
    expandedDates: {},
    totalExpense: '0',
    recordCount: 0,
    loading: true
  },

  onLoad(options) {
    const category = decodeURIComponent(options.category || '') || '其他';
    const currentMonth = options.month || '';
    this.setData({
      category,
      categoryFirst: (category || '?')[0] || '?',
      currentMonth,
      loading: true
    });
    // 动态设置导航栏标题
    wx.setNavigationBarTitle({ title: category + ' · 消费明细' });
    this.loadRecords();
  },

  loadRecords() {
    const category = this.data.category;
    const month = this.data.currentMonth;
    const start = month + '-01';
    const end = month + '-31';

    api.get('/account/list', { start, end, page: 1, size: 500 })
      .then((listData) => {
        const local = loadLocal();
        const map = {};
        local.forEach(r => { map[r.id] = r; });
        (listData.items || []).forEach(r => { if (!map[r.id]) map[r.id] = r; });
        let all = Object.values(map);

        // 只保留当前月份的记录
        all = all.filter(r => r.date >= start && r.date <= end);

        // 筛选：该分类 + 支出（type === 2）
        const filtered = all.filter(r => r.category === category && r.type === 2);
        const total = filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0);

        const list = filtered.map(b => ({
          id: b.id,
          amount: Number(b.amount) || 0,
          amountSign: '-' + fmtMoney(b.amount),
          amountClass: 'expense',
          category: b.category,
          categoryFirst: (b.category || '?')[0],
          note: b.note || '',
          date: b.date,
          type: b.type
        }));

        this.setData({
          dayGroups: groupByDate(list),
          totalExpense: fmtMoney(total),
          recordCount: list.length,
          loading: false
        });
      })
      .catch(() => {
        // 离线：从本地缓存加载，只保留当前月份
        const local = loadLocal();
        const monthRecords = local.filter(r => r.date >= start && r.date <= end);
        const filtered = monthRecords.filter(r => r.category === category && r.type === 2);
        const total = filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0);

        const list = filtered.map(b => ({
          id: b.id,
          amount: Number(b.amount) || 0,
          amountSign: '-' + fmtMoney(b.amount),
          amountClass: 'expense',
          category: b.category,
          categoryFirst: (b.category || '?')[0],
          note: b.note || '',
          date: b.date,
          type: b.type
        }));

        this.setData({
          dayGroups: groupByDate(list),
          totalExpense: fmtMoney(total),
          recordCount: list.length,
          loading: false
        });
      });
  },

  toggleDay(e) {
    const date = e.currentTarget.dataset.date;
    const expanded = { ...this.data.expandedDates };
    if (expanded[date]) {
      delete expanded[date];
    } else {
      expanded[date] = true;
    }
    this.setData({ expandedDates: expanded });
  }
});