// pages/datecalc/datecalc.js —— 日期计算（调用后端 /calculate_days）
const api = require('../../utils/api.js');

Page({
  data: {
    startDate: '',
    endDate: '',
    result: ''
  },

  onLoad() {
    const today = new Date();
    const p = n => String(n).padStart(2, '0');
    const todayStr = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
    this.setData({ endDate: todayStr });
  },

  bindStartDateChange(e) {
    this.setData({ startDate: e.detail.value });
  },

  bindEndDateChange(e) {
    this.setData({ endDate: e.detail.value });
  },

  calculate() {
    const { startDate, endDate } = this.data;
    if (!startDate || !endDate) {
      wx.showToast({ title: '请选择完整的日期范围', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '计算中...' });
    api.post('/calculate_days', { start_date: startDate, end_date: endDate })
      .then(data => {
        wx.hideLoading();
        this.setData({ result: `计算成功！已经过去了 ${data.days} 天` });
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '计算失败', icon: 'none' });
      });
  }
});
