App({
  globalData: {
    isLoggedIn: false,
    userInfo: null,
  },

  onLaunch() {
    const auth = require('./utils/auth');
    auth.checkAndRestoreSession();
  },

  onShow() {
    const auth = require('./utils/auth');
    auth.proactiveTokenRenewal();
  },
});
