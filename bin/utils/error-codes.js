// CCS Error Codes
// Documentation: ../../docs/errors/README.md

const ERROR_CODES = {
  // Configuration Errors (E100-E199)
  CONFIG_MISSING: 'E101',
  CONFIG_INVALID_JSON: 'E102',
  CONFIG_INVALID_PROFILE: 'E103',

  // Profile Management Errors (E200-E299)
  PROFILE_NOT_FOUND: 'E104',
  PROFILE_ALREADY_EXISTS: 'E105',
  PROFILE_CANNOT_DELETE_DEFAULT: 'E106',
  PROFILE_INVALID_NAME: 'E107',

  // Claude CLI Detection Errors (E300-E399)
  CLAUDE_NOT_FOUND: 'E301',
  CLAUDE_VERSION_INCOMPATIBLE: 'E302',
  CLAUDE_EXECUTION_FAILED: 'E303',

  // Network/API Errors (E400-E499)
  GLMT_PROXY_TIMEOUT: 'E401',
  API_KEY_MISSING: 'E402',
  API_AUTH_FAILED: 'E403',
  API_RATE_LIMIT: 'E404',

  // File System Errors (E500-E599)
  FS_CANNOT_CREATE_DIR: 'E501',
  FS_CANNOT_WRITE_FILE: 'E502',
  FS_CANNOT_READ_FILE: 'E503',
  FS_INSTANCE_NOT_FOUND: 'E504',

  // Internal Errors (E900-E999)
  INTERNAL_ERROR: 'E900',
  INVALID_STATE: 'E901'
};

// Error code documentation URL generator
function getErrorDocUrl(errorCode) {
  return `https://github.com/kaitranntt/ccs/blob/main/docs/errors/README.md#${errorCode.toLowerCase()}`;
}

// Get error category from code
function getErrorCategory(errorCode) {
  const code = parseInt(errorCode.substring(1));
  if (code >= 100 && code < 200) return 'Configuration';
  if (code >= 200 && code < 300) return 'Profile Management';
  if (code >= 300 && code < 400) return 'Claude CLI Detection';
  if (code >= 400 && code < 500) return 'Network/API';
  if (code >= 500 && code < 600) return 'File System';
  if (code >= 900 && code < 1000) return 'Internal';
  return 'Unknown';
}

module.exports = {
  ERROR_CODES,
  getErrorDocUrl,
  getErrorCategory
};
