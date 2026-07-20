const storage = require('../../utils/storage');
const auth = require('../../utils/auth');
const userApi = require('../../services/user-api');
const Toast = require('tdesign-miniprogram/toast/index');

Page({
  data: {
    avatarUrl: '',
    nickname: '',
    loading: false,
    submitting: false,
    authError: false,
  },

  _redirect: '',

  onLoad(options) {
    this._redirect = options.redirect ? decodeURIComponent(options.redirect) : '/pages/home/home';

    // If already logged in, skip login
    if (auth.isLoggedIn()) {
      this._checkTokenAndRedirect();
    }
  },

  _checkTokenAndRedirect() {
    this.setData({ loading: true });
    userApi.checkToken().then(() => {
      const app = getApp();
      app.globalData.isLoggedIn = true;
      this._navigateAfterLogin();
    }).catch(() => {
      storage.removeToken();
      this.setData({ loading: false });
    });
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({ avatarUrl, authError: false });
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value, authError: false });
  },

  onFormSubmit(e) {
    const { nickname } = e.detail.value;
    const { avatarUrl } = this.data;

    if (!avatarUrl || !nickname) {
      this.setData({ authError: true });
      return;
    }

    this.setData({ submitting: true });

    wx.login({
      success: (res) => {
        if (!res.code) {
          Toast({ context: this, selector: '#t-toast', message: '获取微信授权失败，请重试', theme: 'error' });
          this.setData({ submitting: false });
          return;
        }

        userApi.login({ code: res.code, avatarUrl, nickname }).then(data => {
          storage.setToken(data.token);
          storage.setUserInfo({ avatarUrl, nickname });
          const app = getApp();
          app.globalData.isLoggedIn = true;
          app.globalData.userInfo = { avatarUrl, nickname };
          this._navigateAfterLogin();
        }).catch(err => {
          Toast({ context: this, selector: '#t-toast', message: err.message || '登录失败，请重试', theme: 'error' });
          this.setData({ submitting: false });
        });
      },
      fail: () => {
        Toast({ context: this, selector: '#t-toast', message: '获取微信授权失败，请重试', theme: 'error' });
        this.setData({ submitting: false });
      },
    });
  },

  onGuestLogin() {
    const app = getApp();
    app.globalData.isLoggedIn = false;
    wx.redirectTo({ url: '/pages/home/home' });
  },

  onRetryAuth() {
    this.setData({ authError: false });
  },

  _navigateAfterLogin() {
    const redirect = this._redirect;
    this.setData({ submitting: false, loading: false });
    wx.redirectTo({ url: redirect });
  },
});
