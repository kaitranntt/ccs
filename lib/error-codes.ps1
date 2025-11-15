# CCS Error Codes
# Documentation: ../docs/errors/README.md

# Configuration Errors (E100-E199)
$script:E_CONFIG_MISSING = "E101"
$script:E_CONFIG_INVALID_JSON = "E102"
$script:E_CONFIG_INVALID_PROFILE = "E103"

# Profile Management Errors (E200-E299)
$script:E_PROFILE_NOT_FOUND = "E104"
$script:E_PROFILE_ALREADY_EXISTS = "E105"
$script:E_PROFILE_CANNOT_DELETE_DEFAULT = "E106"
$script:E_PROFILE_INVALID_NAME = "E107"

# Claude CLI Detection Errors (E300-E399)
$script:E_CLAUDE_NOT_FOUND = "E301"
$script:E_CLAUDE_VERSION_INCOMPATIBLE = "E302"
$script:E_CLAUDE_EXECUTION_FAILED = "E303"

# Network/API Errors (E400-E499)
$script:E_GLMT_PROXY_TIMEOUT = "E401"
$script:E_API_KEY_MISSING = "E402"
$script:E_API_AUTH_FAILED = "E403"
$script:E_API_RATE_LIMIT = "E404"

# File System Errors (E500-E599)
$script:E_FS_CANNOT_CREATE_DIR = "E501"
$script:E_FS_CANNOT_WRITE_FILE = "E502"
$script:E_FS_CANNOT_READ_FILE = "E503"
$script:E_FS_INSTANCE_NOT_FOUND = "E504"

# Internal Errors (E900-E999)
$script:E_INTERNAL_ERROR = "E900"
$script:E_INVALID_STATE = "E901"

# Get error documentation URL
function Get-ErrorDocUrl {
    param([string]$ErrorCode)
    return "https://github.com/kaitranntt/ccs/blob/main/docs/errors/README.md#$($ErrorCode.ToLower())"
}

# Get error category from code
function Get-ErrorCategory {
    param([string]$ErrorCode)

    $code = [int]$ErrorCode.Substring(1)

    if ($code -ge 100 -and $code -lt 200) { return "Configuration" }
    elseif ($code -ge 200 -and $code -lt 300) { return "Profile Management" }
    elseif ($code -ge 300 -and $code -lt 400) { return "Claude CLI Detection" }
    elseif ($code -ge 400 -and $code -lt 500) { return "Network/API" }
    elseif ($code -ge 500 -and $code -lt 600) { return "File System" }
    elseif ($code -ge 900 -and $code -lt 1000) { return "Internal" }
    else { return "Unknown" }
}
