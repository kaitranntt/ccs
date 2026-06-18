/**
 * Constants for the Gemini CLI quota fetcher submodule.
 *
 * Google Cloud Code API endpoints, error-detail sanitization limits, and
 * upstream request timeouts. Extracted verbatim from the original god file;
 * do not change values without coordinating with callers and tests.
 */

/** Google Cloud Code internal API base URL. */
export const GEMINI_CLI_API_BASE = 'https://cloudcode-pa.googleapis.com';

/** Google Cloud Code API version path segment. */
export const GEMINI_CLI_API_VERSION = 'v1internal';

/** retrieveUserQuota endpoint - returns bucket-based model quotas. */
export const GEMINI_CLI_QUOTA_URL = `${GEMINI_CLI_API_BASE}/${GEMINI_CLI_API_VERSION}:retrieveUserQuota`;

/** loadCodeAssist endpoint - returns tier/credit metadata. */
export const GEMINI_CLI_CODE_ASSIST_URL = `${GEMINI_CLI_API_BASE}/${GEMINI_CLI_API_VERSION}:loadCodeAssist`;

/** Max characters retained from a sanitized upstream error detail. */
export const GEMINI_CLI_ERROR_DETAIL_MAX_LENGTH = 320;

/** Suffix appended when an error detail is truncated. */
export const GEMINI_CLI_ERROR_DETAIL_TRUNCATION_SUFFIX = '...[truncated]';

/** Credit type identifying Google One AI (paid tier) credits. */
export const GEMINI_CLI_G1_CREDIT_TYPE = 'GOOGLE_ONE_AI';

/** Timeout for the primary (preferred) management API attempt, in ms. */
export const MANAGEMENT_API_TIMEOUT_MS = 5000;

/** Timeout for the secondary / fallback upstream request, in ms. */
export const SECONDARY_REQUEST_TIMEOUT_MS = 2000;
