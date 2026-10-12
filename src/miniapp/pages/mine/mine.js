// pages/mine/mine.js —— 我的（用户信息 + 反馈）
const api = require('../../utils/api.js');

Page({
  data: {
    avatarUrl: '',
    nickName: '',
    showEditModal: false,
    editAvatar: '',
    editNickName: '',
    
    feedbackContent: '',
    feedbackLength: 0,
    showFeedbackModal: false,
    feedbackSubmitting: false,

    // 通知设置
    showNotifyModal: false,
    notifyWebhookUrl: '',
    webhookEnabled: false
  },

  onLoad() {
    this.loadUserInfo();
    this.loadWebhookStatus();
  },

  // 阻止冒泡（弹窗内容点击时不关闭）
  preventTap() {
    // do nothing
  },

  // 加载用户信息（从本地存储）
  loadUserInfo() {
    const avatarUrl = wx.getStorageSync('user_avatar') || '';
    const nickName = wx.getStorageSync('user_nick') || '';
    this.setData({ avatarUrl, nickName });
  },

  // 首次登录，获取微信用户信息
  getUserProfile() {
    wx.getUserProfile({
      desc: '用于完善用户信息',
      success: (res) => {
        const avatarUrl = res.userInfo.avatarUrl || '';
        const nickName = res.userInfo.nickName || '微信用户';
        wx.setStorageSync('user_avatar', avatarUrl);
        wx.setStorageSync('user_nick', nickName);
        this.setData({ avatarUrl, nickName });
        wx.showToast({ title: '登录成功', icon: 'success' });
      },
      fail: () => {
        wx.showToast({ title: '取消授权', icon: 'none' });
      }
    });
  },

  // 打开编辑弹窗
  openEditModal() {
    this.setData({
      showEditModal: true,
      editAvatar: this.data.avatarUrl,
      editNickName: this.data.nickName
    });
  },

  // 关闭编辑弹窗
  closeEditModal() {
    this.setData({ showEditModal: false });
  },

  // 选择头像
  chooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath || res.tempFiles[0].path;
        this.setData({ editAvatar: tempFilePath });
      }
    });
  },

  // 输入昵称
  onNickNameInput(e) {
    this.setData({ editNickName: e.detail.value });
  },

  // 保存用户信息
  saveUserInfo() {
    const { editAvatar, editNickName } = this.data;
    
    if (!editNickName.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    wx.setStorageSync('user_avatar', editAvatar);
    wx.setStorageSync('user_nick', editNickName);
    
    this.setData({
      avatarUrl: editAvatar,
      nickName: editNickName,
      showEditModal: false
    });
    
    wx.showToast({ title: '保存成功', icon: 'success' });
  },

  // 打开反馈弹窗
  openFeedbackModal() {
    this.setData({
      showFeedbackModal: true,
      feedbackContent: ''
    });
  },

  // 关闭反馈弹窗
  closeFeedbackModal() {
    this.setData({ showFeedbackModal: false });
  },

  // 输入反馈内容
  onFeedbackInput(e) {
    const value = e.detail.value;
    this.setData({ 
      feedbackContent: value,
      feedbackLength: value.length
    });
  },

  // 提交反馈
  submitFeedback() {
    const { feedbackContent } = this.data;

    // 仅保留非空校验，字数限制由后端代码层控制
    if (!feedbackContent.trim()) {
      wx.showToast({ title: '请输入反馈内容', icon: 'none' });
      return;
    }

    this.setData({ feedbackSubmitting: true });

    // 调用后端接口提交反馈
    api.post('/feedback/submit', {
      content: feedbackContent,
      openid: wx.getStorageSync('openid') || 'anonymous'
    }).then(() => {
      wx.hideLoading();
      this.setData({
        showFeedbackModal: false,
        feedbackContent: '',
        feedbackSubmitting: false
      });
      // 前端直接通知开发者
      this._sendFeedbackToServerChan(feedbackContent);
      wx.showToast({ title: '反馈已提交', icon: 'success' });
    }).catch(err => {
      wx.hideLoading();
      this.setData({ feedbackSubmitting: false });
      wx.showToast({ title: err.message || '提交失败', icon: 'none' });
    });
  },

  // ===== 通知设置 =====

  loadWebhookStatus() {
    api.get('/feedback/webhook/status').then(res => {
      const url = res && res.url ? res.url : '';
      this.setData({
        webhookEnabled: res && res.enabled,
        notifyWebhookUrl: url
      });
    }).catch(() => {});
  },

  // 打开通知设置页面
  openNotifyPage() {
    wx.navigateTo({ url: '/pages/notify/notify' });
  },

  openNotifyModal() {
    this.setData({ showNotifyModal: true });
  },

  closeNotifyModal() {
    this.setData({ showNotifyModal: false });
  },

  onNotifyUrlInput(e) {
    this.setData({ notifyWebhookUrl: e.detail.value });
  },

  saveNotifyConfig() {
    let url = this.data.notifyWebhookUrl.trim();

    if (!url) {
      wx.showToast({ title: '请输入 webhook 地址', icon: 'none' });
      return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      wx.showToast({ title: '地址必须以 http:// 或 https:// 开头', icon: 'none' });
      return;
    }

    // 自动补全 Server 酱的 .send 后缀
    if (url.includes('sctapi.ftqq.com') && !url.endsWith('.send')) {
      url = url + '.send';
      this.setData({ notifyWebhookUrl: url });
    }

    wx.showLoading({ title: '测试中...', mask: true });

    // 直接从前端调用 Server 酱测试通知
    this._sendServerChanTest(url).then(() => {
      // 测试成功，保存到后端
      return api.post('/feedback/webhook/config', { webhook_url: url });
    }).then(() => {
      wx.hideLoading();
      this.setData({
        webhookEnabled: true,
        showNotifyModal: false
      });
      wx.showToast({ title: '配置成功，测试通知已发送', icon: 'success' });
    }).catch(err => {
      wx.hideLoading();
      // 测试失败也保存配置，方便后续排查
      api.post('/feedback/webhook/config', { webhook_url: url }).catch(() => {});
      this.setData({ webhookEnabled: true, showNotifyModal: false });
      wx.showToast({ title: err.message || '测试失败', icon: 'none' });
    });
  },

  _sendServerChanTest(webhookUrl) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: webhookUrl,
        method: 'POST',
        header: { 'content-type': 'application/json' },
        data: {
          title: '测试通知',
          desp: '反馈系统已成功连接！\n\n这是一条测试消息，收到此消息说明通知配置正确。'
        },
        success: (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error('Server 酱返回 ' + res.statusCode));
          }
        },
        fail: (err) => {
          reject(new Error('网络请求失败，请确认已在小程序后台添加 sctapi.ftqq.com 到 request 合法域名'));
        }
      });
    });
  },

  _sendFeedbackToServerChan(content) {
    const webhookUrl = this.data.notifyWebhookUrl;
    if (!webhookUrl || !this.data.webhookEnabled) return;

    wx.request({
      url: webhookUrl,
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: {
        title: '收到新的用户反馈',
        desp: '## 反馈内容\n\n' + content + '\n\n---\n时间: ' + new Date().toLocaleString()
      },
      success: () => {},
      fail: () => {}
    });
  },
});
