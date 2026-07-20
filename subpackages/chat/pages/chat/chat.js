const socket = require('../../../../utils/socket');
const sessionApi = require('../../../../services/session-api');
const chatCache = require('../../../../utils/chat-cache');
const storage = require('../../../../utils/storage');
const characterApi = require('../../../../services/character-api');
const Toast = require('tdesign-miniprogram/toast/index');

// Deferred assumption: 0=success, 1=content filtered. Confirm with backend before hardcoding.
const WS_CODE_SUCCESS = 0;
const WS_CODE_FILTERED = 1;

// Timeout for "thinking" state before showing send-failure (ms). Product decision deferred — using 30s default.
const THINKING_TIMEOUT_MS = 30000;

let _idCounter = 0;
function genId() { return 'msg-' + Date.now() + '-' + (++_idCounter); }

function formatTime(date) {
  const d = date || new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

Page({
  data: {
    personaId: '',
    personaInfo: {},
    personaOffline: false,
    loading: true,
    messages: [],
    inputText: '',
    sending: false,
    socketState: 'idle',
    scrollIntoView: '',
    scrollTop: 0,
    loadingHistory: false,
    historyEnd: false,
    userAvatarUrl: '',
  },

  _sessionId: '',
  _unsubscribeState: null,
  _unsubscribeMessage: null,
  _thinkingTimer: null,
  _pendingMessageId: null,
  _sendDebounceTimer: null,
  _historyPage: 0,

  onLoad(options) {
    const { personaId } = options;
    if (!personaId) {
      this._showOffline();
      return;
    }

    const userInfo = storage.getUserInfo();
    this.setData({
      personaId,
      userAvatarUrl: userInfo ? userInfo.avatarUrl : '',
    });

    this._sessionId = this._getOrCreateSessionId(personaId);
    this._initMessages(personaId);
    this._subscribeSocket();
    this._validateAndConnect(personaId);
  },

  onUnload() {
    this._cleanUp();
    socket.close();
  },

  _getOrCreateSessionId(personaId) {
    const key = `session_id_${personaId}`;
    let sid = wx.getStorageSync(key);
    if (!sid) {
      sid = `${personaId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      wx.setStorageSync(key, sid);
    }
    return sid;
  },

  _initMessages(personaId) {
    const cached = chatCache.getMessages(personaId);
    this.setData({ messages: cached });
    if (cached.length > 0) {
      this._scrollToBottom();
    }
  },

  _validateAndConnect(personaId) {
    characterApi.getInfo(personaId).then(data => {
      if (!data || !data.character) {
        this._showOffline();
        return;
      }
      this.setData({ personaInfo: data.character, loading: false });
      wx.setNavigationBarTitle({ title: data.character.name || '聊天' });
      socket.connect(personaId, this._sessionId);
    }).catch(() => {
      this._showOffline();
    });
  },

  _showOffline() {
    this.setData({ personaOffline: true, loading: false });
  },

  _subscribeSocket() {
    this._unsubscribeState = socket.onStateChange(state => {
      this.setData({ socketState: state });

      // Handle auth failure: backend closes socket with a specific close code
      // We treat 'closed' after being 'open' as potential auth failure — U9 handles the full check
    });

    this._unsubscribeMessage = socket.onMessage(msg => {
      this._handleIncomingMessage(msg);
    });
  },

  _handleIncomingMessage(msg) {
    // Cancel thinking timer
    if (this._thinkingTimer) {
      clearTimeout(this._thinkingTimer);
      this._thinkingTimer = null;
    }

    // Remove thinking indicator
    const messages = this.data.messages.filter(m => m.role !== 'thinking');
    this._pendingMessageId = null;

    const code = (msg && msg.code !== undefined) ? msg.code : WS_CODE_SUCCESS;
    const isFiltered = code === WS_CODE_FILTERED;

    if (isFiltered || !msg || !msg.reply) {
      // Content filtered — show placeholder system bubble
      const systemMsg = {
        id: genId(),
        role: 'system',
        content: '该消息内容不符合社区规范，无法展示。',
        timeStr: formatTime(),
      };
      messages.push(systemMsg);
    } else {
      const aiMsg = {
        id: genId(),
        role: 'assistant',
        content: msg.reply,
        timeStr: formatTime(),
      };
      messages.push(aiMsg);
    }

    this.setData({ messages, sending: false });
    chatCache.setMessages(this.data.personaId, messages);
    this._scrollToBottom();
  },

  _scrollToBottom() {
    this.setData({ scrollIntoView: 'chat-bottom' });
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  onSend() {
    // Debounce
    if (this._sendDebounceTimer) return;
    this._sendDebounceTimer = setTimeout(() => { this._sendDebounceTimer = null; }, 500);

    const text = (this.data.inputText || '').trim();
    if (!text) return;
    if (this.data.sending) return;
    if (this.data.socketState !== 'open') {
      Toast({ context: this, selector: '#t-toast', message: '连接中，请稍候', theme: 'warning' });
      return;
    }

    const userMsg = {
      id: genId(),
      role: 'user',
      content: text,
      timeStr: formatTime(),
      status: 'sent',
    };

    const thinkingMsg = {
      id: genId(),
      role: 'thinking',
      content: '',
      timeStr: '',
    };

    const messages = [...this.data.messages, userMsg, thinkingMsg];
    this._pendingMessageId = userMsg.id;

    this.setData({ messages, inputText: '', sending: true });
    chatCache.setMessages(this.data.personaId, messages);
    this._scrollToBottom();

    socket.send({ message: text, session_id: this._sessionId });

    // Thinking timeout — convert to failure state
    this._thinkingTimer = setTimeout(() => {
      this._thinkingTimer = null;
      const current = this.data.messages;
      const updated = current
        .filter(m => m.role !== 'thinking')
        .map(m => m.id === userMsg.id ? { ...m, status: 'failed' } : m);
      this.setData({ messages: updated, sending: false });
      chatCache.setMessages(this.data.personaId, updated);
    }, THINKING_TIMEOUT_MS);
  },

  onRetryMessage(e) {
    const { id } = e.currentTarget.dataset;
    const msg = this.data.messages.find(m => m.id === id);
    if (!msg) return;
    // Re-set input text and remove the failed message
    const updated = this.data.messages.filter(m => m.id !== id);
    this.setData({ messages: updated, inputText: msg.content });
    chatCache.setMessages(this.data.personaId, updated);
  },

  onScrollToUpper() {
    // Delegate to U7 history loading
    if (this.data.loadingHistory || this.data.historyEnd) return;
    this._loadHistory();
  },

  _loadHistory() {
    this.setData({ loadingHistory: true });
    const currentPage = (this._historyPage || 1);
    sessionApi.getHistoryMessages(this._sessionId, currentPage + 1).then(data => {
      const items = (data && data.messages) ? data.messages : [];
      if (items.length === 0) {
        this.setData({ historyEnd: true, loadingHistory: false });
        return;
      }
      const mapped = items.map(m => ({
        id: genId(),
        role: m.role || 'user',
        content: m.content,
        timeStr: m.created_at ? formatTime(new Date(m.created_at)) : '',
        status: 'sent',
      }));
      this._historyPage = currentPage + 1;
      const messages = [...mapped, ...this.data.messages];
      this.setData({ messages, loadingHistory: false });
      chatCache.setMessages(this.data.personaId, messages);
      // Restore scroll position to first message before prepend
      if (mapped.length > 0) {
        this.setData({ scrollIntoView: `msg-${this.data.messages[mapped.length] ? this.data.messages[mapped.length].id : ''}` });
      }
    }).catch(() => {
      Toast({ context: this, selector: '#t-toast', message: '加载历史消息失败', theme: 'error' });
      this.setData({ loadingHistory: false });
    });
  },

  onManualReconnect() {
    socket.connect(this.data.personaId, this._sessionId);
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  _cleanUp() {
    if (this._unsubscribeState) { this._unsubscribeState(); this._unsubscribeState = null; }
    if (this._unsubscribeMessage) { this._unsubscribeMessage(); this._unsubscribeMessage = null; }
    if (this._thinkingTimer) { clearTimeout(this._thinkingTimer); this._thinkingTimer = null; }
    if (this._sendDebounceTimer) { clearTimeout(this._sendDebounceTimer); this._sendDebounceTimer = null; }
  },
});
