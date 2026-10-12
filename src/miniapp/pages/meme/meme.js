// pages/meme/meme.js —— 表情包生成器
const api = require('../../utils/api.js');

Page({
  data: {
    imagePath: '',
    topText: '',
    bottomText: '',
    result: ''
  },

  onTop(e) {
    this.setData({ topText: e.detail.value });
  },

  onBottom(e) {
    this.setData({ bottomText: e.detail.value });
  },

  onChoose() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (file) {
          this.setData({ imagePath: file.tempFilePath, result: '' });
        }
      }
    });
  },

  render() {
    if (!this.data.imagePath) {
      wx.showToast({ title: '请先选择图片', icon: 'none' });
      return;
    }
    wx.getFileSystemManager().readFile({
      filePath: this.data.imagePath,
      encoding: 'base64',
      success: (res) => {
        wx.showLoading({ title: '生成中...' });
        api.post('/meme/render', {
          image_base64: res.data,
          top_text: this.data.topText,
          bottom_text: this.data.bottomText
        }).then(d => {
          wx.hideLoading();
          this.setData({ result: d.image || '' });
        }).catch(err => {
          wx.hideLoading();
          wx.showToast({ title: (err && err.message) || '生成失败', icon: 'none' });
        });
      },
      fail: () => wx.showToast({ title: '读取图片失败', icon: 'none' })
    });
  },

  // 分享表情：写入本地 GIF 后调起微信图片分享菜单
  share() {
    if (!this.data.result) return;
    const base64 = this.data.result.split(',')[1];
    if (!base64) return;
    const fs = wx.getFileSystemManager();
    const path = `${wx.env.USER_DATA_PATH}/meme_${Date.now()}.gif`;
    fs.writeFile({
      filePath: path,
      data: base64,
      encoding: 'base64',
      success: () => {
        if (wx.showShareImageMenu) {
          wx.showShareImageMenu({
            path,
            fail: () => wx.showToast({ title: '分享失败', icon: 'none' })
          });
        } else {
          wx.showToast({ title: '请长按图片发送给朋友', icon: 'none' });
        }
      },
      fail: () => wx.showToast({ title: '生成文件失败', icon: 'none' })
    });
  }
});
