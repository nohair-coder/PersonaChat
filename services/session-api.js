const http = require('../utils/request');

function getSessionList() {
  return http.get('/api/session/list');
}

function deleteSession(sessionId) {
  return http.del('/api/session/del', { session_id: sessionId });
}

// Deferred assumption: endpoint for in-session history messages.
// Confirm with backend before shipping U7.
function getHistoryMessages(sessionId, page = 1, pageSize = 20) {
  return http.get('/api/session/messages', { session_id: sessionId, page, page_size: pageSize });
}

module.exports = { getSessionList, deleteSession, getHistoryMessages };
