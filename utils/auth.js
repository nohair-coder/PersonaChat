const storage = require('./storage');

// 6 days in ms — proactive renewal threshold (token valid for 7 days)
const RENEWAL_THRESHOLD_MS = 6 * 24 * 60 * 60 * 1000;

function isLoggedIn() {
  return !!storage.getToken();
}

/**
 * Called on app launch to check existing token and set global state.
 */
function checkAndRestoreSession() {
  const token = storage.getToken();
  if (!token) return;
  try {
    const app = getApp();
    if (app) app.globalData.isLoggedIn = true;
  } catch (e) {
    // getApp() may not be available at very early lifecycle
  }
}

/**
 * Reusable auth guard. If user is logged in, navigates to targetUrl.
 * If not, navigates to login page with redirect param.
 */
function requireAuth(targetUrl) {
  if (isLoggedIn()) {
    wx.navigateTo({ url: targetUrl });
  } else {
    const encoded = encodeURIComponent(targetUrl);
    wx.navigateTo({ url: `/pages/login/login?redirect=${encoded}` });
  }
}

/**
 * Unified session-expiry handler used by both REST 401 (request.js)
 * and WebSocket auth failure (socket.js).
 *
 * Execution order (U9):
 * 1. Clear token + userInfo from storage
 * 2. Clear per-persona chat message cache (prevents cross-account data leakage)
 * 3. Clear persisted session_ids (prevents account A's session from being reused by account B)
 * 4. Close any active WebSocket
 * 5. Update app globalData
 * 6. Navigate to login, preserving intended return destination
 */
function handleSessionExpired(redirectUrl) {
  storage.removeToken();
  storage.removeUserInfo();

  // Clear per-persona in-memory chat cache
  const chatCache = require('./chat-cache');
  chatCache.clearAll();

  // Clear persisted per-persona session_ids stored in wx.storage
  // Keys follow pattern: session_id_<personaId>
  try {
    const keys = wx.getStorageInfoSync().keys || [];
    keys.filter(k => k.startsWith('session_id_')).forEach(k => {
      wx.removeStorageSync(k);
    });
  } catch (e) {
    // ignore
  }

  // Close any active WebSocket (prevents stale socket reconnecting with old token)
  try {
    const socket = require('./socket');
    socket.close();
  } catch (e) {
    // socket module may not be loaded yet
  }

  // Update app global state
  try {
    const app = getApp();
    if (app) {
      app.globalData.isLoggedIn = false;
      app.globalData.userInfo = null;
    }
  } catch (e) {
    // ignore
  }

  // Navigate to login, preserving intended destination
  let target = redirectUrl;
  if (!target) {
    try {
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      target = current ? `/${current.route}` : '/pages/home/home';
    } catch (e) {
      target = '/pages/home/home';
    }
  }

  const encoded = encodeURIComponent(target);
  wx.reLaunch({ url: `/pages/login/login?redirect=${encoded}` });

  return Promise.resolve();
}

/**
 * Called from App.onShow — proactively renews token if close to expiry.
 * Deferred assumption: POST /api/user/login accepts code-only (no avatar/nickname required).
 * If backend requires avatar/nickname every call, this silent flow won't work — confirm before shipping.
 */
function proactiveTokenRenewal() {
  if (!isLoggedIn()) return;

  const storedAt = storage.getTokenStoredAt();
  const age = Date.now() - storedAt;
  if (age < RENEWAL_THRESHOLD_MS) return;

  wx.login({
    success(res) {
      if (!res.code) return;
      const userApi = require('../services/user-api');
      userApi.login({ code: res.code }).then(data => {
        if (data && data.token) {
          storage.setToken(data.token);
        }
      }).catch(() => {
        // Silent failure — falls back to passive 401 handling
      });
    },
  });
}

module.exports = {
  isLoggedIn,
  requireAuth,
  handleSessionExpired,
  checkAndRestoreSession,
  proactiveTokenRenewal,
};
