const storage = require('./storage');

const BASE_URL = 'https://YOUR_API_BASE_URL';
const TIMEOUT = 10000;

// Endpoints exempt from 401 redirect (to prevent login loop)
const AUTH_EXEMPT_PATHS = ['/api/user/login', '/api/user/check'];

// Prevent multiple concurrent 401 redirects
let _handling401 = false;

function _handle401() {
  if (_handling401) return;
  _handling401 = true;
  // Delegate to auth module's unified session-expiry handler (U9)
  // Lazy-require to avoid circular dependency at module load time
  const auth = require('./auth');
  auth.handleSessionExpired().finally(() => {
    _handling401 = false;
  });
}

function request(options) {
  const { url, method = 'GET', data, skipAuth = false } = options;
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;

  const token = storage.getToken();
  const header = { 'Content-Type': 'application/json' };
  if (token && !skipAuth) {
    header['Authorization'] = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: fullUrl,
      method,
      data,
      header,
      timeout: TIMEOUT,
      success(res) {
        const { statusCode, data: resData } = res;

        if (statusCode === 401) {
          const isAuthExempt = AUTH_EXEMPT_PATHS.some(path => url.includes(path));
          if (!isAuthExempt) {
            _handle401();
          }
          reject({ code: 401, message: '登录已过期，请重新登录' });
          return;
        }

        if (statusCode >= 200 && statusCode < 300) {
          // Business-level error (e.g., { code: 1, message: '...' })
          if (resData && resData.code !== undefined && resData.code !== 0 && resData.code !== 200) {
            reject({ code: resData.code, message: resData.message || '请求失败' });
            return;
          }
          resolve(resData);
          return;
        }

        reject({ code: statusCode, message: `服务器错误 (${statusCode})` });
      },
      fail(err) {
        // Transport layer failure: timeout, no network, etc.
        if (err.errMsg && err.errMsg.includes('timeout')) {
          reject({ code: 'TIMEOUT', message: '请求超时，请检查网络后重试' });
        } else {
          reject({ code: 'NETWORK', message: '网络连接失败，请检查网络设置' });
        }
      },
    });
  });
}

function get(url, data, options = {}) {
  return request({ url, method: 'GET', data, ...options });
}

function post(url, data, options = {}) {
  return request({ url, method: 'POST', data, ...options });
}

function put(url, data, options = {}) {
  return request({ url, method: 'PUT', data, ...options });
}

function del(url, data, options = {}) {
  return request({ url, method: 'DELETE', data, ...options });
}

module.exports = { request, get, post, put, del };
