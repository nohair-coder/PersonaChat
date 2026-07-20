const KEYS = {
  TOKEN: 'auth_token',
  TOKEN_STORED_AT: 'auth_token_stored_at',
  USER_INFO: 'user_info',
};

function get(key) {
  try {
    return wx.getStorageSync(key);
  } catch (e) {
    return null;
  }
}

function set(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {
    // storage write failed silently
  }
}

function remove(key) {
  try {
    wx.removeStorageSync(key);
  } catch (e) {
    // ignore
  }
}

function getToken() {
  return get(KEYS.TOKEN);
}

function setToken(token) {
  set(KEYS.TOKEN, token);
  set(KEYS.TOKEN_STORED_AT, Date.now());
}

function removeToken() {
  remove(KEYS.TOKEN);
  remove(KEYS.TOKEN_STORED_AT);
}

function getTokenStoredAt() {
  return get(KEYS.TOKEN_STORED_AT) || 0;
}

function getUserInfo() {
  return get(KEYS.USER_INFO);
}

function setUserInfo(info) {
  set(KEYS.USER_INFO, info);
}

function removeUserInfo() {
  remove(KEYS.USER_INFO);
}

module.exports = {
  KEYS,
  get,
  set,
  remove,
  getToken,
  setToken,
  removeToken,
  getTokenStoredAt,
  getUserInfo,
  setUserInfo,
  removeUserInfo,
};
