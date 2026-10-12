// pages/history/history.js —— 历史上的今天（调用后端 /history/today）
const api = require('../../utils/api.js');

// 分类图标映射
const TYPE_META = {
  '航天': { icon: '🚀' },
  '科技': { icon: '🔬' },
  '体育': { icon: '🏅' },
  '文化': { icon: '🎭' },
  '节日': { icon: '🎉' },
  '历史': { icon: '📜' },
  '和平': { icon: '🕊️' },
  '建筑': { icon: '🏗️' },
  '发明': { icon: '💡' },
  '科学': { icon: '🧪' },
  '环保': { icon: '🌱' },
  '政策': { icon: '🏛️' }
};

// 每月天数
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function pad(n) { return String(n).padStart(2, '0'); }

Page({
  data: {
    month: 1,
    day: 1,
    displayDate: '',
    monthRange: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    dayRange: [],
    pickerValue: [0, 0],
    loading: false,
    result: null,
    empty: false
  },

  onLoad() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const dayRange = this._buildDayRange(month);
    this.setData({
      month,
      day,
      displayDate: `${month}月${day}日`,
      dayRange,
      pickerValue: [month - 1, day - 1]
    });
    this.fetch();
  },

  _buildDayRange(month) {
    const maxDay = DAYS_IN_MONTH[month - 1] || 31;
    const range = [];
    for (let d = 1; d <= maxDay; d++) {
      range.push(`${d}日`);
    }
    return range;
  },

  // 多列选择器：列切换时更新天数范围
  onPickerColumnChange(e) {
    const { column, value } = e.detail;
    if (column === 0) {
      // 月份变了，更新天数列表
      const month = value + 1;
      const dayRange = this._buildDayRange(month);
      const pickerValue = this.data.pickerValue;
      // 如果当前日超出新月份的最大天数，调整到最大日
      let dayIdx = pickerValue[1];
      if (dayIdx >= dayRange.length) {
        dayIdx = dayRange.length - 1;
      }
      this.setData({ dayRange, pickerValue: [value, dayIdx] });
    }
  },

  // 选择完成
  onPickerChange(e) {
    const [mIdx, dIdx] = e.detail.value;
    const month = mIdx + 1;
    const day = dIdx + 1;
    this.setData({
      month,
      day,
      displayDate: `${month}月${day}日`,
      pickerValue: [mIdx, dIdx]
    });
  },

  goToday() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const dayRange = this._buildDayRange(month);
    this.setData({
      month,
      day,
      displayDate: `${month}月${day}日`,
      dayRange,
      pickerValue: [month - 1, day - 1]
    });
    this.fetch();
  },

  goRandom() {
    const month = Math.floor(Math.random() * 12) + 1;
    const maxDay = DAYS_IN_MONTH[month - 1] || 31;
    const day = Math.floor(Math.random() * maxDay) + 1;
    const dayRange = this._buildDayRange(month);
    this.setData({
      month,
      day,
      displayDate: `${month}月${day}日`,
      dayRange,
      pickerValue: [month - 1, day - 1]
    });
    this.fetch();
  },

  fetch() {
    const mm = pad(this.data.month);
    const dd = pad(this.data.day);
    this.setData({ loading: true, empty: false, result: null });

    // limit=5：每次最多返回 5 条历史事件
    api.get('/history/today', { month: mm, day: dd, limit: 5 })
      .then(data => {
        const items = (data.items || []).slice(0, 5).map(item => {
          const meta = TYPE_META[item.type] || { icon: '📌' };
          return Object.assign({}, item, {
            yearStr: String(item.year),
            typeIcon: meta.icon,
            catClass: item.category === '中国' ? 'cn' : 'intl'
          });
        });

        this.setData({
          loading: false,
          empty: false,
          result: {
            display: `${Number(mm)}月${Number(dd)}日`,
            count: items.length,
            items
          }
        });
      })
      .catch(() => {
        this.setData({ loading: false, empty: true, result: null });
      });
  }
});