// pages/habit/habit.js —— 喝水打卡 + 日历历史 + 中午提醒
const api = require('../../utils/api.js');

const HABIT_NAME = '喝水';
const HABIT_ICON = '💧';
const DEFAULT_TARGET = 8;

function pad(n) { return String(n).padStart(2, '0'); }
function dateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

Page({
  data: {
    habitId: null,
    todayCount: 0,
    target: DEFAULT_TARGET,
    percent: 0,
    streak: 0,
    week: [],

    // 日历
    showCalendar: false,
    calYear: 0,
    calMonth: 0,
    calTitle: '',
    calDays: [],
    calLogs: {},
    calIsCurrentMonth: true,
    selectedDate: '',
    selectedCount: 0,
    showDayDetail: false,
  },

  onLoad() {
    this.initHabit();
  },

  preventTap() {
    // 阻止弹窗冒泡
  },

  onShow() {
    // 每次显示页面时检查是否需要中午提醒
    if (this.data.habitId) {
      this.checkNoonReminder();
    }
  },

  // 确保"喝水"习惯存在，并加载进度
  initHabit() {
    api.get('/habit/list')
      .then(data => {
        const habit = (data.items || []).find(h => h.name === HABIT_NAME);
        if (habit) {
          this.setData({
            habitId: habit.id,
            todayCount: habit.today_count || 0,
            target: habit.target || DEFAULT_TARGET
          });
          this.loadStats();
          this.checkNoonReminder();
        } else {
          api.post('/habit/add', { name: HABIT_NAME, icon: HABIT_ICON, target: DEFAULT_TARGET })
            .then(r => {
              this.setData({ habitId: r.id, todayCount: 0, target: DEFAULT_TARGET });
              this.loadStats();
              this.checkNoonReminder();
            })
            .catch(err => wx.showToast({ title: (err && err.message) || '初始化失败', icon: 'none' }));
        }
      })
      .catch(err => wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' }));
  },

  // 检查中午提醒
  checkNoonReminder() {
    api.get('/notify/check-drink')
      .then(data => {
        if (data && data.need_remind) {
          wx.showModal({
            title: '💧 喝水提醒',
            content: '已经中午了，今天还没有喝水打卡哦！记得补充水分～',
            showCancel: false,
            confirmText: '我知道了',
            confirmColor: '#0EA5E9',
          });
        }
      })
      .catch(() => {});
  },

  // 加载连续天数与近 7 天记录
  loadStats() {
    if (!this.data.habitId) return;
    api.get('/habit/stats', { habit_id: this.data.habitId })
      .then(data => {
        const logs = data.logs || [];
        this.setData({
          streak: data.streak || 0,
          week: this.buildWeek(logs)
        });
      })
      .catch(err => wx.showToast({ title: (err && err.message) || '统计失败', icon: 'none' }));
  },

  drink() {
    if (!this.data.habitId) return;
    api.post('/habit/checkin', { habit_id: this.data.habitId })
      .then(data => {
        const todayCount = data.today_count || 0;
        const streak = data.streak || 0;
        this.setData({
          todayCount,
          streak,
          percent: Math.min(100, Math.round((todayCount / this.data.target) * 100))
        });
        this.loadStats();
        // 刷新日历（如果正在显示）
        if (this.data.showCalendar) {
          this.loadCalendar(this.data.calYear, this.data.calMonth);
        }
        if (todayCount >= this.data.target) {
          wx.showToast({ title: '🎉 完成今日饮水目标！', icon: 'none' });
        } else {
          wx.showToast({ title: `+1 杯，已喝 ${todayCount} 杯`, icon: 'none' });
        }
      })
      .catch(err => wx.showToast({ title: (err && err.message) || '打卡失败', icon: 'none' }));
  },

  buildWeek(logs) {
    const map = {};
    logs.forEach(l => { map[l.date] = l.count; });

    const labels = ['日', '一', '二', '三', '四', '五', '六'];
    const week = [];
    const now = new Date();
    const todayStr = dateStr(now);

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const ds = dateStr(d);
      const count = map[ds] || 0;
      week.push({
        date: ds,
        count,
        dayLabel: labels[d.getDay()],
        isToday: ds === todayStr,
        full: count >= this.data.target
      });
    }
    return week;
  },

  // 点击近7天某一天查看详情
  onWeekDayTap(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    this.setData({ selectedDate: date });
    api.get('/habit/day', { habit_id: this.data.habitId, date })
      .then(data => {
        this.setData({
          selectedCount: data.count || 0,
          showDayDetail: true,
        });
      })
      .catch(() => {
        this.setData({
          selectedCount: 0,
          showDayDetail: true,
        });
      });
  },

  /* ---------- 日历历史 ---------- */
  toggleCalendar() {
    if (this.data.showCalendar) {
      this.setData({ showCalendar: false, showDayDetail: false });
    } else {
      const now = new Date();
      this.loadCalendar(now.getFullYear(), now.getMonth() + 1);
      this.setData({ showCalendar: true });
    }
  },

  loadCalendar(year, month) {
    const monthStr = `${year}-${pad(month)}`;
    const now = new Date();
    const isCurrent = (year === now.getFullYear() && month === now.getMonth() + 1);
    this.setData({
      calYear: year, calMonth: month,
      calTitle: `${year}年${month}月`,
      calIsCurrentMonth: isCurrent,
    });

    api.get('/habit/history', { habit_id: this.data.habitId, month: monthStr })
      .then(data => {
        this.setData({ calLogs: data.logs || {} });
        this.buildCalendarDays(year, month);
      })
      .catch(() => {
        this.buildCalendarDays(year, month);
      });
  },

  buildCalendarDays(year, month) {
    const days = [];
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const totalDays = lastDay.getDate();
    const startWeekDay = firstDay.getDay(); // 0=周日

    const today = new Date();
    const todayStr = dateStr(today);
    // 今天零点时间戳，用于判断未来日期
    const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    // 填充前面的空白
    for (let i = 0; i < startWeekDay; i++) {
      days.push({ date: '', count: 0, empty: true });
    }

    // 填充日期
    for (let d = 1; d <= totalDays; d++) {
      const ds = `${year}-${pad(month)}-${pad(d)}`;
      const count = this.data.calLogs[ds] || 0;
      const cellDate = new Date(year, month - 1, d);
      const isFuture = cellDate.getTime() > todayZero;
      days.push({
        date: ds,
        count,
        day: d,
        empty: false,
        isToday: ds === todayStr,
        isFuture: isFuture,
        hasCheckin: !isFuture && count > 0,
        full: !isFuture && count >= this.data.target,
      });
    }

    this.setData({ calDays: days });
  },

  prevMonth() {
    let { calYear, calMonth } = this.data;
    calMonth--;
    if (calMonth < 1) { calMonth = 12; calYear--; }
    this.loadCalendar(calYear, calMonth);
  },

  nextMonth() {
    let { calYear, calMonth } = this.data;
    const now = new Date();
    // 不能超过当前月份
    if (calYear === now.getFullYear() && calMonth >= now.getMonth() + 1) return;
    calMonth++;
    if (calMonth > 12) { calMonth = 1; calYear++; }
    this.loadCalendar(calYear, calMonth);
  },

  onDayTap(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;

    this.setData({ selectedDate: date });

    api.get('/habit/day', { habit_id: this.data.habitId, date })
      .then(data => {
        this.setData({
          selectedCount: data.count || 0,
          showDayDetail: true,
        });
      })
      .catch(() => {
        this.setData({
          selectedCount: this.data.calLogs[date] || 0,
          showDayDetail: true,
        });
      });
  },

  closeDayDetail() {
    this.setData({ showDayDetail: false });
  },
});