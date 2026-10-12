// pages/tax/tax.js —— 个税计算器（调用后端 /tax/calc）
const api = require('../../utils/api.js');

// 专项附加扣除项（用于前端勾选与求和）
const DEDUCTION_ITEMS = [
  { key: 'children_edu', name: '子女教育', desc: '2000元/孩/月', value: 2000 },
  { key: 'infant_care',  name: '婴幼儿照护', desc: '2000元/孩/月', value: 2000 },
  { key: 'elder',        name: '赡养老人', desc: '3000元/月(独生)', value: 3000 },
  { key: 'housing_loan', name: '房贷利息', desc: '1000元/月', value: 1000 },
  { key: 'housing_rent', name: '住房租金', desc: '最高1500元/月', value: 1500 },
  { key: 'continue_edu', name: '继续教育', desc: '400元/月', value: 400 }
];

function fmtMoney(s) {
  const n = Number(s);
  if (isNaN(n)) return String(s);
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

Page({
  data: {
    monthlyIncome: '',
    socialInsurance: '',
    months: 12,
    annualBonus: '',
    deductions: DEDUCTION_ITEMS,
    result: null
  },

  onLoad() {
    this.setData({ deductions: DEDUCTION_ITEMS });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  onMonthChange(e) {
    this.setData({ months: e.detail.value });
  },

  onToggleDeduction(e) {
    const key = e.currentTarget.dataset.key;
    const deductions = this.data.deductions.map(d =>
      d.key === key ? Object.assign({}, d, { checked: !d.checked }) : d
    );
    this.setData({ deductions });
  },

  calcTax() {
    const monthlyIncome = parseFloat(this.data.monthlyIncome);
    if (isNaN(monthlyIncome) || monthlyIncome <= 0) {
      wx.showToast({ title: '请输入有效的税前月薪', icon: 'none' });
      return;
    }

    const social = parseFloat(this.data.socialInsurance) || 0;
    const months = parseInt(this.data.months) || 12;
    const bonus = parseFloat(this.data.annualBonus) || 0;

    let totalDeduction = 0;
    const activeDeductions = [];
    this.data.deductions.forEach(d => {
      if (d.checked) {
        totalDeduction += d.value;
        activeDeductions.push(d.name);
      }
    });

    wx.showLoading({ title: '计算中...' });
    api.post('/tax/calc', {
      monthly_income: monthlyIncome,
      social_insurance: social,
      special_deduction: totalDeduction,
      months: months,
      annual_bonus: bonus
    }).then(data => {
      wx.hideLoading();
      const rateNum = parseFloat(data.tax_rate) || 0;
      const annualTax = Number(data.tax) || 0;
      const bonusTax = Number(data.annual_bonus_tax) || 0;

      this.setData({
        result: {
          takeHomeStr: fmtMoney(data.take_home),
          annualTaxStr: fmtMoney(data.tax),
          bonusTaxStr: fmtMoney(data.annual_bonus_tax),
          totalTaxStr: fmtMoney(annualTax + bonusTax),
          taxableStr: fmtMoney(data.taxable_income),
          rate: (rateNum * 100).toFixed(0) + '%',
          deductions: activeDeductions.join('、') || '无',
          months: months
        }
      });
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '计算失败', icon: 'none' });
    });
  }
});
