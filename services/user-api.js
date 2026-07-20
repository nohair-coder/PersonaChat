const http = require('../utils/request');

function login(data) {
  return http.post('/api/user/login', data, { skipAuth: true });
}

function checkToken() {
  return http.get('/api/user/check');
}

function updateProfile(data) {
  return http.put('/api/user/update', data);
}

module.exports = { login, checkToken, updateProfile };
