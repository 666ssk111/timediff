// pages/notify/notify.js —— 消息通知设置
const api = require('../../utils/api.js');

Page({
  data: {
    masterEnabled: true,
    drinkReminder: true,
    loading: true,
    saving: false,
    subscribed: false,
  },

  onLoad() {
    this.loadSettings();
  },

  onShow() {
    this.loadSettings();
  },

  loadSettings() {
    this.setData({ loading: true });
    api.get('/notify/settings')
      .then(data => {
        this.setData({
          masterEnabled: data.enabled !== false,
          drinkReminder: data.drink_reminder !== false,
          loading: false,
        });
      })
      .catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: '加载设置失败', icon: 'none' });
      });
  },

  // 主开关切换
  onMasterToggle(e) {
    const enabled = e.detail.value;
    this.setData({ masterEnabled: enabled });
    this.saveSettings();
  },

  // 喝水提醒开关
  onDrinkToggle(e) {
    const enabled = e.detail.value;
    this.setData({ drinkReminder: enabled });
    this.saveSettings();
  },

  saveSettings() {
    if (this.data.saving) return;
    this.setData({ saving: true });

    api.post('/notify/settings', {
      enabled: this.data.masterEnabled,
      drink_reminder: this.data.drinkReminder,
    }).then(() => {
      this.setData({ saving: false });
      wx.showToast({ title: '已保存', icon: 'success', duration: 1200 });
    }).catch(() => {
      this.setData({ saving: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },

  // 订阅微信消息
  subscribeMessage() {
    wx.requestSubscribeMessage({
      tmplIds: [SRRVFo5idt1-FHeUbIBxFMHmhXX9qa6cqirk9StOpYk],  // 需要先在微信公众平台申请模板消息 ID
      success: () => {
        this.setData({ subscribed: true });
        wx.showToast({ title: '订阅成功', icon: 'success' });
      },
      fail: (err) => {
        if (err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '订阅失败，请稍后重试', icon: 'none' });
        }
      }
    });
  },
});