// pages/mortgage/mortgage.js —— 房贷计算器（调用后端 /mortgage/calc）
const api = require('../../utils/api.js');

function fmtMoney(s) {
  const n = Number(s);
  if (isNaN(n)) return String(s);
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

Page({
  data: {
    principal: '',          // 贷款金额（万元）
    years: 30,              // 贷款年限
    rate: '3.5',            // 年利率 %（默认 LPR）
    method: 'equal_payment',// equal_payment 等额本息 / equal_principal 等额本金
    yearOptions: [5, 10, 15, 20, 25, 30],
    result: null,
    schedule: [],
    showDetail: false
  },

  onPrincipalInput(e) {
    this.setData({ principal: e.detail.value });
  },

  onRateInput(e) {
    this.setData({ rate: e.detail.value });
  },

  onYearChange(e) {
    this.setData({ years: this.data.yearOptions[e.detail.value] });
  },

  setMethod(e) {
    this.setData({ method: e.currentTarget.dataset.method });
  },

  toggleDetail() {
    this.setData({ showDetail: !this.data.showDetail });
  },

  calc() {
    const principalWan = parseFloat(this.data.principal);
    if (isNaN(principalWan) || principalWan <= 0) {
      wx.showToast({ title: '请输入贷款金额', icon: 'none' });
      return;
    }
    const rate = parseFloat(this.data.rate);
    if (isNaN(rate) || rate < 0 || rate > 20) {
      wx.showToast({ title: '请输入合理的年利率', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '计算中...' });
    api.post('/mortgage/calc', {
      principal: principalWan * 10000,   // 前端单位为万元，后端单位为元
      years: this.data.years,
      annual_rate: rate,
      method: this.data.method
    }).then(data => {
      wx.hideLoading();
      const isEqual = this.data.method === 'equal_payment';
      const schedule = (data.schedule || []).map(item => ({
        month: item.month,
        paymentStr: fmtMoney(item.payment),
        interestStr: fmtMoney(item.interest),
        balanceStr: fmtMoney(item.balance)
      }));
      const lastPayment = schedule.length > 0 ? schedule[schedule.length - 1].paymentStr : '';

      this.setData({
        result: {
          methodName: isEqual ? '等额本息' : '等额本金',
          monthlyLabel: isEqual ? '每月月供' : '首月月供',
          monthlyStr: fmtMoney(data.monthly_payment),
          lastStr: isEqual ? '' : lastPayment,
          totalInterestStr: fmtMoney(data.total_interest),
          totalPaymentStr: fmtMoney(data.total_payment),
          months: data.months
        },
        schedule,
        showDetail: false
      });
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '计算失败', icon: 'none' });
    });
  }
});
