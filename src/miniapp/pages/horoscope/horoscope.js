// pages/horoscope/horoscope.js —— 星座运势（调用后端 /horoscope/daily）
const api = require('../../utils/api.js');

const SIGNS = [
  { name: '白羊座', en: 'aries', icon: '♈' },
  { name: '金牛座', en: 'taurus', icon: '♉' },
  { name: '双子座', en: 'gemini', icon: '♊' },
  { name: '巨蟹座', en: 'cancer', icon: '♋' },
  { name: '狮子座', en: 'leo', icon: '♌' },
  { name: '处女座', en: 'virgo', icon: '♍' },
  { name: '天秤座', en: 'libra', icon: '♎' },
  { name: '天蝎座', en: 'scorpio', icon: '♏' },
  { name: '射手座', en: 'sagittarius', icon: '♐' },
  { name: '摩羯座', en: 'capricorn', icon: '♑' },
  { name: '水瓶座', en: 'aquarius', icon: '♒' },
  { name: '双鱼座', en: 'pisces', icon: '♓' }
];

const DIMENSIONS = [
  { key: 'overall', label: '总体', icon: '🌟' },
  { key: 'love', label: '爱情', icon: '💕' },
  { key: 'career', label: '事业', icon: '💼' },
  { key: 'wealth', label: '财运', icon: '💰' },
  { key: 'health', label: '健康', icon: '🍀' }
];

function pad(n) { return String(n).padStart(2, '0'); }
function fmtDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

Page({
  data: {
    signs: SIGNS,
    signIndex: 0,
    result: null,
    dimensions: DIMENSIONS,
    date: '',
    minDate: '',
    maxDate: ''
  },

  onLoad() {
    // 日期范围为当天前后各 7 天
    const now = new Date();
    const min = new Date(now.getTime() - 7 * 86400000);
    const max = new Date(now.getTime() + 7 * 86400000);
    this.setData({
      date: fmtDate(now),
      minDate: fmtDate(min),
      maxDate: fmtDate(max)
    });
    this.fetch();
  },

  onSign(e) {
    this.setData({ signIndex: Number(e.currentTarget.dataset.index) });
    this.fetch();
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value });
    this.fetch();
  },

  fetch() {
    const sign = this.data.signs[this.data.signIndex].en;
    wx.showLoading({ title: '生成中...' });
    api.get('/horoscope/daily', { sign, date: this.data.date })
      .then(data => {
        wx.hideLoading();
        const result = Object.assign({}, data, {
          icon: this.data.signs[this.data.signIndex].icon
        });
        this.setData({ result });
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '生成失败', icon: 'none' });
      });
  }
});
