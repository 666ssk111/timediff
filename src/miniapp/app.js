// app.js
App({
  onLaunch() {
    // 初始化云开发环境（供云托管模式使用，本地联调不受影响）
    try {
      wx.cloud.init({ env: 'prod-d7gbnxjit907040e0' });
    } catch (e) {
      // 本地开发或未开通云环境时忽略
    }

    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 登录
    wx.login({
      success: res => {
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
      }
    })
  },
  globalData: {
    userInfo: null
  }
})
