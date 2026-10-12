// pages/random/random.js —— 随机决定（抛硬币/转盘/抽签）+ Excel/Word 导入
const api = require('../../utils/api.js');

function base64Encode(ab) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = new Uint8Array(ab);
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    result += chars[b1 >> 2];
    result += chars[((b1 & 3) << 4) | (b2 >> 4)];
    result += i + 1 < bytes.length ? chars[((b2 & 15) << 2) | (b3 >> 6)] : '=';
    result += i + 2 < bytes.length ? chars[b3 & 63] : '=';
  }
  return result;
}

Page({
  data: {
    tab: 0,
    coinResult: '',
    flipping: false,
    optionsText: '火锅,烧烤,日料,面食',
    options: ['火锅', '烧烤', '日料', '面食'],
    spinResult: '',
    lotCount: 1,
    lotResults: [],
    importing: false,
    importName: '',
  },

  onTab(e) {
    this.setData({ tab: Number(e.currentTarget.dataset.tab) });
  },

  onOptionsInput(e) {
    const options = e.detail.value.split(/[,，\n]/).filter(s => s.trim());
    this.setData({ optionsText: e.detail.value, options, spinResult: '', lotResults: [], importName: '' });
  },

  decCount() {
    if (this.data.lotCount > 1) this.setData({ lotCount: this.data.lotCount - 1 });
  },

  incCount() {
    if (this.data.lotCount < this.data.options.length) this.setData({ lotCount: this.data.lotCount + 1 });
  },

  /* ---------- 文件导入 ---------- */
  onImportFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xlsx', 'xls', 'docx', 'doc'],
      success: (res) => {
        const file = res.tempFiles[0];
        const name = file.name || '文件';
        this.setData({ importing: true, importName: name });

        // 读取文件为 base64
        const fs = wx.getFileSystemManager();
        fs.readFile({
          filePath: file.path,
          encoding: 'base64',
          success: (readRes) => {
            this._sendImport(readRes.data, name);
          },
          fail: (err) => {
            this.setData({ importing: false, importName: '' });
            wx.showToast({ title: '文件读取失败', icon: 'none' });
          }
        });
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '选择文件失败', icon: 'none' });
        }
      }
    });
  },

  _sendImport(fileData, fileName) {
    api.post('/random/import', {
      fileData: fileData,
      fileName: fileName,
    }).then(d => {
      const options = d.options || [];
      if (options.length === 0) {
        wx.showToast({ title: '文档中未找到有效选项', icon: 'none' });
        this.setData({ importing: false, importName: '' });
        return;
      }
      const optionsText = options.join(',');
      this.setData({
        optionsText,
        options,
        spinResult: '',
        lotResults: [],
        importing: false,
        importName: fileName,
        lotCount: 1,
      });
      wx.showToast({ title: `已导入 ${options.length} 个选项`, icon: 'success' });
    }).catch(err => {
      this.setData({ importing: false, importName: '' });
      const msg = (err && err.message) || '导入失败';
      wx.showToast({ title: msg, icon: 'none', duration: 2500 });
    });
  },

  /* ---------- 原有功能 ---------- */
  flipCoin() {
    if (this.data.flipping) return;
    this.setData({ flipping: true, coinResult: '' });
    api.post('/random/coin', {})
      .then(d => {
        setTimeout(() => this.setData({ coinResult: d.result, flipping: false }), 900);
      })
      .catch(err => {
        this.setData({ flipping: false });
        wx.showToast({ title: (err && err.message) || '失败', icon: 'none' });
      });
  },

  spin() {
    if (this.data.options.length < 2) {
      wx.showToast({ title: '至少两个选项', icon: 'none' });
      return;
    }
    this.setData({ spinResult: '' });
    api.post('/random/spin', { options: this.data.options })
      .then(d => this.setData({ spinResult: d.result }))
      .catch(err => wx.showToast({ title: (err && err.message) || '失败', icon: 'none' }));
  },

  drawLot() {
    if (this.data.options.length < 1) {
      wx.showToast({ title: '请提供候选名单', icon: 'none' });
      return;
    }
    if (this.data.lotCount > this.data.options.length) {
      wx.showToast({ title: '抽取数量超过候选数量', icon: 'none' });
      return;
    }
    this.setData({ lotResults: [] });
    api.post('/random/lottery', { options: this.data.options, count: this.data.lotCount })
      .then(d => this.setData({ lotResults: d.results || [] }))
      .catch(err => wx.showToast({ title: (err && err.message) || '失败', icon: 'none' }));
  }
});