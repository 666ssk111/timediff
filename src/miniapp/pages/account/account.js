// pages/account/account.js —— 记账本（按天分组 + 60天本地缓存）
const api = require('../../utils/api.js');

const CATEGORIES = ['餐饮', '交通', '购物', '居住', '医疗', '娱乐', '教育', '其他'];
const STORAGE_KEY = 'account_records';
const MAX_DAYS = 60;

function fmtMoney(n) {
  const v = Number(n);
  if (isNaN(v)) return String(n);
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pad(n) { return String(n).padStart(2, '0'); }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtDate(dateStr) {
  const d = new Date(dateStr.replace(/-/g, '/'));
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}月${day}日 ${week[d.getDay()]}`;
}

// 日期选择器范围：最多往前60天
function getDateRange() {
  const end = new Date();
  const start = new Date(end.getTime() - MAX_DAYS * 24 * 60 * 60 * 1000);
  return {
    dateMin: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    dateMax: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`
  };
}

// 读取本地缓存
function loadLocal() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

// 保存本地缓存，只保留最近60天
function saveLocal(records) {
  const cutoff = Date.now() - MAX_DAYS * 24 * 60 * 60 * 1000;
  const filtered = records.filter(r => {
    const ts = new Date(r.date.replace(/-/g, '/')).getTime();
    return ts >= cutoff;
  });
  try {
    wx.setStorageSync(STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    // 存储空间不足时忽略
  }
}

// 合并本地与后端数据，去重
function mergeRecords(apiRecords, localRecords) {
  const map = {};
  // 本地优先（可能包含离线添加的记录）
  localRecords.forEach(r => { map[r.id] = r; });
  apiRecords.forEach(r => { if (!map[r.id]) map[r.id] = r; });
  return Object.values(map).sort((a, b) => {
    if (a.date > b.date) return -1;
    if (a.date < b.date) return 1;
    return 0;
  });
}

// 按天分组
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
    amount: '',
    type: 2,
    category: '其他',
    categoryIndex: 7,
    note: '',
    categories: CATEGORIES,
    list: [],
    dayGroups: [],       // 按天分组后的数据
    expandedDates: {},   // 展开的日期 { '2025-01-01': true }
    summary: null,
    showAdd: false,
    currentMonth: '',
    selectedDate: '',      // 选中的记账日期 (YYYY-MM-DD)
    selectedDateLabel: '', // 日期显示文本
    dateMin: '',           // 日期选择器最小值
    dateMax: ''            // 日期选择器最大值
  },

  onLoad() {
    const now = new Date();
    const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    this.setData({ currentMonth: month });
    this.refresh();
  },

  prevMonth() {
    const [y, m] = this.data.currentMonth.split('-').map(Number);
    const newMonth = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
    this.setData({ currentMonth: newMonth, expandedDates: {} });
    this.refresh();
  },

  nextMonth() {
    const [y, m] = this.data.currentMonth.split('-').map(Number);
    const newMonth = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
    this.setData({ currentMonth: newMonth, expandedDates: {} });
    this.refresh();
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  switchType(e) {
    this.setData({ type: parseInt(e.currentTarget.dataset.type) });
  },

  onCategoryChange(e) {
    const index = parseInt(e.detail.value);
    this.setData({ categoryIndex: index, category: CATEGORIES[index] });
  },

  onDateChange(e) {
    const date = e.detail.value; // YYYY-MM-DD
    this.setData({ selectedDate: date, selectedDateLabel: fmtDate(date) });
  },

  toggleAdd() {
    if (this.data.showAdd) {
      // 关闭面板时重置日期
      this.setData({ showAdd: false, selectedDate: '', selectedDateLabel: '', dateMin: '', dateMax: '' });
    } else {
      // 从 FAB 打开时，使用今天
      const d = new Date();
      const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const range = getDateRange();
      this.setData({ showAdd: true, selectedDate: date, selectedDateLabel: fmtDate(date), dateMin: range.dateMin, dateMax: range.dateMax });
    }
  },

  add() {
    const amount = parseFloat(this.data.amount);
    if (isNaN(amount) || amount <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });
    const date = this.data.selectedDate || todayStr();
    const record = {
      id: 'local_' + Date.now(),
      amount,
      type: this.data.type,
      category: this.data.category,
      note: this.data.note.trim() || '',
      date
    };

    api.post('/account/add', {
      amount,
      type: this.data.type,
      category: this.data.category,
      note: this.data.note.trim() || '',
      date
    }).then((res) => {
      wx.hideLoading();
      // 用后端返回的 id 更新本地记录
      if (res && res.id) record.id = res.id;
      // 存入本地缓存
      const local = loadLocal();
      local.push(record);
      saveLocal(local);
      this.setData({ amount: '', note: '', showAdd: false, selectedDate: '', selectedDateLabel: '', dateMin: '', dateMax: '' });
      this.refresh();
    }).catch(err => {
      wx.hideLoading();
      // 网络失败时也保存到本地
      const local = loadLocal();
      local.push(record);
      saveLocal(local);
      wx.showToast({ title: '已离线保存', icon: 'none' });
      this.setData({ amount: '', note: '', showAdd: false, selectedDate: '', selectedDateLabel: '', dateMin: '', dateMax: '' });
      this.refresh();
    });
  },

  remove(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复',
      success: (res) => {
        if (res.confirm) {
          // 同时从本地缓存删除
          const local = loadLocal().filter(r => r.id !== id);
          saveLocal(local);

          api.post('/account/delete', { id })
            .then(() => this.refresh())
            .catch(() => {
              this.refresh();
              wx.showToast({ title: '已本地删除', icon: 'none' });
            });
        }
      }
    });
  },

  // 点击分类跳转消费明细
  onCategoryTap(e) {
    const category = e.currentTarget.dataset.category;
    const month = this.data.currentMonth;
    wx.navigateTo({
      url: `/pages/account-category/account-category?category=${encodeURIComponent(category)}&month=${month}`
    });
  },

  // 点击日期行——打开记账面板，预填该日期
  onDayTap(e) {
    const date = e.currentTarget.dataset.date;
    const dateLabel = e.currentTarget.dataset.datelabel;
    const range = getDateRange();
    this.setData({
      selectedDate: date,
      selectedDateLabel: dateLabel,
      type: 2,          // 强制支出
      showAdd: true,
      dateMin: range.dateMin,
      dateMax: range.dateMax
    });
  },

  // 点击某天展开/收起
  toggleDay(e) {
    const date = e.currentTarget.dataset.date;
    const expanded = { ...this.data.expandedDates };
    if (expanded[date]) {
      delete expanded[date];
    } else {
      expanded[date] = true;
    }
    this.setData({ expandedDates: expanded });
  },

  refresh() {
    const month = this.data.currentMonth;
    const start = month + '-01';
    const end = month + '-31';

    Promise.all([
      api.get('/account/summary', { month }),
      api.get('/account/list', { start, end, page: 1, size: 200 })
    ]).then(([summary, listData]) => {
      const income = Number(summary.income) || 0;
      const expense = Number(summary.expense) || 0;
      const balance = income - expense;

      const byCategory = (summary.by_category || []).filter(c => Number(c.type) === 2);
      const categoryBreakdown = byCategory.map(c => {
        const t = Number(c.total) || 0;
        return {
          name: c.category,
          totalStr: fmtMoney(t),
          percent: expense > 0 ? Math.round((t / expense) * 100) : 0
        };
      }).sort((a, b) => b.percent - a.percent);

      // 合并本地缓存（60天），然后只保留当前月份的记录
      const local = loadLocal();
      const merged = mergeRecords(listData.items || [], local);
      saveLocal(merged);
      const monthRecords = merged.filter(r => r.date >= start && r.date <= end);

      const list = monthRecords.map(b => ({
        id: b.id,
        amount: Number(b.amount) || 0,
        amountSign: (b.type === 1 ? '+' : '-') + fmtMoney(b.amount),
        amountClass: b.type === 1 ? 'income' : 'expense',
        category: b.category,
        categoryFirst: (b.category || '?')[0],
        categoryClass: b.type === 1 ? 'cat-income' : 'cat-expense',
        note: b.note || '',
        date: b.date,
        type: b.type
      }));

      // 按天分组
      const dayGroups = groupByDate(list);

      this.setData({
        list,
        dayGroups,
        summary: {
          incomeStr: fmtMoney(income),
          expenseStr: fmtMoney(expense),
          balanceStr: fmtMoney(balance),
          balanceSign: balance >= 0 ? '+' : '',
          balanceClass: balance >= 0 ? 'positive' : 'negative',
          categoryBreakdown
        }
      });
    }).catch(err => {
      // 离线时从本地缓存加载，只保留当前月份
      const local = loadLocal();
      const month = this.data.currentMonth;
      const start = month + '-01';
      const end = month + '-31';
      const monthRecords = local.filter(r => r.date >= start && r.date <= end);
      const list = monthRecords.map(b => ({
        id: b.id,
        amount: Number(b.amount) || 0,
        amountSign: (b.type === 1 ? '+' : '-') + fmtMoney(b.amount),
        amountClass: b.type === 1 ? 'income' : 'expense',
        category: b.category,
        categoryFirst: (b.category || '?')[0],
        categoryClass: b.type === 1 ? 'cat-income' : 'cat-expense',
        note: b.note || '',
        date: b.date,
        type: b.type
      }));
      const dayGroups = groupByDate(list);

      const income = list.filter(b => b.type === 1).reduce((s, b) => s + parseFloat(b.amountSign.replace('+','')) || 0, 0);
      const expense2 = list.filter(b => b.type !== 1).reduce((s, b) => s + parseFloat(b.amountSign.replace('-','')) || 0, 0);
      const balance = income - expense2;

      this.setData({
        list,
        dayGroups,
        summary: {
          incomeStr: fmtMoney(income),
          expenseStr: fmtMoney(expense2),
          balanceStr: fmtMoney(balance),
          balanceSign: balance >= 0 ? '+' : '',
          balanceClass: balance >= 0 ? 'positive' : 'negative',
          categoryBreakdown: []
        }
      });
    });
  }
});