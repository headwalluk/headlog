const crypto = require('crypto');

/**
 * Generate a secure 40-character alphanumeric API key
 * @returns {string} 40-character alphanumeric key
 */
function generateApiKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(40);

  let key = '';
  for (let i = 0; i < 40; i++) {
    key += chars[bytes[i] % chars.length];
  }

  return key;
}

module.exports = { generateApiKey };
