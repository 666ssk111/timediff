// utils/api.js —— 统一请求封装
// 支持两种模式：
//   USE_LOCAL = true   -> 本地联调，通过 wx.request 访问 http://127.0.0.1:3000
//   USE_LOCAL = false  -> 生产环境，通过 wx.cloud.callContainer 访问云托管
// const USE_LOCAL = true;                 // 本地联调开关
const USE_LOCAL = false;
const LOCAL_BASE_URL = 'http://127.0.0.1:3000';

const ENV = 'prod-d7gbnxjit907040e0';   // 云环境 ID
const SERVICE = 'flask-ga47';            // 云托管服务名

function request(path, method, data) {
  return new Promise((resolve, reject) => {
    if (USE_LOCAL) {
      // 本地联调：直连 Flask 后端
      wx.request({
        url: LOCAL_BASE_URL + path,
        method: method || 'GET',
        data: data || {},
        header: { 'content-type': 'application/json' },
        success: (res) => {
          const body = res.data || {};
          if (body.code === 0) {
            resolve(body.data);
          } else {
            reject(new Error(body.message || '请求失败'));
          }
        },
        fail: (err) => {
          // wx.request fail 回调返回 {errMsg, ...}，提取可读错误信息
          const msg = (err && err.errMsg) || (err && err.message) || '网络请求失败';
          reject(new Error(msg));
        }
      });
    } else {
      // 生产环境：云托管
      wx.cloud.callContainer({
        config: { env: ENV },
        path: path,
        method: method || 'GET',
        header: { 'X-WX-SERVICE': SERVICE, 'content-type': 'application/json' },
        data: data || {},
        dataType: 'json',
        success: (res) => {
          const body = res.data || {};
          if (body.code === 0) {
            resolve(body.data);
          } else {
            reject(new Error(body.message || '请求失败'));
          }
        },
        fail: (err) => {
          const msg = (err && err.errMsg) || (err && err.message) || '云托管请求失败';
          reject(new Error(msg));
        }
      });
    }
  });
}

module.exports = {
  get: (path, data) => request(path, 'GET', data),
  post: (path, data) => request(path, 'POST', data)
};
