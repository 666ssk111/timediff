// pages/avatar/avatar.js —— 壁纸/头像制作
const api = require('../../utils/api.js');

Page({
  data: {
    templates: [],
    fonts: [],
    activeIndex: 0,
    activeFontIndex: 0,
    activeFont: 'songti',
    quote: '',
    result: ''
  },

  onLoad() {
    api.get('/avatar/templates')
      .then(d => {
        const templates = (d.templates || []).map(t => ({
          id: t.id,
          quote: t.quote,
          gradient: `linear-gradient(135deg, ${t.colors[0]}, ${t.colors[1] || t.colors[0]})`
        }));
        this.setData({ templates });
      })
      .catch(err => wx.showToast({ title: (err && err.message) || '加载模板失败', icon: 'none' }));
    
    api.get('/avatar/fonts')
      .then(d => {
        const fonts = (d.fonts || []);
        this.setData({ fonts });
      })
      .catch(() => {});
  },

  onTemplate(e) {
    this.setData({ activeIndex: Number(e.currentTarget.dataset.index), result: '' });
  },

  onQuote(e) {
    this.setData({ quote: e.detail.value });
  },

  onFontChange(e) {
    const idx = Number(e.detail.value);
    const font = this.data.fonts[idx];
    this.setData({
      activeFontIndex: idx,
      activeFont: font ? font.id : 'songti',
      result: ''
    });
  },

  render() {
    const t = this.data.templates[this.data.activeIndex];
    if (!t) {
      wx.showToast({ title: '请先选择模板', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '生成中...' });
    api.post('/avatar/render', {
      width: 750,
      height: 1334,
      template: t.id,
      quote: this.data.quote || t.quote,
      font: this.data.activeFont
    }).then(d => {
      wx.hideLoading();
      this.setData({ result: d.image || '' });
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '生成失败', icon: 'none' });
    });
  },

  save() {
    if (!this.data.result) return;
    const base64 = this.data.result.split(',')[1];
    if (!base64) return;
    const fs = wx.getFileSystemManager();
    const path = `${wx.env.USER_DATA_PATH}/avatar.png`;
    fs.writeFile({
      filePath: path,
      data: base64,
      encoding: 'base64',
      success: () => {
        wx.saveImageToPhotosAlbum({
          filePath: path,
          success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
          fail: () => wx.showToast({ title: '保存失败', icon: 'none' })
        });
      },
      fail: () => wx.showToast({ title: '保存失败', icon: 'none' })
    });
  }
});
