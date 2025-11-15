#!/usr/bin/env bash
# CCS Error Codes
# Documentation: ../docs/errors/README.md

# Configuration Errors (E100-E199)
readonly E_CONFIG_MISSING="E101"
readonly E_CONFIG_INVALID_JSON="E102"
readonly E_CONFIG_INVALID_PROFILE="E103"

# Profile Management Errors (E200-E299)
readonly E_PROFILE_NOT_FOUND="E104"
readonly E_PROFILE_ALREADY_EXISTS="E105"
readonly E_PROFILE_CANNOT_DELETE_DEFAULT="E106"
readonly E_PROFILE_INVALID_NAME="E107"

# Claude CLI Detection Errors (E300-E399)
readonly E_CLAUDE_NOT_FOUND="E301"
readonly E_CLAUDE_VERSION_INCOMPATIBLE="E302"
readonly E_CLAUDE_EXECUTION_FAILED="E303"

# Network/API Errors (E400-E499)
readonly E_GLMT_PROXY_TIMEOUT="E401"
readonly E_API_KEY_MISSING="E402"
readonly E_API_AUTH_FAILED="E403"
readonly E_API_RATE_LIMIT="E404"

# File System Errors (E500-E599)
readonly E_FS_CANNOT_CREATE_DIR="E501"
readonly E_FS_CANNOT_WRITE_FILE="E502"
readonly E_FS_CANNOT_READ_FILE="E503"
readonly E_FS_INSTANCE_NOT_FOUND="E504"

# Internal Errors (E900-E999)
readonly E_INTERNAL_ERROR="E900"
readonly E_INVALID_STATE="E901"

# Get error documentation URL
get_error_doc_url() {
  local error_code="$1"
  echo "https://github.com/kaitranntt/ccs/blob/main/docs/errors/README.md#${error_code,,}"
}

# Get error category from code
get_error_category() {
  local error_code="$1"
  local code="${error_code#E}"

  if [[ $code -ge 100 && $code -lt 200 ]]; then
    echo "Configuration"
  elif [[ $code -ge 200 && $code -lt 300 ]]; then
    echo "Profile Management"
  elif [[ $code -ge 300 && $code -lt 400 ]]; then
    echo "Claude CLI Detection"
  elif [[ $code -ge 400 && $code -lt 500 ]]; then
    echo "Network/API"
  elif [[ $code -ge 500 && $code -lt 600 ]]; then
    echo "File System"
  elif [[ $code -ge 900 && $code -lt 1000 ]]; then
    echo "Internal"
  else
    echo "Unknown"
  fi
}
