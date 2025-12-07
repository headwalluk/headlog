/**
 * Extract domain from Apache log source_file path
 * Expected format: /var/www/{domain}/log/{access|error}.log
 *
 * @param {string} sourceFile - Full path to log file
 * @returns {string|null} Extracted domain or null if invalid format
 *
 * @example
 * extractDomain('/var/www/example.com/log/access.log') // 'example.com'
 * extractDomain('/var/www/subdomain.example.org/log/error.log') // 'subdomain.example.org'
 */
function extractDomain(sourceFile) {
  if (!sourceFile || typeof sourceFile !== 'string') {
    return null;
  }

  // Match pattern: /var/www/{domain}/log/*.log
  const match = sourceFile.match(/\/var\/www\/([^/]+)\/log\/(access|error)\.log$/);

  if (!match || !match[1]) {
    return null;
  }

  return match[1];
}

/**
 * Determine log type from source_file path
 * @param {string} sourceFile - Full path to log file
 * @returns {'access'|'error'|null} Log type or null if cannot determine
 */
function extractLogType(sourceFile) {
  if (!sourceFile || typeof sourceFile !== 'string') {
    return null;
  }

  if (sourceFile.includes('/access.log')) {
    return 'access';
  } else if (sourceFile.includes('/error.log')) {
    return 'error';
  }

  return null;
}

module.exports = {
  extractDomain,
  extractLogType
};
