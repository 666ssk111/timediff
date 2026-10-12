// pages/base/base.js —— 进制转换（调用后端 /base/convert）
const api = require('../../utils/api.js');

// 进制选项 2~36
const BASES = [];
for (let i = 2; i <= 36; i++) {
  let name;
  if (i === 2) name = '二进制 (2)';
  else if (i === 8) name = '八进制 (8)';
  else if (i === 10) name = '十进制 (10)';
  else if (i === 16) name = '十六进制 (16)';
  else name = `${i} 进制`;
  BASES.push({ key: i, name });
}

Page({
  data: {
    value: '',
    fromBase: 10,
    toBase: 16,
    bases: BASES,
    fromIndex: 8,   // 十进制在 BASES 中下标 (2 对应 0，10 对应 8)
    toIndex: 14,    // 十六进制下标 (16 对应 14)
    result: null
  },

  onValueInput(e) {
    this.setData({ value: e.detail.value, result: null });
  },

  onFromChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ fromIndex: idx, fromBase: BASES[idx].key, result: null });
  },

  onToChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ toIndex: idx, toBase: BASES[idx].key, result: null });
  },

  swap() {
    const fromIndex = this.data.toIndex;
    const toIndex = this.data.fromIndex;
    this.setData({
      fromIndex,
      toIndex,
      fromBase: BASES[fromIndex].key,
      toBase: BASES[toIndex].key,
      result: null
    });
  },

  convert() {
    const { value, fromBase, toBase } = this.data;
    if (!value || !value.trim()) {
      wx.showToast({ title: '请输入数值', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '转换中...' });
    api.post('/base/convert', {
      value: value.trim(),
      from_base: fromBase,
      to_base: toBase
    }).then(data => {
      wx.hideLoading();
      this.setData({
        result: {
          targetStr: data.result,
          decimalStr: data.decimal,
          binaryStr: data.binary,
          octalStr: data.octal,
          hexStr: data.hex,
          fromBase,
          toBase
        }
      });
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '转换失败', icon: 'none' });
    });
  }
});
