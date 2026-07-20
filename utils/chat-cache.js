// In-memory per-persona message cache. Cleared on session expiry (U9).
const _cache = {};

function getMessages(personaId) {
  return _cache[personaId] || [];
}

function setMessages(personaId, messages) {
  _cache[personaId] = messages;
}

function appendMessage(personaId, message) {
  if (!_cache[personaId]) _cache[personaId] = [];
  _cache[personaId].push(message);
}

function prependMessages(personaId, messages) {
  if (!_cache[personaId]) _cache[personaId] = [];
  _cache[personaId] = messages.concat(_cache[personaId]);
}

function clearAll() {
  Object.keys(_cache).forEach(k => delete _cache[k]);
}

function clear(personaId) {
  delete _cache[personaId];
}

module.exports = {
  getMessages,
  setMessages,
  appendMessage,
  prependMessages,
  clearAll,
  clear,
};
