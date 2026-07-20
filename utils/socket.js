const storage = require('../utils/storage');

const WS_BASE_URL = 'wss://YOUR_WS_BASE_URL/ws/chat';

const STATE = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  OPEN: 'open',
  RECONNECTING: 'reconnecting',
  CLOSED: 'closed',
};

const MAX_RETRIES = 10;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 25000;
const HEARTBEAT_TIMEOUT_MS = 10000;

let socketTask = null;
let state = STATE.IDLE;
let currentCharacterId = null;
let currentSessionId = null;

let retryCount = 0;
let lockReconnect = false;
let reconnectTimer = null;

let heartbeatTimer = null;
let heartbeatTimeoutTimer = null;

let stateChangeListeners = [];
let messageListeners = [];

function setState(newState) {
  if (state === newState) return;
  state = newState;
  stateChangeListeners.forEach(function (cb) {
    try { cb(newState); } catch (e) { console.error('[socket] stateChange listener error', e); }
  });
}

function getToken() {
  return storage.getToken() || '';
}

function buildUrl(characterId, sessionId) {
  const token = getToken();
  return (
    WS_BASE_URL +
    '?characterId=' + encodeURIComponent(characterId) +
    '&sessionId=' + encodeURIComponent(sessionId) +
    '&token=' + encodeURIComponent(token)
  );
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(function () {
    if (state !== STATE.OPEN) {
      stopHeartbeat();
      return;
    }
    sendRaw({ type: 'ping' });
    heartbeatTimeoutTimer = setTimeout(function () {
      console.warn('[socket] heartbeat pong timeout — treating as dead connection');
      triggerReconnect();
    }, HEARTBEAT_TIMEOUT_MS);
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (heartbeatTimeoutTimer !== null) {
    clearTimeout(heartbeatTimeoutTimer);
    heartbeatTimeoutTimer = null;
  }
}

function resetHeartbeatTimeout() {
  if (heartbeatTimeoutTimer !== null) {
    clearTimeout(heartbeatTimeoutTimer);
    heartbeatTimeoutTimer = null;
  }
}

// ─── Reconnect logic ──────────────────────────────────────────────────────────

function calcBackoff(attempt) {
  const jitter = Math.random() * 500;
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(2, attempt)) + jitter;
}

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function triggerReconnect() {
  if (lockReconnect) return;
  lockReconnect = true;

  stopHeartbeat();
  destroySocketTask();

  if (retryCount >= MAX_RETRIES) {
    console.error('[socket] max retries reached — giving up');
    setState(STATE.CLOSED);
    lockReconnect = false;
    return;
  }

  setState(STATE.RECONNECTING);
  const delay = calcBackoff(retryCount);
  retryCount += 1;
  console.info('[socket] reconnecting in ' + Math.round(delay) + 'ms (attempt ' + retryCount + ')');

  clearReconnectTimer();
  reconnectTimer = setTimeout(function () {
    lockReconnect = false;
    reconnectTimer = null;
    _doConnect(currentCharacterId, currentSessionId);
  }, delay);
}

// ─── Low-level socket task management ────────────────────────────────────────

function destroySocketTask() {
  if (socketTask) {
    socketTask.onOpen = null;
    socketTask.onMessage = null;
    socketTask.onClose = null;
    socketTask.onError = null;
    try { socketTask.close({ code: 1000 }); } catch (e) { /* best-effort */ }
    socketTask = null;
  }
}

function _doConnect(characterId, sessionId) {
  if (!characterId || !sessionId) {
    console.error('[socket] connect called without characterId/sessionId');
    return;
  }

  currentCharacterId = characterId;
  currentSessionId = sessionId;

  setState(state === STATE.RECONNECTING ? STATE.RECONNECTING : STATE.CONNECTING);

  const url = buildUrl(characterId, sessionId);

  const task = wx.connectSocket({
    url: url,
    fail: function (err) {
      console.error('[socket] wx.connectSocket fail', err);
      triggerReconnect();
    },
  });

  socketTask = task;

  task.onOpen(function () {
    console.info('[socket] connection open');
    retryCount = 0;
    setState(STATE.OPEN);
    startHeartbeat();
  });

  task.onMessage(function (res) {
    let data = res.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { /* leave as string */ }
    }

    // Handle pong to reset heartbeat timeout
    if (data && data.type === 'pong') {
      resetHeartbeatTimeout();
      return;
    }

    messageListeners.forEach(function (cb) {
      try { cb(data); } catch (e) { console.error('[socket] message listener error', e); }
    });
  });

  task.onClose(function (res) {
    console.info('[socket] connection closed', res);
    stopHeartbeat();
    if (state !== STATE.CLOSED) {
      triggerReconnect();
    }
  });

  task.onError(function (err) {
    console.error('[socket] connection error', err);
    stopHeartbeat();
    triggerReconnect();
  });
}

function sendRaw(payload) {
  if (!socketTask || state !== STATE.OPEN) return;
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  socketTask.send({
    data: data,
    fail: function (err) {
      console.error('[socket] send fail', err);
    },
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Open (or re-open) the WebSocket connection for the given character + session.
 * Safe to call when already open — it will close and reconnect cleanly.
 */
function connect(characterId, sessionId) {
  close();
  retryCount = 0;
  lockReconnect = false;
  _doConnect(characterId, sessionId);
}

/**
 * Send a JSON payload. Silently drops if not connected.
 */
function send(payload) {
  sendRaw(payload);
}

/**
 * Permanently close the connection and cancel all pending timers.
 * Safe to call multiple times.
 */
function close() {
  clearReconnectTimer();
  stopHeartbeat();
  lockReconnect = false;
  retryCount = 0;
  destroySocketTask();
  setState(STATE.CLOSED);
}

/**
 * Return the current state string.
 */
function getState() {
  return state;
}

/**
 * Register a callback invoked whenever state changes.
 * Returns an unsubscribe function.
 */
function onStateChange(cb) {
  stateChangeListeners.push(cb);
  return function () {
    stateChangeListeners = stateChangeListeners.filter(function (fn) { return fn !== cb; });
  };
}

/**
 * Register a callback invoked on every inbound message (excluding pong frames).
 * Returns an unsubscribe function.
 */
function onMessage(cb) {
  messageListeners.push(cb);
  return function () {
    messageListeners = messageListeners.filter(function (fn) { return fn !== cb; });
  };
}

/**
 * Active health check — call from App.onShow when the chat page is active.
 * If the socket is not open it attempts a reconnect immediately; if it is open
 * it sends a ping and waits for pong (reusing the normal heartbeat timeout).
 */
function checkHealth() {
  if (state === STATE.OPEN) {
    sendRaw({ type: 'ping' });
    resetHeartbeatTimeout();
    heartbeatTimeoutTimer = setTimeout(function () {
      console.warn('[socket] checkHealth pong timeout — triggering reconnect');
      triggerReconnect();
    }, HEARTBEAT_TIMEOUT_MS);
  } else if (
    state !== STATE.CONNECTING &&
    state !== STATE.RECONNECTING &&
    currentCharacterId &&
    currentSessionId
  ) {
    console.info('[socket] checkHealth — connection not open, reconnecting');
    lockReconnect = false;
    triggerReconnect();
  }
}

module.exports = {
  connect: connect,
  send: send,
  close: close,
  getState: getState,
  onStateChange: onStateChange,
  onMessage: onMessage,
  checkHealth: checkHealth,
};
