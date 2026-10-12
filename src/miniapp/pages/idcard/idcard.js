// pages/idcard/idcard.js —— 身份证解析（调用后端 /idcard/parse）
const api = require('../../utils/api.js');

Page({
  data: {
    idNumber: '',
    result: null
  },

  onInput(e) {
    this.setData({ idNumber: e.detail.value, result: null });
  },

  clear() {
    this.setData({ idNumber: '', result: null });
  },

  parse() {
    const id = (this.data.idNumber || '').trim().toUpperCase();
    if (!/^\d{17}[\dX]$/.test(id)) {
      wx.showToast({ title: '请输入 18 位身份证号', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '解析中...' });
    api.post('/idcard/parse', { id_number: id })
      .then(data => {
        wx.hideLoading();
        this.setData({ result: data });
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '解析失败', icon: 'none' });
      });
  }
});
