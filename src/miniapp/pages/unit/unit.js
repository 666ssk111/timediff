// pages/unit/unit.js —— 单位换算（调用后端 /unit/convert）
const api = require('../../utils/api.js');

// 分类与单位（用于前端选择 UI，换算逻辑交给后端）
const CATEGORIES = [
  { key: 'length', name: '长度', icon: '📏', units: ['米', '千米', '厘米', '毫米', '英里', '英尺', '英寸'] },
  { key: 'weight', name: '重量', icon: '⚖️', units: ['千克', '克', '吨', '斤', '磅'] },
  { key: 'storage', name: '存储', icon: '💾', units: ['B', 'KB', 'MB', 'GB', 'TB'] },
  { key: 'temperature', name: '温度', icon: '🌡️', units: ['摄氏度', '华氏度', '开尔文'] }
];

Page({
  data: {
    categories: CATEGORIES,
    categoryIndex: 0,
    units: CATEGORIES[0].units,
    fromIndex: 0,
    toIndex: 1,
    value: '',
    result: '',
    resultUnit: '',
    formula: ''
  },

  onCategoryTap(e) {
    const i = Number(e.currentTarget.dataset.index);
    this.setData({
      categoryIndex: i,
      units: CATEGORIES[i].units,
      fromIndex: 0,
      toIndex: 1,
      value: '',
      result: '',
      resultUnit: '',
      formula: ''
    });
  },

  onFromChange(e) {
    this.setData({ fromIndex: Number(e.detail.value), result: '', resultUnit: '', formula: '' });
  },

  onToChange(e) {
    this.setData({ toIndex: Number(e.detail.value), result: '', resultUnit: '', formula: '' });
  },

  swap() {
    const { fromIndex, toIndex } = this.data;
    this.setData({ fromIndex: toIndex, toIndex: fromIndex, result: '', resultUnit: '', formula: '' });
  },

  onValueInput(e) {
    this.setData({ value: e.detail.value, result: '', resultUnit: '', formula: '' });
  },

  convert() {
    const { categories, categoryIndex, units, fromIndex, toIndex, value } = this.data;
    if (value === '' || value === null) {
      wx.showToast({ title: '请输入数值', icon: 'none' });
      return;
    }
    const num = Number(value);
    if (isNaN(num)) {
      wx.showToast({ title: '请输入有效数字', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '换算中...' });
    api.post('/unit/convert', {
      category: categories[categoryIndex].key,
      value: num,
      from: units[fromIndex],
      to: units[toIndex]
    }).then(data => {
      wx.hideLoading();
      const resultStr = data.result;
      const resultUnit = data.unit;
      this.setData({
        result: resultStr,
        resultUnit: resultUnit,
        formula: `${value} ${units[fromIndex]} = ${resultStr} ${resultUnit}`
      });
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '换算失败', icon: 'none' });
    });
  }
});
