const auth = require('../../utils/auth');
const storage = require('../../utils/storage');
const sessionApi = require('../../services/session-api');
const userApi = require('../../services/user-api');
const Toast = require('tdesign-miniprogram/toast/index');

function formatRelativeTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
}

Page({
  data: {
    isLoggedIn: false,
    userInfo: {},
    sessions: [],
    loadingSessions: false,
    editingNickname: false,
    nicknameInput: '',
    showDeleteDialog: false,
    deleteConfirmBtn: { content: '确认删除', theme: 'danger' },
    deleteCancelBtn: { content: '取消', theme: 'default' },
  },

  _pendingDeleteId: null,

  onLoad() {
    this._syncLoginState();
  },

  onShow() {
    this._syncLoginState();
  },

  _syncLoginState() {
    const isLoggedIn = auth.isLoggedIn();
    const userInfo = storage.getUserInfo() || {};
    this.setData({ isLoggedIn, userInfo });

    if (isLoggedIn) {
      this._loadSessions();
    }
  },

  _loadSessions() {
    this.setData({ loadingSessions: true });
    sessionApi.getSessionList().then(data => {
      const raw = (data && data.sessions) ? data.sessions : [];
      const sessions = raw.map(s => ({
        ...s,
        updated_at_str: formatRelativeTime(s.updated_at),
      }));
      this.setData({ sessions, loadingSessions: false });
    }).catch(() => {
      Toast({ context: this, selector: '#t-toast', message: '加载会话列表失败', theme: 'error' });
      this.setData({ loadingSessions: false });
    });
  },

  onSessionTap(e) {
    const session = e.currentTarget.dataset.session;
    const url = `/subpackages/chat/pages/chat/chat?personaId=${session.persona_id}&sessionId=${session.session_id}`;
    wx.navigateTo({ url });
  },

  onDeleteSession(e) {
    const { id } = e.currentTarget.dataset;
    this._pendingDeleteId = id;
    this.setData({ showDeleteDialog: true });
  },

  onConfirmDelete() {
    const id = this._pendingDeleteId;
    this.setData({ showDeleteDialog: false });
    if (!id) return;

    sessionApi.deleteSession(id).then(() => {
      const sessions = this.data.sessions.filter(s => s.session_id !== id);
      this.setData({ sessions });
      Toast({ context: this, selector: '#t-toast', message: '已删除', theme: 'success' });
    }).catch(() => {
      Toast({ context: this, selector: '#t-toast', message: '删除失败，请重试', theme: 'error' });
    }).finally(() => {
      this._pendingDeleteId = null;
    });
  },

  onCancelDelete() {
    this._pendingDeleteId = null;
    this.setData({ showDeleteDialog: false });
  },

  onStartEditNickname() {
    this.setData({ editingNickname: true, nicknameInput: this.data.userInfo.nickname || '' });
  },

  onNicknameInputChange(e) {
    this.setData({ nicknameInput: e.detail.value });
  },

  onCancelEditNickname() {
    this.setData({ editingNickname: false });
  },

  onSaveNickname() {
    const nickname = (this.data.nicknameInput || '').trim();
    if (!nickname) {
      Toast({ context: this, selector: '#t-toast', message: '昵称不能为空', theme: 'warning' });
      return;
    }
    userApi.updateProfile({ nickname }).then(() => {
      const userInfo = { ...this.data.userInfo, nickname };
      storage.setUserInfo(userInfo);
      getApp().globalData.userInfo = userInfo;
      this.setData({ userInfo, editingNickname: false });
      Toast({ context: this, selector: '#t-toast', message: '昵称已更新', theme: 'success' });
    }).catch(() => {
      Toast({ context: this, selector: '#t-toast', message: '保存失败，请重试', theme: 'error' });
    });
  },

  onLogin() {
    wx.navigateTo({ url: '/pages/login/login?redirect=/pages/me/me' });
  },

  onLogout() {
    auth.handleSessionExpired('/pages/home/home');
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/home/home' });
  },

  onAbout() {
    wx.navigateTo({ url: '/pages/about/about' });
  },

  onPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  onTerms() {
    wx.navigateTo({ url: '/pages/terms/terms' });
  },
});
