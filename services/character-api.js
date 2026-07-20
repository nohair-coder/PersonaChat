const request = require('../utils/request');

/**
 * Fetch the full persona/character list.
 * GET /api/character/list
 * Public endpoint — no auth header required.
 * @returns {Promise<Array>} Array of character objects.
 */
function getList() {
  return request({
    url: '/api/character/list',
    method: 'GET',
  });
}

/**
 * Fetch detailed info for a single character.
 * GET /api/character/info?id=<characterId>
 * @param {string|number} characterId
 * @returns {Promise<Object>} Character detail object.
 */
function getInfo(characterId) {
  return request({
    url: '/api/character/info',
    method: 'GET',
    data: { id: characterId },
  });
}

module.exports = {
  getList,
  getInfo,
};
