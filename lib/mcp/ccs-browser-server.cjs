#!/usr/bin/env node

function loadWebSocketImplementation() {
  if (typeof globalThis.WebSocket === 'function') {
    return globalThis.WebSocket;
  }

  try {
    const { WebSocket } = require('undici');
    if (typeof WebSocket === 'function') {
      return WebSocket;
    }
  } catch {
    // Fall through to the legacy ws dependency when available.
  }

  try {
    const wsModule = require('ws');
    if (typeof wsModule === 'function') {
      return wsModule;
    }
    if (typeof wsModule?.WebSocket === 'function') {
      return wsModule.WebSocket;
    }
  } catch {
    // Surface a dedicated error below if no implementation is available.
  }

  throw new Error(
    'Browser MCP could not find a WebSocket implementation. Tried globalThis.WebSocket, undici, and ws.'
  );
}

const WebSocket = loadWebSocketImplementation();
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'ccs-browser';
const SERVER_VERSION = '1.0.0';
const TOOL_SESSION_INFO = 'browser_get_session_info';
const TOOL_URL_TITLE = 'browser_get_url_and_title';
const TOOL_VISIBLE_TEXT = 'browser_get_visible_text';
const TOOL_DOM_SNAPSHOT = 'browser_get_dom_snapshot';
const TOOL_NAVIGATE = 'browser_navigate';
const TOOL_CLICK = 'browser_click';
const TOOL_TYPE = 'browser_type';
const TOOL_PRESS_KEY = 'browser_press_key';
const TOOL_SCROLL = 'browser_scroll';
const TOOL_SELECT_PAGE = 'browser_select_page';
const TOOL_OPEN_PAGE = 'browser_open_page';
const TOOL_CLOSE_PAGE = 'browser_close_page';
const TOOL_ADD_INTERCEPT_RULE = 'browser_add_intercept_rule';
const TOOL_REMOVE_INTERCEPT_RULE = 'browser_remove_intercept_rule';
const TOOL_LIST_INTERCEPT_RULES = 'browser_list_intercept_rules';
const TOOL_LIST_REQUESTS = 'browser_list_requests';
const TOOL_SET_DOWNLOAD_BEHAVIOR = 'browser_set_download_behavior';
const TOOL_LIST_DOWNLOADS = 'browser_list_downloads';
const TOOL_CANCEL_DOWNLOAD = 'browser_cancel_download';
const TOOL_SET_FILE_INPUT = 'browser_set_file_input';
const TOOL_DRAG_FILES = 'browser_drag_files';
const TOOL_DRAG_ELEMENT = 'browser_drag_element';
const TOOL_POINTER_ACTION = 'browser_pointer_action';
const TOOL_START_RECORDING = 'browser_start_recording';
const TOOL_STOP_RECORDING = 'browser_stop_recording';
const TOOL_GET_RECORDING = 'browser_get_recording';
const TOOL_CLEAR_RECORDING = 'browser_clear_recording';
const TOOL_START_REPLAY = 'browser_start_replay';
const TOOL_GET_REPLAY = 'browser_get_replay';
const TOOL_CANCEL_REPLAY = 'browser_cancel_replay';
const TOOL_START_ORCHESTRATION = 'browser_start_orchestration';
const TOOL_GET_ORCHESTRATION = 'browser_get_orchestration';
const TOOL_CANCEL_ORCHESTRATION = 'browser_cancel_orchestration';
const TOOL_EXPORT_ARTIFACT = 'browser_export_artifact';
const TOOL_IMPORT_ARTIFACT = 'browser_import_artifact';
const TOOL_LIST_ARTIFACTS = 'browser_list_artifacts';
const TOOL_DELETE_ARTIFACT = 'browser_delete_artifact';
const TOOL_TAKE_SCREENSHOT = 'browser_take_screenshot';
const TOOL_WAIT_FOR = 'browser_wait_for';
const TOOL_EVAL = 'browser_eval';
const TOOL_HOVER = 'browser_hover';
const TOOL_QUERY = 'browser_query';
const TOOL_TAKE_ELEMENT_SCREENSHOT = 'browser_take_element_screenshot';
const TOOL_WAIT_FOR_EVENT = 'browser_wait_for_event';
const TOOL_NAMES = [
  TOOL_SESSION_INFO,
  TOOL_URL_TITLE,
  TOOL_VISIBLE_TEXT,
  TOOL_DOM_SNAPSHOT,
  TOOL_NAVIGATE,
  TOOL_CLICK,
  TOOL_TYPE,
  TOOL_PRESS_KEY,
  TOOL_SCROLL,
  TOOL_SELECT_PAGE,
  TOOL_OPEN_PAGE,
  TOOL_CLOSE_PAGE,
  TOOL_ADD_INTERCEPT_RULE,
  TOOL_REMOVE_INTERCEPT_RULE,
  TOOL_LIST_INTERCEPT_RULES,
  TOOL_LIST_REQUESTS,
  TOOL_SET_DOWNLOAD_BEHAVIOR,
  TOOL_LIST_DOWNLOADS,
  TOOL_CANCEL_DOWNLOAD,
  TOOL_SET_FILE_INPUT,
  TOOL_DRAG_FILES,
  TOOL_DRAG_ELEMENT,
  TOOL_POINTER_ACTION,
  TOOL_START_RECORDING,
  TOOL_STOP_RECORDING,
  TOOL_GET_RECORDING,
  TOOL_CLEAR_RECORDING,
  TOOL_START_REPLAY,
  TOOL_GET_REPLAY,
  TOOL_CANCEL_REPLAY,
  TOOL_START_ORCHESTRATION,
  TOOL_GET_ORCHESTRATION,
  TOOL_CANCEL_ORCHESTRATION,
  TOOL_EXPORT_ARTIFACT,
  TOOL_IMPORT_ARTIFACT,
  TOOL_LIST_ARTIFACTS,
  TOOL_DELETE_ARTIFACT,
  TOOL_TAKE_SCREENSHOT,
  TOOL_WAIT_FOR,
  TOOL_EVAL,
  TOOL_HOVER,
  TOOL_QUERY,
  TOOL_TAKE_ELEMENT_SCREENSHOT,
  TOOL_WAIT_FOR_EVENT,
];
const SUPPORTED_QUERY_FIELDS = [
  'exists',
  'count',
  'innerText',
  'textContent',
  'boundingClientRect',
  'display',
  'visibility',
  'opacity',
  'href',
  'onclick',
];
const DEFAULT_QUERY_FIELDS = [...SUPPORTED_QUERY_FIELDS];
const SUPPORTED_QUERY_FIELD_SET = new Set(SUPPORTED_QUERY_FIELDS);
const CDP_TIMEOUT_MS = 5000;
const NAVIGATION_POLL_INTERVAL_MS = 100;
const DEFAULT_WAIT_TIMEOUT_MS = 2000;
const DEFAULT_WAIT_POLL_INTERVAL_MS = 100;
const DEFAULT_DRAG_STEPS = 5;
const MAX_POINTER_ACTIONS = 25;
const SESSION_START_SETTLE_WINDOW_MS = 250;
const MAX_ARTIFACT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_LOCAL_TRANSFER_FILE_BYTES = 10 * 1024 * 1024;
const MAX_LOCAL_TRANSFER_FILES = 10;
const SAFE_ARTIFACT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SESSION_CANCELED_ERROR_CODE = 'SESSION_CANCELED';

let inputBuffer = Buffer.alloc(0);
let requestCounter = 0;
let selectedPageId = '';
let messageQueue = Promise.resolve();
let nextInterceptRuleCounter = 1;
let nextDownloadCounter = 1;
let nextRecordingCounter = 1;
let activeRecordingSession = null;
let latestRecordingSession = null;
let nextReplayCounter = 1;
let activeReplaySession = null;
let activeReplayTask = null;
let latestReplaySession = null;
let nextOrchestrationCounter = 1;
let activeOrchestrationSession = null;
let activeOrchestrationTask = null;
let latestOrchestrationSession = null;
const interceptRules = [];
const recentRequests = [];
const recentDownloads = [];
const interceptSessionsByPageId = new Map();
let browserDownloadSession = null;
let sessionDownloadDir = '';
const SENSITIVE_LOCAL_PATH_SEGMENTS = new Set([
  '.ssh',
  '.gnupg',
  '.aws',
  '.azure',
  '.kube',
  '.docker',
  '.npmrc',
  '.netrc',
  '.pypirc',
  '.config',
  '.claude',
  '.ccs',
]);
const SENSITIVE_LOCAL_FILE_NAMES = new Set([
  '.env',
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  'known_hosts',
  'authorized_keys',
  'credentials',
  'credentials.json',
  'config.json',
  'settings.json',
  'history',
  '.bash_history',
  '.zsh_history',
  '.fish_history',
]);
const MAX_RECENT_REQUESTS = 100;
const MAX_RECENT_DOWNLOADS = 100;
const FETCH_FAIL_ERROR_REASON = 'Failed';

function addSocketListener(socket, eventName, handler) {
  if (typeof socket.addEventListener === 'function') {
    socket.addEventListener(eventName, handler);
    return;
  }

  if (typeof socket.on === 'function') {
    socket.on(eventName, handler);
  }
}

async function getSocketMessageText(message) {
  const data = message && typeof message === 'object' && 'data' in message ? message.data : message;

  if (typeof data === 'string') {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return data.toString('utf8');
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  }

  if (data && typeof data.text === 'function') {
    return await data.text();
  }

  return String(data);
}

function closeSocket(socket) {
  if (typeof socket.close === 'function') {
    socket.close();
  }
}

function abortSocket(socket) {
  if (typeof socket.terminate === 'function') {
    socket.terminate();
    return;
  }

  closeSocket(socket);
}

function toSocketError(error) {
  if (error instanceof Error) {
    return error;
  }

  return new Error('Browser MCP lost the DevTools websocket connection.');
}

function shouldExposeTools() {
  return Boolean(process.env.CCS_BROWSER_DEVTOOLS_HTTP_URL);
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function writeResponse(id, result) {
  writeMessage({ jsonrpc: '2.0', id, result });
}

function writeError(id, code, message) {
  writeMessage({ jsonrpc: '2.0', id, error: { code, message } });
}

function getAvailableTools() {
  const tools = getTools();
  if (getBrowserEvalMode() === 'disabled') {
    return tools.filter((tool) => tool.name !== TOOL_EVAL);
  }
  return tools;
}

function getAvailableToolNames() {
  if (getBrowserEvalMode() === 'disabled') {
    return TOOL_NAMES.filter((toolName) => toolName !== TOOL_EVAL);
  }
  return [...TOOL_NAMES];
}

function getTools() {
  if (!shouldExposeTools()) {
    return [];
  }

  return [
    {
      name: TOOL_SESSION_INFO,
      description:
        'List the current Chrome session pages available through the configured DevTools connection, including page ids, titles, URLs, and websocket endpoints.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: TOOL_URL_TITLE,
      description:
        'Read the current page URL and title from the configured Chrome session. Optionally choose a page by index.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description:
              'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_VISIBLE_TEXT,
      description:
        'Read visible text from the current page via DOM evaluation in the configured Chrome session. Optionally choose a page by index.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description:
              'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_DOM_SNAPSHOT,
      description:
        'Read a DOM snapshot from the current page by returning the document outerHTML. Optionally choose a page by index.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description:
              'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_NAVIGATE,
      description:
        'Navigate the selected page to an absolute http or https URL and wait until navigation is ready. Optionally choose a page by index.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description:
              'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
          url: {
            type: 'string',
            description: 'Required absolute http or https URL to navigate to.',
          },
        },
        required: ['url'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_CLICK,
      description:
        'Click the first element matching a CSS selector in the selected page using a minimal mouse event chain with click fallback. Optionally choose a page by index and match index.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description:
              'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
          selector: {
            type: 'string',
            description: 'Required CSS selector for the element to click.',
          },
          nth: {
            type: 'integer',
            minimum: 0,
            description:
              'Optional zero-based match index for selectors returning multiple elements.',
          },
          frameSelector: {
            type: 'string',
            description:
              'Optional CSS selector for an iframe whose document should be used as the query root.',
          },
          pierceShadow: {
            type: 'boolean',
            description: 'When true, search open shadow roots beneath the selected root.',
          },
          offsetX: {
            type: 'number',
            description:
              "Optional horizontal offset in CSS pixels from the target element's left edge.",
          },
          offsetY: {
            type: 'number',
            description:
              "Optional vertical offset in CSS pixels from the target element's top edge.",
          },
          button: {
            type: 'string',
            enum: ['left', 'middle', 'right'],
            description: 'Optional mouse button. Defaults to left.',
          },
          clickCount: {
            type: 'integer',
            minimum: 1,
            description: 'Optional click count. Defaults to 1.',
          },
        },
        required: ['selector'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_TYPE,
      description:
        'Type text into the first element matching a CSS selector when it is a supported text-editable target. Optionally choose a page by index.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description:
              'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
          selector: {
            type: 'string',
            description: 'Required CSS selector for the target element.',
          },
          text: {
            type: 'string',
            description: 'Required text to assign. May be an empty string.',
          },
          clearFirst: {
            type: 'boolean',
            description: 'When true, clear the current value or content before assigning text.',
          },
        },
        required: ['selector', 'text'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_PRESS_KEY,
      description:
        'Press a key or key combination in the selected page using real keyboard-style events. Optionally choose a page by index.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description:
              'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
          key: {
            type: 'string',
            description: 'Required primary key to press.',
          },
          modifiers: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['Alt', 'Control', 'Meta', 'Shift'],
            },
            description: 'Optional modifier keys such as Alt, Control, Meta, or Shift.',
          },
          repeat: {
            type: 'integer',
            minimum: 1,
            description: 'Optional repeat count. Defaults to 1.',
          },
        },
        required: ['key'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_SCROLL,
      description:
        'Scroll the selected page or a matched element. Supports explicit deltas or scrolling an element into view.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description:
              'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
          selector: {
            type: 'string',
            description: 'Optional CSS selector for an element-scoped scroll target.',
          },
          frameSelector: {
            type: 'string',
            description:
              'Optional CSS selector for an iframe whose document should be used as the query root.',
          },
          pierceShadow: {
            type: 'boolean',
            description: 'When true, search open shadow roots beneath the selected root.',
          },
          behavior: {
            type: 'string',
            enum: ['into-view', 'by-offset'],
            description: 'Required scroll behavior.',
          },
          deltaX: {
            type: 'number',
            description: 'Optional horizontal scroll delta for by-offset behavior.',
          },
          deltaY: {
            type: 'number',
            description: 'Optional vertical scroll delta for by-offset behavior.',
          },
        },
        required: ['behavior'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_SELECT_PAGE,
      description:
        'Select the current page target by page index or page id for subsequent browser tool calls.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: { type: 'integer', minimum: 0 },
          pageId: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_OPEN_PAGE,
      description: 'Open a new browser page tab and optionally navigate it to a URL.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_CLOSE_PAGE,
      description:
        'Close a browser page target by page index or page id. Defaults to the selected page.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: { type: 'integer', minimum: 0 },
          pageId: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_ADD_INTERCEPT_RULE,
      description: 'Add a session-local interception rule bound to a concrete page target.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: { type: 'integer', minimum: 0 },
          pageId: { type: 'string' },
          urlIncludes: { type: 'string' },
          method: { type: 'string' },
          resourceType: { type: 'string' },
          urlPattern: { type: 'string' },
          urlRegex: { type: 'string' },
          headerMatchers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                valueIncludes: { type: 'string' },
                valueRegex: { type: 'string' },
              },
              required: ['name'],
              additionalProperties: false,
            },
          },
          priority: { type: 'integer' },
          action: { type: 'string', enum: ['continue', 'fail', 'fulfill'] },
          statusCode: { type: 'integer', minimum: 100, maximum: 599 },
          responseHeaders: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                value: { type: 'string' },
              },
              required: ['name', 'value'],
              additionalProperties: false,
            },
          },
          body: { type: 'string' },
          contentType: { type: 'string' },
        },
        required: ['action'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_REMOVE_INTERCEPT_RULE,
      description: 'Remove a session-local interception rule by rule id.',
      inputSchema: {
        type: 'object',
        properties: {
          ruleId: { type: 'string' },
        },
        required: ['ruleId'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_LIST_INTERCEPT_RULES,
      description: 'List current session-local interception rules.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: TOOL_LIST_REQUESTS,
      description: 'List recent intercepted request summaries for the current session.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: { type: 'integer', minimum: 0 },
          pageId: { type: 'string' },
          limit: { type: 'integer', minimum: 1 },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_SET_DOWNLOAD_BEHAVIOR,
      description: 'Set browser-scoped download behavior for the current attach session.',
      inputSchema: {
        type: 'object',
        properties: {
          behavior: { type: 'string', enum: ['accept', 'deny'] },
          downloadPath: { type: 'string' },
          eventsEnabled: { type: 'boolean' },
        },
        required: ['behavior'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_LIST_DOWNLOADS,
      description: 'List recent browser-scoped download summaries recorded in this MCP session.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1 },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_CANCEL_DOWNLOAD,
      description: 'Cancel an in-progress download by downloadId or guid.',
      inputSchema: {
        type: 'object',
        properties: {
          downloadId: { type: 'string' },
          guid: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_SET_FILE_INPUT,
      description:
        'Set local files on a file input element in the selected page. Supports selected-page routing plus same-origin frame and open shadow-root scoping.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string' },
          files: {
            type: 'array',
            items: { type: 'string' },
          },
          pageIndex: { type: 'integer', minimum: 0 },
          pageId: { type: 'string' },
          nth: { type: 'integer', minimum: 0 },
          frameSelector: { type: 'string' },
          pierceShadow: { type: 'boolean' },
        },
        required: ['selector', 'files'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_DRAG_FILES,
      description:
        'Drag one or more local files onto a matched page drop target using page-side File and DataTransfer injection.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string' },
          files: {
            type: 'array',
            items: { type: 'string' },
          },
          pageIndex: { type: 'integer', minimum: 0 },
          pageId: { type: 'string' },
          nth: { type: 'integer', minimum: 0 },
          frameSelector: { type: 'string' },
          pierceShadow: { type: 'boolean' },
        },
        required: ['selector', 'files'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_DRAG_ELEMENT,
      description:
        'Drag a matched element to another matched element or explicit coordinates using browser mouse events.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string' },
          targetSelector: { type: 'string' },
          targetX: { type: 'number' },
          targetY: { type: 'number' },
          pageIndex: { type: 'integer', minimum: 0 },
          pageId: { type: 'string' },
          nth: { type: 'integer', minimum: 0 },
          targetNth: { type: 'integer', minimum: 0 },
          frameSelector: { type: 'string' },
          pierceShadow: { type: 'boolean' },
          steps: { type: 'integer', minimum: 1 },
        },
        required: ['selector'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_POINTER_ACTION,
      description: 'Run a limited pointer action sequence using browser mouse events.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: { type: 'integer', minimum: 0 },
          pageId: { type: 'string' },
          actions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['move', 'down', 'up', 'pause'] },
                selector: { type: 'string' },
                nth: { type: 'integer', minimum: 0 },
                frameSelector: { type: 'string' },
                pierceShadow: { type: 'boolean' },
                x: { type: 'number' },
                y: { type: 'number' },
                button: { type: 'string', enum: ['left', 'middle', 'right'] },
                durationMs: { type: 'integer', minimum: 0 },
              },
              required: ['type'],
              additionalProperties: false,
            },
          },
        },
        required: ['actions'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_START_RECORDING,
      description:
        'Start recording real browser interactions on the selected page and store them as structured steps.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: { type: 'integer', minimum: 0 },
          pageId: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_STOP_RECORDING,
      description:
        'Stop the active browser recording session and keep the recorded result in session-local state.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: TOOL_GET_RECORDING,
      description: 'Read the current browser recording result from session-local state.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: TOOL_CLEAR_RECORDING,
      description: 'Clear the current browser recording result from session-local state.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: TOOL_START_REPLAY,
      description:
        'Start replaying a sequence of structured Browser MCP steps on the selected page.',
      inputSchema: {
        type: 'object',
        properties: {
          steps: { type: 'array', items: { type: 'object' } },
          pageIndex: { type: 'integer', minimum: 0 },
          pageId: { type: 'string' },
        },
        required: ['steps'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_GET_REPLAY,
      description: 'Read the current replay status and result summary from session-local state.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: TOOL_CANCEL_REPLAY,
      description: 'Cancel the active replay session and keep the summary in session-local state.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: TOOL_START_ORCHESTRATION,
      description:
        'Start an orchestration session that runs fixed browser workflow blocks on the selected page.',
      inputSchema: {
        type: 'object',
        properties: {
          blocks: { type: 'array', items: { type: 'object' } },
          pageIndex: { type: 'integer', minimum: 0 },
          pageId: { type: 'string' },
        },
        required: ['blocks'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_GET_ORCHESTRATION,
      description:
        'Read the current orchestration status and result summary from session-local state.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: TOOL_CANCEL_ORCHESTRATION,
      description:
        'Cancel the active orchestration session and keep the summary in session-local state.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: TOOL_EXPORT_ARTIFACT,
      description:
        'Export the current recording, replay, or orchestration artifact to a local JSON file.',
      inputSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['kind', 'name'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_IMPORT_ARTIFACT,
      description:
        'Import a recording, replay, or orchestration artifact from a local JSON file into session-local state.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_LIST_ARTIFACTS,
      description: 'List locally saved Browser MCP artifacts.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: TOOL_DELETE_ARTIFACT,
      description: 'Delete a locally saved Browser MCP artifact by name.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_TAKE_SCREENSHOT,
      description:
        'Capture a PNG screenshot from the selected page. Optionally choose a page by index or request fullPage capture.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description:
              'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
          fullPage: {
            type: 'boolean',
            description: 'Optional full-page capture flag.',
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_WAIT_FOR,
      description:
        'Poll until a selector-scoped or page-level condition is satisfied. Supports selector existence/visibility/text waits and page text waits.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description:
              'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
          selector: {
            type: 'string',
            description: 'Optional CSS selector for selector-scoped waiting.',
          },
          nth: {
            type: 'integer',
            minimum: 0,
            description:
              'Optional zero-based match index for selectors returning multiple elements.',
          },
          frameSelector: {
            type: 'string',
            description:
              'Optional CSS selector for an iframe whose document should be used as the query root.',
          },
          pierceShadow: {
            type: 'boolean',
            description: 'When true, search open shadow roots beneath the selected root.',
          },
          timeoutMs: {
            type: 'integer',
            minimum: 1,
            description: 'Optional timeout in milliseconds.',
          },
          pollIntervalMs: {
            type: 'integer',
            minimum: 1,
            description: 'Optional polling interval in milliseconds.',
          },
          condition: {
            type: 'object',
            description: 'Required wait condition.',
          },
        },
        required: ['condition'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_EVAL,
      description:
        'Evaluate page-side JavaScript for inspection or mutation, gated by CCS_BROWSER_EVAL_MODE.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description:
              'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
          expression: {
            type: 'string',
            description: 'Required JavaScript expression to evaluate in the page.',
          },
          mode: {
            type: 'string',
            enum: ['readonly', 'readwrite'],
            description: 'Optional evaluation mode. Defaults to readonly.',
          },
        },
        required: ['expression'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_HOVER,
      description:
        'Move the browser mouse pointer onto the first element matching a CSS selector in the selected page to trigger hover state. Optionally choose a page by index.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description:
              'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
          selector: {
            type: 'string',
            description: 'Required CSS selector for the hover target.',
          },
          frameSelector: {
            type: 'string',
            description:
              'Optional CSS selector for an iframe whose document should be used as the query root.',
          },
          pierceShadow: {
            type: 'boolean',
            description: 'When true, search open shadow roots beneath the selected root.',
          },
        },
        required: ['selector'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_QUERY,
      description:
        'Return diagnostic state for selector-matched elements in the selected page. Optionally choose a page by index, zero-based match index, and a subset of fields.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description:
              'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
          selector: {
            type: 'string',
            description: 'Required CSS selector for the query target.',
          },
          nth: {
            type: 'integer',
            minimum: 0,
            description:
              'Optional zero-based match index for selectors returning multiple elements.',
          },
          frameSelector: {
            type: 'string',
            description:
              'Optional CSS selector for an iframe whose document should be used as the query root.',
          },
          pierceShadow: {
            type: 'boolean',
            description: 'When true, search open shadow roots beneath the selected root.',
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of diagnostic fields to return.',
          },
        },
        required: ['selector'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_TAKE_ELEMENT_SCREENSHOT,
      description:
        'Capture a PNG screenshot clipped to the first element matching a CSS selector in the selected page. Optionally choose a page by index.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description:
              'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
          selector: {
            type: 'string',
            description: 'Required CSS selector for the screenshot target.',
          },
          frameSelector: {
            type: 'string',
            description:
              'Optional CSS selector for an iframe whose document should be used as the query root.',
          },
          pierceShadow: {
            type: 'boolean',
            description: 'When true, search open shadow roots beneath the selected root.',
          },
        },
        required: ['selector'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_WAIT_FOR_EVENT,
      description: 'Wait until a page or browser event matching the requested filter is observed.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description:
              'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
          timeoutMs: {
            type: 'integer',
            minimum: 1,
            description: 'Optional timeout in milliseconds.',
          },
          event: {
            type: 'object',
            description: 'Required event selector.',
          },
        },
        required: ['event'],
        additionalProperties: false,
      },
    },
  ];
}

async function fetchJson(url, options = undefined) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return await response.json();
}

function isUsablePageTarget(target) {
  if (!target || typeof target !== 'object' || target.type !== 'page') {
    return false;
  }
  const url = typeof target.url === 'string' ? target.url : '';
  if (url.startsWith('chrome://omnibox-popup') || url.startsWith('chrome://top-chrome')) {
    return false;
  }
  return true;
}

function getHttpUrl() {
  const value = process.env.CCS_BROWSER_DEVTOOLS_HTTP_URL;
  if (!value) {
    throw new Error('Browser MCP is unavailable because CCS_BROWSER_DEVTOOLS_HTTP_URL is missing.');
  }
  return value.replace(/\/+$/, '');
}

async function listPageTargets() {
  const targets = await fetchJson(`${getHttpUrl()}/json/list`);
  if (!Array.isArray(targets)) {
    throw new Error('Browser MCP received an invalid /json/list response.');
  }

  return targets.filter(isUsablePageTarget).map((target) => ({
    id: typeof target.id === 'string' ? target.id : '',
    title: typeof target.title === 'string' ? target.title : '',
    url: typeof target.url === 'string' ? target.url : '',
    type: typeof target.type === 'string' ? target.type : 'page',
    webSocketDebuggerUrl:
      typeof target.webSocketDebuggerUrl === 'string' ? target.webSocketDebuggerUrl : '',
  }));
}

function parsePageIndex(toolArgs) {
  if (!toolArgs || !Object.prototype.hasOwnProperty.call(toolArgs, 'pageIndex')) {
    return 0;
  }

  if (!Number.isInteger(toolArgs.pageIndex) || toolArgs.pageIndex < 0) {
    throw new Error('pageIndex must be a non-negative integer');
  }

  return toolArgs.pageIndex;
}

function findPageIndexById(pages, pageId) {
  return pages.findIndex((page) => page.id === pageId);
}

function resolveFallbackSelectedPageId(pages, preferredIndex = 0) {
  if (pages.length === 0) {
    return '';
  }
  const safeIndex = Math.min(Math.max(preferredIndex, 0), pages.length - 1);
  return pages[safeIndex]?.id || pages[0]?.id || '';
}

function parseOptionalPageId(toolArgs) {
  return typeof toolArgs?.pageId === 'string' && toolArgs.pageId.trim() !== ''
    ? toolArgs.pageId.trim()
    : '';
}

function parseInterceptAction(value) {
  if (value !== 'continue' && value !== 'fail' && value !== 'fulfill') {
    throw new Error('action must be one of: continue, fail, fulfill');
  }
  return value;
}

function parseOptionalStatusCode(value) {
  if (value === undefined) {
    return 200;
  }
  if (!Number.isInteger(value) || value < 100 || value > 599) {
    throw new Error('statusCode must be an integer between 100 and 599');
  }
  return value;
}

function parseOptionalResponseHeaders(value, contentType) {
  const headers = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') {
        throw new Error('responseHeaders entries must be objects with name and value');
      }
      const name = requireNonEmptyString(entry.name, 'responseHeaders.name');
      const headerValue = String(entry.value ?? '');
      headers.push({ name, value: headerValue });
    }
  } else if (value !== undefined) {
    throw new Error('responseHeaders must be an array');
  }
  if (contentType && !headers.some((header) => header.name.toLowerCase() === 'content-type')) {
    headers.push({ name: 'Content-Type', value: contentType });
  }
  return headers;
}

function parseOptionalBody(value) {
  if (value === undefined) {
    return '';
  }
  if (typeof value !== 'string') {
    throw new Error('body must be a string');
  }
  return value;
}

function encodeFulfillBody(body) {
  return Buffer.from(body, 'utf8').toString('base64');
}

function parseOptionalMethod(value) {
  if (value === undefined) {
    return '';
  }
  return requireNonEmptyString(value, 'method').toUpperCase();
}

function parseOptionalUrlIncludes(value) {
  if (value === undefined) {
    return '';
  }
  return requireNonEmptyString(value, 'urlIncludes');
}

function parseOptionalResourceType(value) {
  if (value === undefined) {
    return '';
  }
  return requireNonEmptyString(value, 'resourceType');
}

function parseOptionalUrlPattern(value) {
  if (value === undefined) {
    return '';
  }
  return requireNonEmptyString(value, 'urlPattern');
}

function parseOptionalUrlRegex(value) {
  if (value === undefined) {
    return '';
  }
  const raw = requireNonEmptyString(value, 'urlRegex');
  try {
    new RegExp(raw);
  } catch {
    throw new Error('urlRegex must be a valid regular expression');
  }
  return raw;
}

function parseOptionalPriority(value) {
  if (value === undefined) {
    return 0;
  }
  if (!Number.isInteger(value)) {
    throw new Error('priority must be an integer');
  }
  return value;
}

function parseOptionalHeaderMatchers(value) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('headerMatchers must be an array');
  }
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('headerMatchers entries must be objects');
    }
    const name = requireNonEmptyString(entry.name, 'headerMatchers.name');
    const valueIncludes =
      entry.valueIncludes === undefined
        ? ''
        : requireNonEmptyString(entry.valueIncludes, 'headerMatchers.valueIncludes');
    const valueRegex =
      entry.valueRegex === undefined
        ? ''
        : requireNonEmptyString(entry.valueRegex, 'headerMatchers.valueRegex');
    if (!valueIncludes && !valueRegex) {
      throw new Error('headerMatchers entry must include valueIncludes or valueRegex');
    }
    if (valueRegex) {
      try {
        new RegExp(valueRegex);
      } catch {
        throw new Error('headerMatchers.valueRegex must be a valid regular expression');
      }
    }
    return { name, valueIncludes, valueRegex };
  });
}

function validateInterceptMatcherSet({
  urlIncludes,
  method,
  resourceType,
  urlPattern,
  urlRegex,
  headerMatchers,
}) {
  if (urlPattern && urlRegex) {
    throw new Error('urlPattern and urlRegex cannot be used together');
  }
  if (
    !urlIncludes &&
    !method &&
    !resourceType &&
    !urlPattern &&
    !urlRegex &&
    headerMatchers.length === 0
  ) {
    throw new Error('at least one matching condition is required');
  }
}

function createInterceptRuleId() {
  return `rule-${nextInterceptRuleCounter++}`;
}

function removeInterceptStateForPage(pageId) {
  for (let index = interceptRules.length - 1; index >= 0; index -= 1) {
    if (interceptRules[index].pageId === pageId) {
      interceptRules.splice(index, 1);
    }
  }
  for (let index = recentRequests.length - 1; index >= 0; index -= 1) {
    if (recentRequests[index].pageId === pageId) {
      recentRequests.splice(index, 1);
    }
  }
  const interceptSession = interceptSessionsByPageId.get(pageId);
  if (interceptSession) {
    interceptSessionsByPageId.delete(pageId);
  }
}

function pushRecentRequest(entry) {
  recentRequests.push(entry);
  if (recentRequests.length > MAX_RECENT_REQUESTS) {
    recentRequests.splice(0, recentRequests.length - MAX_RECENT_REQUESTS);
  }
}

function getSessionDownloadPath() {
  if (!sessionDownloadDir) {
    sessionDownloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-browser-downloads-'));
  }
  return sessionDownloadDir;
}

function splitConfiguredPathRoots(value) {
  return String(value || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
}

function getDownloadSafeRoots() {
  return [
    getSessionDownloadPath(),
    ...splitConfiguredPathRoots(process.env.CCS_BROWSER_DOWNLOAD_ROOTS),
  ];
}

function getUploadSafeRoots() {
  return [
    getSessionDownloadPath(),
    ...splitConfiguredPathRoots(process.env.CCS_BROWSER_UPLOAD_ROOTS),
  ];
}

function getNearestExistingAncestor(candidatePath) {
  let currentPath = candidatePath;
  while (!fs.existsSync(currentPath)) {
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return currentPath;
    }
    currentPath = parentPath;
  }
  return currentPath;
}

function resolveExistingRoot(rootPath) {
  fs.mkdirSync(rootPath, { recursive: true });
  return fs.realpathSync(rootPath);
}

function resolvePathWithRealAncestor(candidatePath) {
  const resolvedPath = path.resolve(candidatePath);
  const ancestorPath = getNearestExistingAncestor(resolvedPath);
  const realAncestorPath = fs.realpathSync(ancestorPath);
  const relativeSuffix = path.relative(ancestorPath, resolvedPath);
  return relativeSuffix ? path.resolve(realAncestorPath, relativeSuffix) : realAncestorPath;
}

function isPathInsideRoot(candidatePath, rootPath) {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function findContainingRoot(candidatePath, rootPaths) {
  return rootPaths.find((rootPath) => isPathInsideRoot(candidatePath, rootPath)) || '';
}

function getLocalPathSegments(candidatePath, rootPath) {
  const rootSegments = path.resolve(rootPath).split(path.sep).filter(Boolean);
  const relativePath = path.relative(rootPath, candidatePath);
  const relativeSegments = relativePath.split(path.sep).filter(Boolean);
  return [...rootSegments, ...relativeSegments];
}

function assertNoSensitiveLocalPathSegments(candidatePath, rootPath, label) {
  const segments = getLocalPathSegments(candidatePath, rootPath);
  for (const segment of segments) {
    const normalizedSegment = segment.toLowerCase();
    if (normalizedSegment.startsWith('.') || SENSITIVE_LOCAL_PATH_SEGMENTS.has(normalizedSegment)) {
      throw new Error(`${label} cannot include hidden or sensitive path segment: ${segment}`);
    }
  }

  const fileName = path.basename(candidatePath).toLowerCase();
  if (SENSITIVE_LOCAL_FILE_NAMES.has(fileName)) {
    throw new Error(
      `${label} cannot reference sensitive file name: ${path.basename(candidatePath)}`
    );
  }
}

function ensureWritableDirectory(downloadPath) {
  const resolvedPath = path.resolve(downloadPath);
  const candidatePath = resolvePathWithRealAncestor(resolvedPath);
  const safeRoots = getDownloadSafeRoots().map(resolveExistingRoot);
  const containingRoot = findContainingRoot(candidatePath, safeRoots);
  if (!containingRoot) {
    throw new Error(
      'downloadPath must be inside the browser session download directory or a CCS_BROWSER_DOWNLOAD_ROOTS entry'
    );
  }
  assertNoSensitiveLocalPathSegments(candidatePath, containingRoot, 'downloadPath');

  fs.mkdirSync(resolvedPath, { recursive: true });
  const realDownloadPath = fs.realpathSync(resolvedPath);
  if (!isPathInsideRoot(realDownloadPath, containingRoot)) {
    throw new Error('downloadPath cannot traverse outside the allowed download root');
  }
  fs.accessSync(realDownloadPath, fs.constants.W_OK);
  return realDownloadPath;
}

function pushRecentDownload(entry) {
  recentDownloads.push(entry);
  if (recentDownloads.length > MAX_RECENT_DOWNLOADS) {
    recentDownloads.splice(0, recentDownloads.length - MAX_RECENT_DOWNLOADS);
  }
}

function updateRecentDownload(guid, patch) {
  const record = recentDownloads.find((candidate) => candidate.guid === guid);
  if (!record) {
    return null;
  }
  Object.assign(record, patch);
  return record;
}

function resolveDownloadStatus(progressState) {
  if (progressState === 'completed') {
    return 'completed';
  }
  if (progressState === 'canceled') {
    return 'canceled';
  }
  return 'inProgress';
}

function formatInterceptRules(rules) {
  if (rules.length === 0) {
    return 'status: empty';
  }
  return rules
    .map((rule) =>
      [
        `ruleId: ${rule.ruleId}`,
        `pageId: ${rule.pageId}`,
        `pageTitle: ${rule.pageTitleSnapshot || '<untitled>'}`,
        `urlIncludes: ${rule.urlIncludes || '<any>'}`,
        `method: ${rule.method || '<any>'}`,
        `resourceType: ${rule.resourceType || '<any>'}`,
        `urlPattern: ${rule.urlPattern || '<none>'}`,
        `urlRegex: ${rule.urlRegex || '<none>'}`,
        `headerMatchers: ${Array.isArray(rule.headerMatchers) ? rule.headerMatchers.length : 0}`,
        `priority: ${Number.isInteger(rule.priority) ? rule.priority : 0}`,
        `action: ${rule.action}`,
        `statusCode: ${rule.action === 'fulfill' ? rule.statusCode : 'n/a'}`,
        `contentType: ${rule.action === 'fulfill' ? rule.contentType || '<none>' : 'n/a'}`,
      ].join('\n')
    )
    .join('\n---\n');
}

function formatRecentRequests(entries) {
  if (entries.length === 0) {
    return 'status: empty';
  }
  return entries
    .map((entry) =>
      [
        `requestId: ${entry.requestId}`,
        `pageId: ${entry.pageId}`,
        `url: ${entry.url}`,
        `method: ${entry.method}`,
        `resourceType: ${entry.resourceType || ''}`,
        `matchedRuleId: ${entry.matchedRuleId || 'none'}`,
        `action: ${entry.action}`,
        `statusCode: ${entry.action === 'fulfill' ? entry.statusCode : 'n/a'}`,
      ].join('\n')
    )
    .join('\n---\n');
}

function formatRecentDownloads(entries) {
  if (entries.length === 0) {
    return 'status: empty';
  }
  return entries
    .map((entry) =>
      [
        `downloadId: ${entry.downloadId}`,
        `guid: ${entry.guid}`,
        `pageId: ${entry.pageId || '<unknown>'}`,
        `url: ${entry.url}`,
        `suggestedFilename: ${entry.suggestedFilename}`,
        `status: ${entry.status}`,
        `savedPath: ${entry.savedPath || '<none>'}`,
        `startedAt: ${entry.startedAt}`,
        `finishedAt: ${entry.finishedAt || '<in-progress>'}`,
      ].join('\n')
    )
    .join('\n---\n');
}

function resolveTargetPage(pages, toolArgs, defaultSelectedId = selectedPageId, options = {}) {
  const hasPageIndex = toolArgs && Object.prototype.hasOwnProperty.call(toolArgs, 'pageIndex');
  const pageId = parseOptionalPageId(toolArgs);
  const allowImplicitFallback = options.allowImplicitFallback !== false;
  if (hasPageIndex && pageId) {
    throw new Error('pageIndex and pageId cannot be used together');
  }
  if (hasPageIndex) {
    const pageIndex = parsePageIndex(toolArgs);
    const page = pages[pageIndex];
    if (!page) {
      throw new Error(`pageIndex out of range: ${pageIndex}`);
    }
    return { page, pageIndex };
  }
  if (pageId) {
    const pageIndex = findPageIndexById(pages, pageId);
    if (pageIndex === -1) {
      throw new Error(`page not found: ${pageId}`);
    }
    return { page: pages[pageIndex], pageIndex };
  }
  const selectedIndex = findPageIndexById(pages, defaultSelectedId);
  if (selectedIndex === -1) {
    if (!allowImplicitFallback && defaultSelectedId) {
      throw new Error(
        'Selected page is no longer available; specify pageIndex or pageId explicitly.'
      );
    }
    const fallbackPage = pages[0];
    if (!fallbackPage) {
      throw new Error('Browser MCP did not find any page targets in the current Chrome session.');
    }
    return { page: fallbackPage, pageIndex: 0 };
  }
  return { page: pages[selectedIndex], pageIndex: selectedIndex };
}

async function getSelectedPage(toolArgs) {
  const pages = await listPageTargets();
  if (pages.length === 0) {
    throw new Error('Browser MCP did not find any page targets in the current Chrome session.');
  }

  if (toolArgs && Object.prototype.hasOwnProperty.call(toolArgs, 'pageIndex')) {
    const pageIndex = parsePageIndex(toolArgs);
    const page = pages[pageIndex];
    if (!page) {
      throw new Error(
        `Browser MCP page index ${pageIndex} is out of range (found ${pages.length} pages).`
      );
    }
    if (!page.webSocketDebuggerUrl) {
      throw new Error(`Browser MCP page ${pageIndex} does not expose a websocket debugger URL.`);
    }
    return { page, pageIndex, pages };
  }

  let pageIndex = findPageIndexById(pages, selectedPageId);
  if (pageIndex === -1) {
    selectedPageId = resolveFallbackSelectedPageId(pages, 0);
    pageIndex = findPageIndexById(pages, selectedPageId);
  }

  const page = pages[pageIndex];
  if (!page || !page.webSocketDebuggerUrl) {
    throw new Error('Browser MCP could not resolve a selected page target.');
  }

  return { page, pageIndex, pages };
}

function formatSessionInfo(pages, selectedId) {
  return [
    '[CCS Browser Session]',
    '',
    ...pages.map((page, index) => {
      const selectedSuffix = page.id === selectedId ? ' | selected: true' : '';
      return `${index}. ${page.title || '<untitled>'} | ${page.url || '<empty>'}${selectedSuffix}`;
    }),
  ].join('\n');
}

function createEvaluateExpression(kind) {
  switch (kind) {
    case 'url-title':
      return `JSON.stringify({ title: document.title, url: location.href })`;
    case 'visible-text':
      return `document.body ? document.body.innerText : ''`;
    case 'dom-snapshot':
      return `document.documentElement ? document.documentElement.outerHTML : ''`;
    default:
      throw new Error(`Unknown browser evaluation kind: ${kind}`);
  }
}

async function sendCdpCommand(page, method, params = {}) {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const requestId = ++requestCounter;

  return await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        abortSocket(ws);
        reject(new Error('Browser MCP timed out waiting for a DevTools response.'));
      }
    }, CDP_TIMEOUT_MS);

    function settleError(error) {
      if (settled) {
        return;
      }
      clearTimeout(timer);
      settled = true;
      reject(toSocketError(error));
    }

    addSocketListener(ws, 'open', () => {
      ws.send(
        JSON.stringify({
          id: requestId,
          method,
          params,
        })
      );
    });

    addSocketListener(ws, 'message', (data) => {
      void (async () => {
        const raw = await getSocketMessageText(data);

        if (settled) {
          return;
        }

        let message;
        try {
          message = JSON.parse(raw);
        } catch {
          return;
        }

        if (message.id !== requestId) {
          return;
        }

        clearTimeout(timer);
        settled = true;
        closeSocket(ws);

        if (message.error) {
          reject(new Error(message.error.message || 'DevTools request failed.'));
          return;
        }

        resolve(message.result || null);
      })().catch(settleError);
    });

    addSocketListener(ws, 'error', (error) => {
      settleError(error);
    });

    addSocketListener(ws, 'close', () => {
      if (settled) {
        return;
      }
      settleError(new Error('Browser MCP lost the DevTools websocket connection.'));
    });
  });
}

async function getBrowserTarget() {
  const targets = await fetchJson(`${getHttpUrl()}/json/list`);
  const browserTarget = Array.isArray(targets)
    ? targets.find((target) => target && typeof target === 'object' && target.type === 'browser')
    : null;
  if (
    !browserTarget ||
    typeof browserTarget.webSocketDebuggerUrl !== 'string' ||
    !browserTarget.webSocketDebuggerUrl
  ) {
    throw new Error('browser-level download events are unavailable');
  }
  return browserTarget;
}

async function sendBrowserCdpCommand(method, params = {}) {
  const browserTarget = await getBrowserTarget();
  const ws = new WebSocket(browserTarget.webSocketDebuggerUrl);
  const requestId = ++requestCounter;

  return await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        abortSocket(ws);
        reject(new Error('Browser MCP timed out waiting for a DevTools response.'));
      }
    }, CDP_TIMEOUT_MS);

    function settleError(error) {
      if (settled) {
        return;
      }
      clearTimeout(timer);
      settled = true;
      reject(toSocketError(error));
    }

    addSocketListener(ws, 'open', () => {
      ws.send(JSON.stringify({ id: requestId, method, params }));
    });

    addSocketListener(ws, 'message', (data) => {
      void (async () => {
        const raw = await getSocketMessageText(data);
        if (settled) {
          return;
        }

        let message;
        try {
          message = JSON.parse(raw);
        } catch {
          return;
        }

        if (message.id !== requestId) {
          return;
        }

        clearTimeout(timer);
        settled = true;
        closeSocket(ws);

        if (message.error) {
          reject(new Error(message.error.message || 'DevTools request failed.'));
          return;
        }

        resolve(message.result || null);
      })().catch(settleError);
    });

    addSocketListener(ws, 'error', settleError);
    addSocketListener(ws, 'close', () => {
      if (!settled) {
        settleError(new Error('Browser MCP lost the DevTools websocket connection.'));
      }
    });
  });
}

async function ensureBrowserDownloadSession() {
  if (browserDownloadSession) {
    await browserDownloadSession.ready;
    return browserDownloadSession;
  }

  const browserTarget = await getBrowserTarget();
  const ws = new WebSocket(browserTarget.webSocketDebuggerUrl);
  let resolveReady;
  let rejectReady;
  let activityChain = Promise.resolve();
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  browserDownloadSession = {
    ws,
    ready,
    getLastActivity() {
      return activityChain;
    },
  };

  addSocketListener(ws, 'open', () => {
    if (resolveReady) {
      resolveReady();
      resolveReady = null;
      rejectReady = null;
    }
  });

  addSocketListener(ws, 'message', (data) => {
    const activity = (async () => {
      const raw = await getSocketMessageText(data);
      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        return;
      }

      if (message?.method === 'Browser.downloadWillBegin') {
        pushRecentDownload({
          downloadId: `download-${nextDownloadCounter++}`,
          guid: String(message.params?.guid || ''),
          pageId: '',
          url: String(message.params?.url || ''),
          suggestedFilename: String(message.params?.suggestedFilename || ''),
          status: 'started',
          savedPath: '',
          receivedBytes: 0,
          totalBytes: 0,
          startedAt: new Date().toISOString(),
          finishedAt: '',
        });
        return;
      }

      if (message?.method === 'Browser.downloadProgress') {
        const status = resolveDownloadStatus(String(message.params?.state || 'inProgress'));
        updateRecentDownload(String(message.params?.guid || ''), {
          status,
          receivedBytes: Number(message.params?.receivedBytes || 0),
          totalBytes: Number(message.params?.totalBytes || 0),
          savedPath: typeof message.params?.filePath === 'string' ? message.params.filePath : '',
          finishedAt:
            status === 'completed' || status === 'canceled' ? new Date().toISOString() : '',
        });
      }
    })();
    activityChain = activityChain
      .catch(() => {})
      .then(() => activity)
      .catch(() => {});
    void activity.catch(() => {});
  });

  addSocketListener(ws, 'close', () => {
    if (rejectReady) {
      rejectReady(new Error('Browser MCP lost the DevTools websocket connection.'));
    }
    browserDownloadSession = null;
  });

  addSocketListener(ws, 'error', (error) => {
    if (rejectReady) {
      rejectReady(toSocketError(error));
    }
    browserDownloadSession = null;
  });

  await ready;
  return browserDownloadSession;
}

async function evaluateInPage(page, kind) {
  const response = await sendCdpCommand(page, 'Runtime.evaluate', {
    expression: createEvaluateExpression(kind),
    returnByValue: true,
  });

  const result = response && response.result ? response.result : null;
  if (!result) {
    throw new Error('Browser MCP received an invalid DevTools evaluation response.');
  }

  if (result.subtype === 'error') {
    throw new Error(result.description || 'DevTools evaluation returned an error.');
  }

  return typeof result.value === 'string' ? result.value : (result.value ?? '');
}

async function evaluateExpression(page, expression) {
  const response = await sendCdpCommand(page, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
  });

  const result = response && response.result ? response.result : null;
  if (!result) {
    throw new Error('Browser MCP received an invalid DevTools evaluation response.');
  }

  if (result.subtype === 'error') {
    throw new Error(result.description || 'DevTools evaluation returned an error.');
  }

  return typeof result.value === 'string' ? result.value : (result.value ?? '');
}

async function withPageCommandSession(page, callback) {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let resolveReady;
  let rejectReady;
  let settled = false;
  const pendingCommands = new Map();
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  function settleReadyError(error) {
    if (rejectReady) {
      rejectReady(error instanceof Error ? error : new Error(String(error)));
      rejectReady = null;
      resolveReady = null;
    }
  }

  function rejectPendingCommands(error) {
    for (const pending of pendingCommands.values()) {
      pending.reject(error instanceof Error ? error : new Error(String(error)));
    }
    pendingCommands.clear();
  }

  addSocketListener(ws, 'open', () => {
    if (resolveReady) {
      resolveReady();
      resolveReady = null;
      rejectReady = null;
    }
  });

  addSocketListener(ws, 'message', (data) => {
    void (async () => {
      const raw = await getSocketMessageText(data);
      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        return;
      }
      if (!message?.id || !pendingCommands.has(message.id)) {
        return;
      }
      const pending = pendingCommands.get(message.id);
      pendingCommands.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || 'DevTools request failed.'));
        return;
      }
      pending.resolve(message.result || null);
    })().catch((error) => {
      const socketError = toSocketError(error);
      if (!settled) {
        settleReadyError(socketError);
        rejectPendingCommands(socketError);
      }
    });
  });

  addSocketListener(ws, 'close', () => {
    const error = new Error('Browser MCP lost the DevTools websocket connection.');
    if (!settled) {
      settleReadyError(error);
      rejectPendingCommands(error);
    }
  });

  addSocketListener(ws, 'error', (error) => {
    const socketError = toSocketError(error);
    if (!settled) {
      settleReadyError(socketError);
      rejectPendingCommands(socketError);
    }
  });

  await ready;

  const session = {
    async sendCommand(method, params = {}) {
      const requestId = ++requestCounter;
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingCommands.delete(requestId);
          reject(new Error('Browser MCP timed out waiting for a DevTools response.'));
        }, CDP_TIMEOUT_MS);
        pendingCommands.set(requestId, {
          resolve(result) {
            clearTimeout(timer);
            resolve(result);
          },
          reject(error) {
            clearTimeout(timer);
            reject(error);
          },
        });
        ws.send(JSON.stringify({ id: requestId, method, params }));
      });
    },
  };

  try {
    return await callback(session);
  } finally {
    settled = true;
    rejectPendingCommands(new Error('Browser MCP closed the page command session.'));
    closeSocket(ws);
  }
}

async function evaluateObjectHandle(session, expression) {
  const response = await session.sendCommand('Runtime.evaluate', {
    expression,
    returnByValue: false,
  });

  const result = response && response.result ? response.result : null;
  if (!result) {
    throw new Error('Browser MCP received an invalid DevTools evaluation response.');
  }

  if (result.subtype === 'error') {
    throw new Error(result.description || 'DevTools evaluation returned an error.');
  }

  if (typeof result.objectId !== 'string' || !result.objectId) {
    throw new Error('Browser MCP could not resolve a file input handle.');
  }

  return result.objectId;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function requireString(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label} is required`);
  }
  return value;
}

function requireValidHttpUrl(value) {
  const raw = requireNonEmptyString(value, 'url');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('url must be an absolute http or https URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('url must be an absolute http or https URL');
  }

  return parsed.toString();
}

function parseQueryFields(value) {
  if (value === undefined) {
    return DEFAULT_QUERY_FIELDS;
  }
  if (!Array.isArray(value) || value.some((field) => typeof field !== 'string')) {
    throw new Error('fields must be an array of strings');
  }
  const unknownField = value.find((field) => !SUPPORTED_QUERY_FIELD_SET.has(field));
  if (unknownField) {
    throw new Error(`unknown query field: ${unknownField}`);
  }
  return value;
}

function requireOptionalNonNegativeInteger(value, label) {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function requirePositiveIntegerOrDefault(value, label, fallback) {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function requireFiniteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function requireEnumString(value, label, allowedValues) {
  if (value === undefined) {
    return undefined;
  }
  const normalized = requireNonEmptyString(value, label);
  if (!allowedValues.includes(normalized)) {
    throw new Error(`${label} must be one of: ${allowedValues.join(', ')}`);
  }
  return normalized;
}

function requireOptionalStringArray(value, label, allowedValues) {
  if (value === undefined) {
    return [];
  }
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.trim() === '')
  ) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  const normalized = value.map((item) => item.trim());
  if (Array.isArray(allowedValues) && allowedValues.length > 0) {
    for (const item of normalized) {
      if (!allowedValues.includes(item)) {
        throw new Error(`${label} must only contain: ${allowedValues.join(', ')}`);
      }
    }
  }
  return normalized;
}

function requireNonEmptyStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array of non-empty strings`);
  }
  if (value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(`${label} must be a non-empty array of non-empty strings`);
  }
  return value.map((item) => item.trim());
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function getBrowserEvalMode() {
  const raw = String(process.env.CCS_BROWSER_EVAL_MODE || 'readonly').trim();
  if (raw === 'disabled' || raw === 'readonly' || raw === 'readwrite') {
    return raw;
  }
  return 'readonly';
}

function createSessionCanceledError(kind) {
  const error = new Error(`${kind} canceled`);
  error.code = SESSION_CANCELED_ERROR_CODE;
  return error;
}

function isSessionCanceledError(error) {
  return Boolean(error && typeof error === 'object' && error.code === SESSION_CANCELED_ERROR_CODE);
}

function throwIfSessionCanceled(session, kind) {
  if (session?.cancelRequested === true) {
    throw createSessionCanceledError(kind);
  }
}

function markOrchestrationFailureRecorded(error) {
  if (error && typeof error === 'object') {
    error.orchestrationFailureRecorded = true;
  }
  return error;
}

function wasOrchestrationFailureRecorded(error) {
  return Boolean(error && typeof error === 'object' && error.orchestrationFailureRecorded === true);
}

function normalizeDevtoolsResultValue(result) {
  if (!result || typeof result !== 'object') {
    return { serializable: false, value: undefined };
  }
  if (Object.prototype.hasOwnProperty.call(result, 'value')) {
    return { serializable: true, value: result.value };
  }
  if (Object.prototype.hasOwnProperty.call(result, 'unserializableValue')) {
    return { serializable: true, value: result.unserializableValue };
  }
  if (result.type === 'undefined') {
    return { serializable: true, value: undefined };
  }
  return { serializable: false, value: undefined };
}

function requireArtifactName(value, label = 'name') {
  const name = requireNonEmptyString(value, label);
  if (!SAFE_ARTIFACT_NAME_PATTERN.test(name)) {
    throw new Error(
      'artifact name must start with a letter or number and contain only letters, numbers, dots, underscores, or hyphens'
    );
  }
  return name;
}

function parseOptionalNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : '';
}

function formatScopedSelectorSuffix(frameSelector, pierceShadow) {
  return `${frameSelector ? `\nframeSelector: ${frameSelector}` : ''}${pierceShadow ? '\npierceShadow: true' : ''}`;
}

function buildScopedMatchesExpression(selector, nth, frameSelector, pierceShadow) {
  return `(() => {
    const selector = JSON.parse(${JSON.stringify(JSON.stringify(selector))});
    const nth = ${nth === undefined ? 'undefined' : String(nth)};
    const frameSelector = ${frameSelector ? `JSON.parse(${JSON.stringify(JSON.stringify(frameSelector))})` : 'undefined'};
    const pierceShadow = ${pierceShadow ? 'true' : 'false'};

    const visitRoots = (root) => {
      const roots = [root];
      if (!pierceShadow) {
        return roots;
      }
      const queue = [root];
      while (queue.length > 0) {
        const current = queue.shift();
        const elements = Array.from(current.querySelectorAll('*'));
        for (const element of elements) {
          if (element.shadowRoot) {
            roots.push(element.shadowRoot);
            queue.push(element.shadowRoot);
          }
        }
      }
      return roots;
    };

    let root = document;
    if (frameSelector) {
      const frame = document.querySelector(frameSelector);
      if (!frame) {
        throw new Error('frame not found for selector: ' + frameSelector);
      }
      const frameDocument = frame.contentDocument;
      if (!frameDocument) {
        throw new Error('frame document is unavailable for selector: ' + frameSelector);
      }
      root = frameDocument;
    }

    const roots = visitRoots(root);
    const matches = [];
    for (const currentRoot of roots) {
      matches.push(...Array.from(currentRoot.querySelectorAll(selector)));
    }

    const count = matches.length;
    const targetIndex = nth ?? 0;
    const element = matches[targetIndex];
    if (!element) {
      return JSON.stringify({
        exists: nth === undefined ? count > 0 : count > targetIndex,
        count,
        targetIndex,
        targetMissing: true,
      });
    }

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const text = typeof element.innerText === 'string' ? element.innerText : (element.textContent || '');
    return JSON.stringify({
      exists: true,
      count,
      targetIndex,
      connected: element.isConnected,
      text,
      innerText: typeof element.innerText === 'string' ? element.innerText : '',
      textContent: element.textContent || '',
      boundingClientRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      },
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      href: typeof element.getAttribute === 'function' ? element.getAttribute('href') || '' : '',
      onclick: typeof element.getAttribute === 'function' ? element.getAttribute('onclick') || '' : '',
      interactable:
        element.isConnected &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0,
      centerPoint: {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      },
    });
  })()`;
}

async function getScopedDiagnostics(page, selector, nth, frameSelector, pierceShadow) {
  const raw = await evaluateExpression(
    page,
    buildScopedMatchesExpression(selector, nth, frameSelector, pierceShadow)
  );
  return JSON.parse(raw);
}

function buildFileInputHandleExpression(selector, nth, frameSelector, pierceShadow) {
  return `(() => {
    const selector = JSON.parse(${JSON.stringify(JSON.stringify(selector))});
    const nth = ${nth === undefined ? 'undefined' : String(nth)};
    const frameSelector = ${frameSelector ? `JSON.parse(${JSON.stringify(JSON.stringify(frameSelector))})` : 'undefined'};
    const pierceShadow = ${pierceShadow ? 'true' : 'false'};

    const visitRoots = (root) => {
      const roots = [root];
      if (!pierceShadow) {
        return roots;
      }
      const queue = [root];
      while (queue.length > 0) {
        const current = queue.shift();
        const elements = Array.from(current.querySelectorAll('*'));
        for (const element of elements) {
          if (element.shadowRoot) {
            roots.push(element.shadowRoot);
            queue.push(element.shadowRoot);
          }
        }
      }
      return roots;
    };

    let root = document;
    if (frameSelector) {
      const frame = document.querySelector(frameSelector);
      if (!frame) {
        throw new Error('frame not found for selector: ' + frameSelector);
      }
      const frameDocument = frame.contentDocument;
      if (!frameDocument) {
        throw new Error('frame document is unavailable for selector: ' + frameSelector);
      }
      root = frameDocument;
    }

    const roots = visitRoots(root);
    const matches = [];
    for (const currentRoot of roots) {
      matches.push(...Array.from(currentRoot.querySelectorAll(selector)));
    }

    const targetIndex = nth ?? 0;
    const element = matches[targetIndex];
    if (!element) {
      throw new Error('element not found for selector: ' + selector);
    }
    if (!(element instanceof HTMLInputElement) || element.type !== 'file') {
      throw new Error('element is not a file input for selector: ' + selector);
    }
    return element;
  })()`;
}

function validateLocalFiles(files) {
  if (files.length > MAX_LOCAL_TRANSFER_FILES) {
    throw new Error(`files exceeds maximum of ${MAX_LOCAL_TRANSFER_FILES}`);
  }

  const safeRoots = getUploadSafeRoots().map(resolveExistingRoot);
  return files.map((filePath) => {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`file does not exist: ${resolvedPath}`);
    }
    const realFilePath = fs.realpathSync(resolvedPath);
    const containingRoot = findContainingRoot(realFilePath, safeRoots);
    if (!containingRoot) {
      throw new Error(
        'file must be inside the browser session download directory or a CCS_BROWSER_UPLOAD_ROOTS entry'
      );
    }
    assertNoSensitiveLocalPathSegments(realFilePath, containingRoot, 'file');

    const stat = fs.statSync(realFilePath);
    if (!stat.isFile()) {
      throw new Error(`file is not a regular file: ${realFilePath}`);
    }
    if (stat.size > MAX_LOCAL_TRANSFER_FILE_BYTES) {
      throw new Error(
        `file exceeds maximum size of ${MAX_LOCAL_TRANSFER_FILE_BYTES} bytes: ${realFilePath}`
      );
    }
    return realFilePath;
  });
}

function formatFileInputResult({ pageIndex, selector, nth, frameSelector, pierceShadow, files }) {
  const lines = [
    `pageIndex: ${pageIndex}`,
    `selector: ${selector}`,
    `nth: ${nth}`,
    `fileCount: ${files.length}`,
  ];
  if (frameSelector) {
    lines.push(`frameSelector: ${frameSelector}`);
  }
  if (pierceShadow) {
    lines.push('pierceShadow: true');
  }
  lines.push('status: files-set');
  return lines.join('\n');
}

function inferMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.txt') return 'text/plain';
  if (ext === '.json') return 'application/json';
  return 'application/octet-stream';
}

function readLocalFilesForDrop(files) {
  return validateLocalFiles(files).map((resolvedPath) => {
    const buffer = fs.readFileSync(resolvedPath);
    return {
      path: resolvedPath,
      name: path.basename(resolvedPath),
      mimeType: inferMimeType(resolvedPath),
      size: buffer.length,
      base64: buffer.toString('base64'),
    };
  });
}

function buildDropFilesExpression(selector, nth, frameSelector, pierceShadow, files) {
  return `(() => {
    const selector = JSON.parse(${JSON.stringify(JSON.stringify(selector))});
    const nth = ${nth === undefined ? 'undefined' : String(nth)};
    const frameSelector = ${frameSelector ? `JSON.parse(${JSON.stringify(JSON.stringify(frameSelector))})` : 'undefined'};
    const pierceShadow = ${pierceShadow ? 'true' : 'false'};
    const filePayloads = JSON.parse(${JSON.stringify(JSON.stringify(files))});

    const visitRoots = (root) => {
      const roots = [root];
      if (!pierceShadow) {
        return roots;
      }
      const queue = [root];
      while (queue.length > 0) {
        const current = queue.shift();
        const elements = Array.from(current.querySelectorAll('*'));
        for (const element of elements) {
          if (element.shadowRoot) {
            roots.push(element.shadowRoot);
            queue.push(element.shadowRoot);
          }
        }
      }
      return roots;
    };

    let root = document;
    if (frameSelector) {
      const frame = document.querySelector(frameSelector);
      if (!frame) {
        throw new Error('frame not found for selector: ' + frameSelector);
      }
      const frameDocument = frame.contentDocument;
      if (!frameDocument) {
        throw new Error('frame document is unavailable for selector: ' + frameSelector);
      }
      root = frameDocument;
    }

    const roots = visitRoots(root);
    const matches = [];
    for (const currentRoot of roots) {
      matches.push(...Array.from(currentRoot.querySelectorAll(selector)));
    }

    const targetIndex = nth ?? 0;
    const element = matches[targetIndex];
    if (!element) {
      throw new Error('element not found for selector: ' + selector);
    }

    const files = filePayloads.map((file) => {
      const binary = atob(file.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return new File([bytes], file.name, { type: file.mimeType });
    });

    const dataTransfer = new DataTransfer();
    for (const file of files) {
      dataTransfer.items.add(file);
    }

    const dragEnterEvent = new DragEvent('dragenter', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    });
    const dragOverEvent = new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    });
    const dropEvent = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    });

    element.dispatchEvent(dragEnterEvent);
    const dragOverCanceled =
      element.dispatchEvent(dragOverEvent) === false || dragOverEvent.defaultPrevented;
    const dropCanceled = element.dispatchEvent(dropEvent) === false || dropEvent.defaultPrevented;

    return { accepted: dragOverCanceled || dropCanceled };
  })()`;
}

function formatDragFilesResult({ pageIndex, selector, nth, frameSelector, pierceShadow, files }) {
  const lines = [
    `pageIndex: ${pageIndex}`,
    `selector: ${selector}`,
    `nth: ${nth}`,
    `fileCount: ${files.length}`,
  ];
  if (frameSelector) {
    lines.push(`frameSelector: ${frameSelector}`);
  }
  if (pierceShadow) {
    lines.push('pierceShadow: true');
  }
  lines.push('status: files-dropped');
  return lines.join('\n');
}

function createRecordingId() {
  const recordingId = `rec_${String(nextRecordingCounter).padStart(4, '0')}`;
  nextRecordingCounter += 1;
  return recordingId;
}

function createReplayId() {
  const replayId = `rep_${String(nextReplayCounter).padStart(4, '0')}`;
  nextReplayCounter += 1;
  return replayId;
}

function requireLatestRecording() {
  if (!latestRecordingSession) {
    throw new Error('no recording available');
  }
  return latestRecordingSession;
}

function formatRecordingSummary(session) {
  return [
    `recordingId: ${session.recordingId}`,
    `pageId: ${session.pageId}`,
    `pageIndex: ${session.pageIndex}`,
    `stepCount: ${session.steps.length}`,
    `warningCount: ${session.warnings.length}`,
    `status: ${session.status}`,
  ].join('\n');
}

function getArtifactDir() {
  const scoped = Buffer.from(process.cwd()).toString('base64url');
  const baseDir = path.join(os.tmpdir(), 'ccs-browser-artifacts', scoped);
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true, mode: 0o700 });
  }
  try {
    fs.chmodSync(baseDir, 0o700);
  } catch {
    // Best-effort on platforms/filesystems that ignore permission changes.
  }
  return baseDir;
}

function getArtifactPath(name) {
  const safeName = requireArtifactName(name);
  return path.join(getArtifactDir(), `${safeName}.json`);
}

function buildArtifact(kind, name, payload) {
  return {
    kind,
    version: 1,
    name,
    createdAt: new Date().toISOString(),
    payload,
  };
}

function readArtifactFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error('artifact file not found');
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error('artifact file is not a regular file');
  }
  if (stat.size > MAX_ARTIFACT_FILE_BYTES) {
    throw new Error(`artifact file exceeds maximum size of ${MAX_ARTIFACT_FILE_BYTES} bytes`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('invalid artifact payload');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('invalid artifact payload');
  }
  if (parsed.version !== 1) {
    throw new Error('unsupported artifact version');
  }
  if (
    typeof parsed.kind !== 'string' ||
    typeof parsed.name !== 'string' ||
    !('payload' in parsed)
  ) {
    throw new Error('invalid artifact payload');
  }
  return parsed;
}

function createOrchestrationId() {
  const orchestrationId = `orc_${String(nextOrchestrationCounter).padStart(4, '0')}`;
  nextOrchestrationCounter += 1;
  return orchestrationId;
}

function requireLatestReplay() {
  if (!latestReplaySession) {
    throw new Error('no replay available');
  }
  return latestReplaySession;
}

function requireLatestOrchestration() {
  if (!latestOrchestrationSession) {
    throw new Error('no orchestration available');
  }
  return latestOrchestrationSession;
}

function formatReplaySummary(session) {
  return [
    `replayId: ${session.replayId}`,
    `pageId: ${session.pageId}`,
    `pageIndex: ${session.pageIndex}`,
    `stepCount: ${session.stepCount}`,
    `completedSteps: ${session.completedSteps}`,
    `currentStepIndex: ${session.currentStepIndex}`,
    `failedStepIndex: ${session.failedStepIndex === null ? 'none' : session.failedStepIndex}`,
    `error: ${session.error || 'none'}`,
    `status: ${session.status}`,
  ].join('\n');
}

function formatOrchestrationSummary(session) {
  const lines = [
    `orchestrationId: ${session.orchestrationId}`,
    `pageId: ${session.pageId}`,
    `pageIndex: ${session.pageIndex}`,
    `blockCount: ${session.blockCount}`,
    `completedBlocks: ${session.completedBlocks}`,
    `failedCount: ${session.failedCount || 0}`,
    `currentBlockIndex: ${session.currentBlockIndex}`,
    `failedBlockIndex: ${session.failedBlockIndex === null ? 'none' : session.failedBlockIndex}`,
    `error: ${session.error || 'none'}`,
    `status: ${session.status}`,
  ];
  if (Array.isArray(session.failures) && session.failures.length > 0) {
    session.failures.forEach((failure, index) => {
      lines.push(`failure[${index}].blockIndex: ${failure.blockIndex}`);
      lines.push(
        `failure[${index}].sequenceStepIndex: ${failure.sequenceStepIndex === null ? 'none' : failure.sequenceStepIndex}`
      );
      lines.push(`failure[${index}].type: ${failure.type}`);
      lines.push(`failure[${index}].message: ${failure.message}`);
    });
  }
  if (session.failedSequenceStepIndex !== null && session.failedSequenceStepIndex !== undefined) {
    lines.push(`failedSequenceStepIndex: ${session.failedSequenceStepIndex}`);
  }
  if (session.errorDetails?.failedAssertionIndex !== undefined) {
    lines.push(`failedAssertionIndex: ${session.errorDetails.failedAssertionIndex}`);
    lines.push(`field: ${session.errorDetails.field}`);
    lines.push(`op: ${session.errorDetails.op}`);
    lines.push(`expected: ${JSON.stringify(session.errorDetails.expected)}`);
    lines.push(`actual: ${JSON.stringify(session.errorDetails.actual)}`);
  }
  return lines.join('\n');
}

async function waitForSessionToSettle(task) {
  await Promise.race([task.then(() => undefined), sleep(SESSION_START_SETTLE_WINDOW_MS)]);
}

function createReplaySession(page, pageIndex, steps) {
  return {
    replayId: createReplayId(),
    pageId: page.id,
    pageIndex,
    status: 'running',
    stepCount: steps.length,
    completedSteps: 0,
    currentStepIndex: 0,
    failedStepIndex: null,
    error: null,
    cancelRequested: false,
    steps,
  };
}

function createOrchestrationSession(page, pageIndex, blocks) {
  return {
    orchestrationId: createOrchestrationId(),
    pageId: page.id,
    pageIndex,
    status: 'running',
    blockCount: blocks.length,
    completedBlocks: 0,
    currentBlockIndex: 0,
    failedBlockIndex: null,
    failedSequenceStepIndex: null,
    error: null,
    failedCount: 0,
    failures: [],
    cancelRequested: false,
    blocks,
  };
}

function formatRecordingDetail(session) {
  const lines = [formatRecordingSummary(session), 'steps:'];
  if (session.steps.length === 0) {
    lines.push('[]');
  } else {
    session.steps.forEach((step, index) => {
      lines.push(`- [${index}] type: ${step.type}`);
      lines.push(`  pageId: ${step.pageId}`);
      lines.push(`  timestamp: ${step.timestamp}`);
      if (step.selector) {
        lines.push(`  selector: ${step.selector}`);
      }
      if (step.frameSelector) {
        lines.push(`  frameSelector: ${step.frameSelector}`);
      }
      if (step.pierceShadow === true) {
        lines.push('  pierceShadow: true');
      }
      if (step.args && typeof step.args === 'object') {
        for (const [key, value] of Object.entries(step.args)) {
          if (value !== undefined) {
            lines.push(`  ${key}: ${JSON.stringify(value)}`);
          }
        }
      }
    });
  }

  lines.push('warnings:');
  if (session.warnings.length === 0) {
    lines.push('[]');
  } else {
    session.warnings.forEach((warning) => {
      lines.push(`- ${warning}`);
    });
  }

  return lines.join('\n');
}

const SUPPORTED_REPLAY_STEP_TYPES = new Set([
  'click',
  'type',
  'press_key',
  'scroll',
  'drag_element',
  'pointer_action',
]);

function requireReplaySteps(toolArgs) {
  const steps = Array.isArray(toolArgs.steps) ? toolArgs.steps : null;
  if (!steps || steps.length === 0) {
    throw new Error('steps must be a non-empty array');
  }
  return steps;
}

function validateReplayStep(step, replayPageId) {
  if (!step || typeof step !== 'object') {
    throw new Error('invalid replay step payload');
  }
  if (!SUPPORTED_REPLAY_STEP_TYPES.has(step.type)) {
    throw new Error('unsupported replay step type');
  }
  if (step.pageId && step.pageId !== replayPageId) {
    throw new Error('replay step pageId mismatch');
  }
}

const SUPPORTED_ORCHESTRATION_BLOCK_TYPES = new Set([
  'wait_for_then_click',
  'wait_for_then_type',
  'wait_for_then_press_key',
  'run_replay_sequence',
  'assert_query',
  'sequence',
  'open_page_then_run',
  'select_page_then_run',
  'close_page_then_continue',
]);

const CROSS_PAGE_BLOCK_TYPES = new Set([
  'open_page_then_run',
  'select_page_then_run',
  'close_page_then_continue',
]);

const SUPPORTED_ASSERTION_OPERATORS = new Set(['equals', 'contains', 'gt', 'gte', 'lt', 'lte']);

function parseAssertionValue(value) {
  return value;
}

function toComparableNumber(field, value) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    throw new Error(`numeric comparison expects a number-like field: ${field}`);
  }
  return numeric;
}

function parseAssertions(assertQueryArgs) {
  if (Array.isArray(assertQueryArgs.assertions) && assertQueryArgs.assertions.length > 0) {
    return assertQueryArgs.assertions.map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error(`invalid assertion payload at index ${index}`);
      }
      const field = requireNonEmptyString(entry.field, 'assertion.field');
      const op = requireNonEmptyString(entry.op, 'assertion.op');
      if (!SUPPORTED_ASSERTION_OPERATORS.has(op)) {
        throw new Error('unsupported assertion operator');
      }
      if (!Object.prototype.hasOwnProperty.call(entry, 'value')) {
        throw new Error('assertion value is required');
      }
      return { field, op, value: parseAssertionValue(entry.value) };
    });
  }

  if (assertQueryArgs.assert && typeof assertQueryArgs.assert === 'object') {
    return [
      {
        field: requireNonEmptyString(assertQueryArgs.assert.field, 'assert.field'),
        op: 'equals',
        value: assertQueryArgs.assert.equals,
      },
    ];
  }

  throw new Error('assertions must be a non-empty array');
}

function parseQueryTextToMap(text) {
  const result = {};
  for (const line of String(text || '').split('\n')) {
    const separatorIndex = line.indexOf(': ');
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 2).trim();
    result[key] = rawValue;
  }
  return result;
}

function evaluateAssertion(assertion, actualValue, assertionIndex) {
  const { field, op, value: expected } = assertion;

  if (op === 'equals') {
    return String(actualValue) === String(expected)
      ? null
      : {
          failedAssertionIndex: assertionIndex,
          field,
          op,
          expected,
          actual: actualValue,
          message: `assert_query failed: ${field} equals ${JSON.stringify(expected)} (actual: ${JSON.stringify(actualValue)})`,
        };
  }

  if (op === 'contains') {
    if (typeof actualValue !== 'string') {
      throw new Error('contains expects a string field');
    }
    return actualValue.includes(String(expected))
      ? null
      : {
          failedAssertionIndex: assertionIndex,
          field,
          op,
          expected,
          actual: actualValue,
          message: `assert_query failed: ${field} contains ${JSON.stringify(expected)} (actual: ${JSON.stringify(actualValue)})`,
        };
  }

  const actualNumber = toComparableNumber(field, actualValue);
  const expectedNumber = toComparableNumber(field, expected);
  const passed =
    op === 'gt'
      ? actualNumber > expectedNumber
      : op === 'gte'
        ? actualNumber >= expectedNumber
        : op === 'lt'
          ? actualNumber < expectedNumber
          : actualNumber <= expectedNumber;

  return passed
    ? null
    : {
        failedAssertionIndex: assertionIndex,
        field,
        op,
        expected: expectedNumber,
        actual: actualNumber,
        message: `assert_query failed: ${field} ${op} ${expectedNumber} (actual: ${actualNumber})`,
      };
}

function formatOrchestrationError(error) {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(message);
    if (parsed && typeof parsed === 'object' && 'failedAssertionIndex' in parsed) {
      return parsed;
    }
  } catch {
    // Keep plain-text error fallback below.
  }
  return { message };
}

function pushOrchestrationFailure(session, details) {
  session.failures = session.failures || [];
  session.failures.push(details);
  session.failedCount = session.failures.length;
}

function requireOrchestrationBlocks(toolArgs) {
  const blocks = Array.isArray(toolArgs.blocks) ? toolArgs.blocks : null;
  if (!blocks || blocks.length === 0) {
    throw new Error('blocks must be a non-empty array');
  }
  return blocks;
}

function validateOrchestrationBlock(block) {
  if (!block || typeof block !== 'object') {
    throw new Error('invalid orchestration block payload');
  }
  if (!SUPPORTED_ORCHESTRATION_BLOCK_TYPES.has(block.type)) {
    throw new Error('unsupported orchestration block type');
  }
}

function requireSequenceSteps(block) {
  const steps = Array.isArray(block.args?.steps) ? block.args.steps : null;
  if (!steps || steps.length === 0) {
    throw new Error('sequence steps must be a non-empty array');
  }
  return steps;
}

function validateSequenceStep(step) {
  validateOrchestrationBlock(step);
  if (step.type === 'sequence') {
    throw new Error('sequence does not support nested sequence blocks');
  }
}

function requireCrossPageRunBlock(block) {
  if (
    !block.args ||
    typeof block.args !== 'object' ||
    !block.args.run ||
    typeof block.args.run !== 'object'
  ) {
    throw new Error('cross-page run block is required');
  }
  if (CROSS_PAGE_BLOCK_TYPES.has(block.args.run.type)) {
    throw new Error('nested cross-page blocks are not supported');
  }
  return block.args.run;
}

function normalizeRecordedEvent(pageId, event) {
  if (!event || typeof event !== 'object') {
    return null;
  }

  const timestamp = typeof event.timestamp === 'number' ? event.timestamp : Date.now();
  if (event.kind === 'click') {
    return {
      type: 'click',
      pageId,
      timestamp,
      selector: event.selector,
      nth: event.nth ?? 0,
      frameSelector: event.frameSelector,
      pierceShadow: event.pierceShadow === true,
      args: {
        button: event.button || 'left',
        clickCount: event.clickCount || 1,
        offsetX: event.offsetX,
        offsetY: event.offsetY,
      },
    };
  }
  if (event.kind === 'type') {
    return {
      type: 'type',
      pageId,
      timestamp,
      selector: event.selector,
      nth: event.nth ?? 0,
      frameSelector: event.frameSelector,
      pierceShadow: event.pierceShadow === true,
      args: {
        text: event.text || '',
      },
    };
  }
  if (event.kind === 'press_key') {
    return {
      type: 'press_key',
      pageId,
      timestamp,
      args: {
        key: event.key,
        modifiers: Array.isArray(event.modifiers) ? event.modifiers : [],
      },
    };
  }
  if (event.kind === 'scroll') {
    return {
      type: 'scroll',
      pageId,
      timestamp,
      selector: event.selector,
      frameSelector: event.frameSelector,
      pierceShadow: event.pierceShadow === true,
      args: {
        deltaX: event.deltaX || 0,
        deltaY: event.deltaY || 0,
      },
    };
  }
  if (event.kind === 'drag_element') {
    return {
      type: 'drag_element',
      pageId,
      timestamp,
      selector: event.selector,
      nth: event.nth ?? 0,
      frameSelector: event.frameSelector,
      pierceShadow: event.pierceShadow === true,
      args: {
        targetSelector: event.targetSelector,
        targetX: event.targetX,
        targetY: event.targetY,
        targetNth: event.targetNth,
      },
    };
  }
  if (event.kind === 'pointer_action') {
    return {
      type: 'pointer_action',
      pageId,
      timestamp,
      args: {
        actions: Array.isArray(event.actions) ? event.actions : [],
      },
    };
  }
  return null;
}

function parseEventCondition(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('event is required');
  }
  if (value.kind === 'dialog') {
    return {
      kind: 'dialog',
      dialogType: value.dialogType ? String(value.dialogType) : undefined,
      messageIncludes: value.messageIncludes ? String(value.messageIncludes) : undefined,
    };
  }
  if (value.kind === 'navigation') {
    return {
      kind: 'navigation',
      urlIncludes: value.urlIncludes ? String(value.urlIncludes) : undefined,
    };
  }
  if (value.kind === 'request') {
    return {
      kind: 'request',
      urlIncludes: value.urlIncludes ? String(value.urlIncludes) : undefined,
      method: value.method ? String(value.method) : undefined,
    };
  }
  if (value.kind === 'download') {
    return {
      kind: 'download',
      urlIncludes: value.urlIncludes ? String(value.urlIncludes) : undefined,
      suggestedFilenameIncludes: value.suggestedFilenameIncludes
        ? String(value.suggestedFilenameIncludes)
        : undefined,
    };
  }
  throw new Error(`unknown event kind: ${String(value.kind || '')}`);
}

function matchesObservedEvent(event, observed) {
  if (event.kind === 'dialog') {
    return (
      (!event.dialogType || observed.type === event.dialogType) &&
      (!event.messageIncludes || String(observed.message || '').includes(event.messageIncludes))
    );
  }
  if (event.kind === 'navigation') {
    return !event.urlIncludes || String(observed.url || '').includes(event.urlIncludes);
  }
  if (event.kind === 'request') {
    return (
      (!event.urlIncludes || String(observed.url || '').includes(event.urlIncludes)) &&
      (!event.method || String(observed.method || '').toUpperCase() === event.method.toUpperCase())
    );
  }
  if (event.kind === 'download') {
    return (
      (!event.urlIncludes || String(observed.url || '').includes(event.urlIncludes)) &&
      (!event.suggestedFilenameIncludes ||
        String(observed.suggestedFilename || '').includes(event.suggestedFilenameIncludes))
    );
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getNavigationState(page) {
  const raw = await evaluateExpression(
    page,
    `JSON.stringify({ href: location.href, readyState: document.readyState })`
  );
  const parsed = JSON.parse(raw);
  return {
    href: typeof parsed.href === 'string' ? parsed.href : '',
    readyState: typeof parsed.readyState === 'string' ? parsed.readyState : '',
  };
}

function isSameDocumentHashNavigation(beforeHref, requestedUrl) {
  try {
    const before = new URL(beforeHref);
    const requested = new URL(requestedUrl);
    return (
      before.origin === requested.origin &&
      before.pathname === requested.pathname &&
      before.search === requested.search &&
      before.hash !== requested.hash
    );
  } catch {
    return false;
  }
}

function isNavigationReady(state, beforeHref, requestedUrl) {
  if (state.readyState !== 'interactive' && state.readyState !== 'complete') {
    return false;
  }

  if (state.href === requestedUrl) {
    return true;
  }

  if (state.href && state.href !== beforeHref) {
    return true;
  }

  if (isSameDocumentHashNavigation(beforeHref, requestedUrl) && state.href === requestedUrl) {
    return true;
  }

  return false;
}

async function waitForNavigationReady(page, beforeHref, requestedUrl) {
  const deadline = Date.now() + CDP_TIMEOUT_MS;

  while (Date.now() <= deadline) {
    const state = await getNavigationState(page);
    if (isNavigationReady(state, beforeHref, requestedUrl)) {
      return state.href;
    }
    if (Date.now() + NAVIGATION_POLL_INTERVAL_MS > deadline) {
      break;
    }
    await sleep(NAVIGATION_POLL_INTERVAL_MS);
  }

  throw new Error(`navigation did not complete for URL: ${requestedUrl}`);
}

async function handleNavigate(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const url = requireValidHttpUrl(toolArgs.url);
  const before = await getNavigationState(page);
  const navigateResult = await sendCdpCommand(page, 'Page.navigate', { url });
  if (navigateResult && typeof navigateResult.errorText === 'string' && navigateResult.errorText) {
    throw new Error(`navigation failed for URL: ${url}: ${navigateResult.errorText}`);
  }
  const finalUrl = await waitForNavigationReady(page, before.href, url);
  return `pageIndex: ${pageIndex}\nurl: ${finalUrl}\nstatus: navigated`;
}

async function handleClick(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const selector = requireNonEmptyString(toolArgs.selector, 'selector');
  const nth = requireOptionalNonNegativeInteger(toolArgs.nth, 'nth');
  const targetIndex = nth ?? 0;
  const frameSelector = parseOptionalNonEmptyString(toolArgs.frameSelector);
  const pierceShadow = toolArgs.pierceShadow === true;
  const offsetX =
    toolArgs.offsetX === undefined ? undefined : requireFiniteNumber(toolArgs.offsetX, 'offsetX');
  const offsetY =
    toolArgs.offsetY === undefined ? undefined : requireFiniteNumber(toolArgs.offsetY, 'offsetY');
  const button =
    requireEnumString(toolArgs.button, 'button', ['left', 'middle', 'right']) || 'left';
  const clickCount =
    toolArgs.clickCount === undefined
      ? 1
      : requirePositiveInteger(toolArgs.clickCount, 'clickCount');

  const expression = `(() => {
    const selector = JSON.parse(${JSON.stringify(JSON.stringify(selector))});
    const nth = ${nth === undefined ? 'undefined' : String(nth)};
    const frameSelector = ${frameSelector ? `JSON.parse(${JSON.stringify(JSON.stringify(frameSelector))})` : 'undefined'};
    const pierceShadow = ${pierceShadow ? 'true' : 'false'};
    const offsetX = ${offsetX === undefined ? 'undefined' : String(offsetX)};
    const offsetY = ${offsetY === undefined ? 'undefined' : String(offsetY)};
    const button = JSON.parse(${JSON.stringify(JSON.stringify(button))});
    const clickCount = ${clickCount};

    const visitRoots = (root) => {
      const roots = [root];
      if (!pierceShadow) {
        return roots;
      }
      const queue = [root];
      while (queue.length > 0) {
        const current = queue.shift();
        const elements = Array.from(current.querySelectorAll('*'));
        for (const element of elements) {
          if (element.shadowRoot) {
            roots.push(element.shadowRoot);
            queue.push(element.shadowRoot);
          }
        }
      }
      return roots;
    };

    let root = document;
    if (frameSelector) {
      const frame = document.querySelector(frameSelector);
      if (!frame) {
        throw new Error('frame not found for selector: ' + frameSelector);
      }
      const frameDocument = frame.contentDocument;
      if (!frameDocument) {
        throw new Error('frame document is unavailable for selector: ' + frameSelector);
      }
      root = frameDocument;
    }

    const roots = visitRoots(root);
    const matches = [];
    for (const currentRoot of roots) {
      matches.push(...Array.from(currentRoot.querySelectorAll(selector)));
    }
    const element = matches[nth ?? 0];
    if (!element) {
      throw new Error('element index ' + (nth ?? 0) + ' is out of range for selector: ' + selector);
    }
    if (!element.isConnected) {
      throw new Error('element is detached for selector: ' + selector);
    }
    if ('disabled' in element && element.disabled) {
      throw new Error('element is disabled for selector: ' + selector);
    }
    const style = window.getComputedStyle(element);
    const initialRect = element.getBoundingClientRect();
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      initialRect.width <= 0 ||
      initialRect.height <= 0
    ) {
      throw new Error('element is hidden or not interactable for selector: ' + selector);
    }
    element.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = element.getBoundingClientRect();

    const resolvedOffsetX = offsetX === undefined ? rect.width / 2 : offsetX;
    const resolvedOffsetY = offsetY === undefined ? rect.height / 2 : offsetY;
    const clientX = rect.left + resolvedOffsetX;
    const clientY = rect.top + resolvedOffsetY;
    const buttonCode = button === 'middle' ? 1 : button === 'right' ? 2 : 0;
    const buttonsMask = buttonCode === 1 ? 4 : buttonCode === 2 ? 2 : 1;

    const dispatchMouseEvent = (type, detail, init) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        detail,
        clientX,
        clientY,
        button: buttonCode,
        buttons: type === 'mousedown' ? buttonsMask : 0,
        ...init,
      });
      return element.dispatchEvent(event);
    };

    try {
      for (let index = 1; index <= clickCount; index += 1) {
        const dispatchResult = {
          shouldActivate:
            dispatchMouseEvent('mousedown', index, {}) &&
            dispatchMouseEvent('mouseup', index, {}),
        };
        if (!dispatchResult.shouldActivate) {
          return JSON.stringify({ resolvedOffsetX, resolvedOffsetY, button, clickCount });
        }
        if (!element.isConnected) {
          return JSON.stringify({ resolvedOffsetX, resolvedOffsetY, button, clickCount });
        }
        if (button === 'left') {
          element.click();
        } else if (button === 'right') {
          element.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            detail: index,
            clientX,
            clientY,
            button: 2,
            buttons: 0,
          }));
        } else {
          element.dispatchEvent(new MouseEvent('auxclick', {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            detail: index,
            clientX,
            clientY,
            button: 1,
            buttons: 0,
          }));
        }
      }
      if (button === 'left' && clickCount === 2) {
        element.dispatchEvent(new MouseEvent('dblclick', {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          detail: 2,
          clientX,
          clientY,
          button: 0,
          buttons: 0,
        }));
      }
    } catch (mouseError) {
    }

    return JSON.stringify({ resolvedOffsetX, resolvedOffsetY, button, clickCount });
  })()`;

  const raw = await evaluateExpression(page, expression);
  const parsed = JSON.parse(raw);
  return `pageIndex: ${pageIndex}\nselector: ${selector}\nnth: ${targetIndex}\noffsetX: ${parsed.resolvedOffsetX}\noffsetY: ${parsed.resolvedOffsetY}\nbutton: ${parsed.button}\nclickCount: ${parsed.clickCount}${formatScopedSelectorSuffix(frameSelector, pierceShadow)}\nstatus: clicked`;
}

async function handleType(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const selector = requireNonEmptyString(toolArgs.selector, 'selector');
  const text = requireString(toolArgs.text, 'text');
  const clearFirst = toolArgs.clearFirst === true;

  const expression = `(() => {
    const selector = JSON.parse(${JSON.stringify(JSON.stringify(selector))});
    const text = JSON.parse(${JSON.stringify(JSON.stringify(text))});
    const clearFirst = ${clearFirst ? 'true' : 'false'};
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error('element not found for selector: ' + selector);
    }

    const dispatchEvents = (target) => {
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const focusTarget = (target) => {
      if (typeof target.focus === 'function') {
        target.focus();
      }
    };

    let readback = '';
    let expectedValue = '';

    if (element instanceof HTMLTextAreaElement) {
      focusTarget(element);
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      expectedValue = (clearFirst ? '' : element.value) + text;
      if (setter) {
        setter.call(element, expectedValue);
      } else {
        element.value = expectedValue;
      }
      dispatchEvents(element);
      readback = element.value;
    } else if (element instanceof HTMLInputElement) {
      const supportedTypes = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password']);
      const normalizedType = (element.getAttribute('type') || '').toLowerCase();
      if (!supportedTypes.has(normalizedType)) {
        throw new Error('element is not text-editable for selector: ' + selector);
      }
      focusTarget(element);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      expectedValue = (clearFirst ? '' : element.value) + text;
      if (setter) {
        setter.call(element, expectedValue);
      } else {
        element.value = expectedValue;
      }
      dispatchEvents(element);
      readback = element.value;
    } else if (element.isContentEditable === true) {
      focusTarget(element);
      expectedValue = (clearFirst ? '' : (element.textContent || '')) + text;
      element.textContent = expectedValue;
      dispatchEvents(element);
      readback = element.textContent || '';
    } else {
      throw new Error('element is not text-editable for selector: ' + selector);
    }

    if (readback !== expectedValue) {
      throw new Error('typed text verification failed for selector: ' + selector);
    }

    return JSON.stringify({ value: readback, typedLength: readback.length });
  })()`;

  const raw = await evaluateExpression(page, expression);
  const parsed = JSON.parse(raw);
  const typedLength =
    typeof parsed.typedLength === 'number' ? parsed.typedLength : String(parsed.value || '').length;
  return `pageIndex: ${pageIndex}\nselector: ${selector}\ntypedLength: ${typedLength}\nstatus: typed`;
}

async function handlePressKey(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const key = requireNonEmptyString(toolArgs.key, 'key');
  const modifiers = requireOptionalStringArray(toolArgs.modifiers, 'modifiers', [
    'Alt',
    'Control',
    'Meta',
    'Shift',
  ]);
  const repeat =
    toolArgs.repeat === undefined ? 1 : requirePositiveInteger(toolArgs.repeat, 'repeat');
  const modifierMask =
    (modifiers.includes('Alt') ? 1 : 0) |
    (modifiers.includes('Control') ? 2 : 0) |
    (modifiers.includes('Meta') ? 4 : 0) |
    (modifiers.includes('Shift') ? 8 : 0);
  const specialKeyMap = {
    Enter: { code: 'Enter', keyCode: 13, text: '\r' },
    Tab: { code: 'Tab', keyCode: 9, text: '' },
    Escape: { code: 'Escape', keyCode: 27, text: '' },
    ArrowUp: { code: 'ArrowUp', keyCode: 38, text: '' },
    ArrowDown: { code: 'ArrowDown', keyCode: 40, text: '' },
    ArrowLeft: { code: 'ArrowLeft', keyCode: 37, text: '' },
    ArrowRight: { code: 'ArrowRight', keyCode: 39, text: '' },
    Backspace: { code: 'Backspace', keyCode: 8, text: '' },
    Delete: { code: 'Delete', keyCode: 46, text: '' },
    Space: { code: 'Space', keyCode: 32, text: ' ' },
  };
  const keyDescriptor =
    key.length === 1
      ? {
          code: `Key${key.toUpperCase()}`,
          keyCode: key.toUpperCase().charCodeAt(0),
          text: key,
        }
      : specialKeyMap[key];
  if (!keyDescriptor) {
    throw new Error(`unsupported key: ${key}`);
  }
  const normalizedKey = key;
  const normalizedText = keyDescriptor.text;
  const code = keyDescriptor.code;
  const keyCode = keyDescriptor.keyCode;

  for (let index = 0; index < repeat; index += 1) {
    await sendCdpCommand(page, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: normalizedKey,
      code,
      text: normalizedText,
      unmodifiedText: normalizedText,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
      modifiers: modifierMask,
      autoRepeat: index > 0,
    });
    await sendCdpCommand(page, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: normalizedKey,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
      modifiers: modifierMask,
    });
  }

  const modifierText = modifiers.length > 0 ? modifiers.join(',') : 'none';
  return `pageIndex: ${pageIndex}\nkey: ${key}\nmodifiers: ${modifierText}\nrepeat: ${repeat}\nstatus: key-pressed`;
}

async function handleScroll(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const selector = parseOptionalNonEmptyString(toolArgs.selector);
  const frameSelector = parseOptionalNonEmptyString(toolArgs.frameSelector);
  const pierceShadow = toolArgs.pierceShadow === true;
  const behavior = requireEnumString(toolArgs.behavior, 'behavior', ['into-view', 'by-offset']);
  const deltaX = toolArgs.deltaX === undefined ? 0 : requireFiniteNumber(toolArgs.deltaX, 'deltaX');
  const deltaY = toolArgs.deltaY === undefined ? 0 : requireFiniteNumber(toolArgs.deltaY, 'deltaY');

  const expression = `(() => {
    const selector = ${selector ? `JSON.parse(${JSON.stringify(JSON.stringify(selector))})` : 'undefined'};
    const frameSelector = ${frameSelector ? `JSON.parse(${JSON.stringify(JSON.stringify(frameSelector))})` : 'undefined'};
    const pierceShadow = ${pierceShadow ? 'true' : 'false'};
    const behavior = JSON.parse(${JSON.stringify(JSON.stringify(behavior))});
    const deltaX = ${deltaX};
    const deltaY = ${deltaY};

    const visitRoots = (root) => {
      const roots = [root];
      if (!pierceShadow) {
        return roots;
      }
      const queue = [root];
      while (queue.length > 0) {
        const current = queue.shift();
        const elements = Array.from(current.querySelectorAll('*'));
        for (const element of elements) {
          if (element.shadowRoot) {
            roots.push(element.shadowRoot);
            queue.push(element.shadowRoot);
          }
        }
      }
      return roots;
    };

    let root = document;
    let scrollWindow = window;
    if (frameSelector) {
      const frame = document.querySelector(frameSelector);
      if (!frame) {
        throw new Error('frame not found for selector: ' + frameSelector);
      }
      const frameDocument = frame.contentDocument;
      if (!frameDocument) {
        throw new Error('frame document is unavailable for selector: ' + frameSelector);
      }
      if (!frame.contentWindow) {
        throw new Error('frame window is unavailable for selector: ' + frameSelector);
      }
      root = frameDocument;
      scrollWindow = frame.contentWindow;
    }

    if (!selector) {
      if (behavior !== 'by-offset') {
        throw new Error('selector is required for behavior: ' + behavior);
      }
      scrollWindow.scrollBy(deltaX, deltaY);
      return JSON.stringify({ scope: 'page', behavior, deltaX, deltaY });
    }

    const roots = visitRoots(root);
    const matches = [];
    for (const currentRoot of roots) {
      matches.push(...Array.from(currentRoot.querySelectorAll(selector)));
    }
    const element = matches[0];
    if (!element) {
      throw new Error('element not found for selector: ' + selector);
    }

    if (behavior === 'into-view') {
      element.scrollIntoView({ block: 'center', inline: 'center' });
      return JSON.stringify({ scope: 'element', selector, behavior });
    }

    if (typeof element.scrollBy === 'function') {
      element.scrollBy(deltaX, deltaY);
      return JSON.stringify({ scope: 'element', selector, behavior, deltaX, deltaY });
    }

    throw new Error('element does not support scrollBy for selector: ' + selector);
  })()`;

  const raw = await evaluateExpression(page, expression);
  const parsed = JSON.parse(raw);
  const lines = [`pageIndex: ${pageIndex}`];
  if (parsed.selector) {
    lines.push(`selector: ${parsed.selector}`);
  }
  lines.push(`behavior: ${parsed.behavior}`);
  if (typeof parsed.deltaX === 'number') {
    lines.push(`deltaX: ${parsed.deltaX}`);
  }
  if (typeof parsed.deltaY === 'number') {
    lines.push(`deltaY: ${parsed.deltaY}`);
  }
  if (parsed.scope === 'element') {
    const scopedSuffix = formatScopedSelectorSuffix(frameSelector, pierceShadow);
    if (scopedSuffix) {
      lines.push(scopedSuffix.slice(1));
    }
  }
  lines.push('status: scrolled');
  return lines.join('\n');
}

async function ensureDrawableViewport(page) {
  const metrics = await sendCdpCommand(page, 'Page.getLayoutMetrics');
  const viewport = metrics.cssVisualViewport || metrics.visualViewport || {};
  const width = Number(viewport.clientWidth || 0);
  const height = Number(viewport.clientHeight || 0);
  if (width <= 0 || height <= 0) {
    throw new Error('page has no drawable viewport for screenshot');
  }
}

async function handleScreenshot(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  await ensureDrawableViewport(page);
  const fullPage = toolArgs.fullPage === true;
  const response = await sendCdpCommand(page, 'Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: fullPage,
  });

  const data = response && typeof response.data === 'string' ? response.data : '';
  if (!data) {
    throw new Error('screenshot capture failed');
  }

  return `pageIndex: ${pageIndex}\nformat: png\nfullPage: ${fullPage ? 'true' : 'false'}\ndata: ${data}`;
}

async function getElementDiagnostics(
  page,
  selector,
  nth,
  frameSelector = '',
  pierceShadow = false
) {
  return await getScopedDiagnostics(page, selector, nth, frameSelector, pierceShadow);
}

async function getScrolledElementStateAt(
  page,
  selector,
  nth,
  frameSelector = '',
  pierceShadow = false
) {
  const expression = `(() => {
    const selector = JSON.parse(${JSON.stringify(JSON.stringify(selector))});
    const nth = ${nth === undefined ? 'undefined' : String(nth)};
    const frameSelector = ${frameSelector ? `JSON.parse(${JSON.stringify(JSON.stringify(frameSelector))})` : 'undefined'};
    const pierceShadow = ${pierceShadow ? 'true' : 'false'};

    const visitRoots = (root) => {
      const roots = [root];
      if (!pierceShadow) {
        return roots;
      }
      const queue = [root];
      while (queue.length > 0) {
        const current = queue.shift();
        const elements = Array.from(current.querySelectorAll('*'));
        for (const element of elements) {
          if (element.shadowRoot) {
            roots.push(element.shadowRoot);
            queue.push(element.shadowRoot);
          }
        }
      }
      return roots;
    };

    let root = document;
    let frameOffset = { left: 0, top: 0 };
    if (frameSelector) {
      const frame = document.querySelector(frameSelector);
      if (!frame) {
        throw new Error('frame not found for selector: ' + frameSelector);
      }
      const frameDocument = frame.contentDocument;
      if (!frameDocument) {
        throw new Error('frame document is unavailable for selector: ' + frameSelector);
      }
      const frameRect = frame.getBoundingClientRect();
      frameOffset = { left: frameRect.left, top: frameRect.top };
      root = frameDocument;
    }

    const roots = visitRoots(root);
    const matches = [];
    for (const currentRoot of roots) {
      matches.push(...Array.from(currentRoot.querySelectorAll(selector)));
    }
    const targetIndex = nth ?? 0;
    const element = matches[targetIndex];
    if (!element) {
      return JSON.stringify({ exists: false });
    }
    if (!element.isConnected) {
      return JSON.stringify({ exists: true, connected: false });
    }
    element.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = element.getBoundingClientRect();
    const absoluteRect = {
      x: rect.x + frameOffset.left,
      y: rect.y + frameOffset.top,
      width: rect.width,
      height: rect.height,
      top: rect.top + frameOffset.top,
      right: rect.right + frameOffset.left,
      bottom: rect.bottom + frameOffset.top,
      left: rect.left + frameOffset.left,
    };
    const style = window.getComputedStyle(element);
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const clipX = Math.max(0, absoluteRect.left);
    const clipY = Math.max(0, absoluteRect.top);
    const clipRight = Math.min(viewportWidth, absoluteRect.right);
    const clipBottom = Math.min(viewportHeight, absoluteRect.bottom);
    return JSON.stringify({
      exists: true,
      connected: true,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      interactable:
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0,
      boundingClientRect: absoluteRect,
      centerPoint: {
        x: absoluteRect.left + absoluteRect.width / 2,
        y: absoluteRect.top + absoluteRect.height / 2,
      },
      visibleClip: {
        x: clipX,
        y: clipY,
        width: Math.max(0, clipRight - clipX),
        height: Math.max(0, clipBottom - clipY),
        scale: 1,
      },
    });
  })()`;
  return JSON.parse(await evaluateExpression(page, expression));
}

async function getScrolledElementState(page, selector, frameSelector = '', pierceShadow = false) {
  return await getScrolledElementStateAt(page, selector, undefined, frameSelector, pierceShadow);
}

function formatQueryValue(field, value) {
  if (field === 'boundingClientRect') {
    return JSON.stringify(value);
  }
  return String(value);
}

function hasTargetSpecificQueryField(fields) {
  return fields.some((field) => field !== 'exists' && field !== 'count');
}

function parseWaitCondition(value, hasSelector) {
  if (!value || typeof value !== 'object') {
    throw new Error('condition is required');
  }
  const condition = value;
  if (condition.kind === 'existence') {
    if (!hasSelector) {
      throw new Error('page-level wait only supports text conditions in Phase 1');
    }
    return { kind: 'existence', exists: condition.exists !== false };
  }
  if (condition.kind === 'visibility') {
    if (!hasSelector) {
      throw new Error('page-level wait only supports text conditions in Phase 1');
    }
    return {
      kind: 'visibility',
      visibility: condition.visibility === 'hidden' ? 'hidden' : 'visible',
      opacityGt: typeof condition.opacityGt === 'number' ? condition.opacityGt : undefined,
    };
  }
  if (condition.kind === 'text') {
    if (typeof condition.includes !== 'string' || condition.includes === '') {
      throw new Error('condition.includes is required');
    }
    return { kind: 'text', includes: condition.includes };
  }
  throw new Error(`unknown wait condition kind: ${String(condition.kind || '')}`);
}

function isVisibleObservation(observation, opacityGt) {
  if (!observation || observation.targetMissing) {
    return false;
  }
  const opacity = Number.parseFloat(String(observation.opacity ?? '1'));
  return (
    observation.display !== 'none' &&
    observation.visibility === 'visible' &&
    Number(observation.boundingClientRect?.width || 0) > 0 &&
    Number(observation.boundingClientRect?.height || 0) > 0 &&
    (opacityGt === undefined || opacity > opacityGt)
  );
}

function isHiddenObservation(observation) {
  if (!observation || observation.targetMissing) {
    return true;
  }
  return (
    observation.display === 'none' ||
    observation.visibility !== 'visible' ||
    Number(observation.boundingClientRect?.width || 0) <= 0 ||
    Number(observation.boundingClientRect?.height || 0) <= 0
  );
}

function isWaitConditionSatisfied(observation, condition) {
  if (condition.kind === 'existence') {
    return condition.exists ? observation.exists === true : observation.exists === false;
  }
  if (condition.kind === 'visibility') {
    return condition.visibility === 'hidden'
      ? isHiddenObservation(observation)
      : isVisibleObservation(observation, condition.opacityGt);
  }
  if (condition.kind === 'text') {
    return String(observation.text || '').includes(condition.includes);
  }
  return false;
}

function formatWaitObservation(observation) {
  if (!observation) {
    return 'unavailable';
  }
  if ('exists' in observation || 'count' in observation || 'display' in observation) {
    return [
      `exists=${observation.exists === true ? 'true' : 'false'}`,
      `count=${String(observation.count ?? 0)}`,
      `display=${String(observation.display ?? '')}`,
      `visibility=${String(observation.visibility ?? '')}`,
      `opacity=${String(observation.opacity ?? '')}`,
    ].join(', ');
  }
  if ('text' in observation) {
    return `text=${JSON.stringify(observation.text || '')}`;
  }
  return 'unavailable';
}

function formatQueryResponse(pageIndex, selector, nth, diagnostics, fields) {
  const lines = [`pageIndex: ${pageIndex}`, `selector: ${selector}`];
  if (nth !== undefined) {
    lines.push(`nth: ${nth}`);
  }
  if (diagnostics.targetMissing) {
    if (hasTargetSpecificQueryField(fields)) {
      throw new Error(
        `element index ${diagnostics.targetIndex} is out of range for selector: ${selector}`
      );
    }
    for (const field of fields) {
      if (field === 'exists') {
        lines.push(`exists: ${diagnostics.exists ? 'true' : 'false'}`);
        continue;
      }
      if (field === 'count') {
        lines.push(`count: ${formatQueryValue(field, diagnostics.count)}`);
      }
    }
    return lines.join('\n');
  }
  for (const field of fields) {
    lines.push(`${field}: ${formatQueryValue(field, diagnostics[field])}`);
  }
  return lines.join('\n');
}

async function getWaitPageObservation(page) {
  const text = await evaluateExpression(
    page,
    `(() => document.body ? document.body.innerText || '' : '')()`
  );
  return { text };
}

async function getWaitSelectorObservation(page, selector, nth, frameSelector, pierceShadow) {
  return getElementDiagnostics(page, selector, nth, frameSelector, pierceShadow);
}

async function handleWaitFor(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const selector = typeof toolArgs.selector === 'string' ? toolArgs.selector.trim() : '';
  const nth = requireOptionalNonNegativeInteger(toolArgs.nth, 'nth');
  const frameSelector = parseOptionalNonEmptyString(toolArgs.frameSelector);
  const pierceShadow = toolArgs.pierceShadow === true;
  const timeoutMs = requirePositiveIntegerOrDefault(
    toolArgs.timeoutMs,
    'timeoutMs',
    DEFAULT_WAIT_TIMEOUT_MS
  );
  const pollIntervalMs = requirePositiveIntegerOrDefault(
    toolArgs.pollIntervalMs,
    'pollIntervalMs',
    DEFAULT_WAIT_POLL_INTERVAL_MS
  );
  const condition = parseWaitCondition(toolArgs.condition, selector !== '');
  const deadline = Date.now() + timeoutMs;
  let lastObserved = null;

  while (Date.now() <= deadline) {
    lastObserved = selector
      ? await getWaitSelectorObservation(page, selector, nth, frameSelector, pierceShadow)
      : await getWaitPageObservation(page);
    if (isWaitConditionSatisfied(lastObserved, condition)) {
      return `pageIndex: ${pageIndex}${selector ? `\nselector: ${selector}` : ''}${formatScopedSelectorSuffix(frameSelector, pierceShadow)}\nstatus: satisfied`;
    }
    if (Date.now() + pollIntervalMs > deadline) {
      break;
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(`wait condition timed out\nlastObserved: ${formatWaitObservation(lastObserved)}`);
}

async function handleEval(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const expression = requireNonEmptyString(toolArgs.expression, 'expression');
  const mode = toolArgs.mode === 'readwrite' ? 'readwrite' : 'readonly';
  const evalMode = getBrowserEvalMode();

  if (evalMode === 'disabled') {
    throw new Error('browser_eval is disabled by CCS_BROWSER_EVAL_MODE=disabled');
  }
  if (mode === 'readwrite' && evalMode !== 'readwrite') {
    throw new Error(`browser_eval readwrite mode is disabled by CCS_BROWSER_EVAL_MODE=${evalMode}`);
  }

  const response = await sendCdpCommand(page, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    ...(mode === 'readonly' ? { throwOnSideEffect: true } : {}),
  });

  if (response?.exceptionDetails?.text) {
    throw new Error(response.exceptionDetails.text);
  }
  if (!response?.result) {
    throw new Error('evaluation result is not JSON-serializable');
  }

  const result = response.result;
  const normalizedResult = normalizeDevtoolsResultValue(result);
  if (!normalizedResult.serializable) {
    throw new Error('evaluation result is not JSON-serializable');
  }

  return `pageIndex: ${pageIndex}\nmode: ${mode}\nvalue: ${JSON.stringify(normalizedResult.value)}`;
}

function getButtonMask(button) {
  if (button === 'right') {
    return 2;
  }
  if (button === 'middle') {
    return 4;
  }
  return 1;
}

async function dispatchMousePointerEvent(page, type, x, y, button = 'left', isPressed = false) {
  await sendCdpCommand(page, 'Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: type === 'mouseMoved' && !isPressed ? 'none' : button,
    buttons: isPressed ? getButtonMask(button) : 0,
    pointerType: 'mouse',
    clickCount: 1,
  });
}

function interpolatePoints(sourcePoint, targetPoint, steps) {
  const points = [];
  for (let index = 1; index <= steps; index += 1) {
    const ratio = index / steps;
    points.push({
      x: Math.round(sourcePoint.x + (targetPoint.x - sourcePoint.x) * ratio),
      y: Math.round(sourcePoint.y + (targetPoint.y - sourcePoint.y) * ratio),
    });
  }
  return points;
}

async function resolveElementCenterPoint(
  page,
  selector,
  nth,
  frameSelector,
  pierceShadow,
  missingLabel
) {
  const state = await getScrolledElementStateAt(page, selector, nth, frameSelector, pierceShadow);
  if (!state.exists) {
    throw new Error(missingLabel);
  }
  if (state.connected !== true) {
    throw new Error(`drag coordinates unavailable for selector: ${selector}`);
  }
  if (state.interactable !== true || !state.centerPoint) {
    throw new Error(`drag coordinates unavailable for selector: ${selector}`);
  }
  return state.centerPoint;
}

async function handlePointerAction(toolArgs) {
  const pages = await listPageTargets();
  if (pages.length === 0) {
    throw new Error('Browser MCP did not find any page targets in the current Chrome session.');
  }

  const { page, pageIndex } = resolveTargetPage(pages, toolArgs, selectedPageId, {
    allowImplicitFallback: false,
  });
  if (!page.webSocketDebuggerUrl) {
    throw new Error(`Browser MCP page ${pageIndex} does not expose a websocket debugger URL.`);
  }

  const actions = Array.isArray(toolArgs.actions) ? toolArgs.actions : null;
  if (!actions || actions.length === 0) {
    throw new Error('actions must be a non-empty array');
  }
  if (actions.length > MAX_POINTER_ACTIONS) {
    throw new Error(`actions exceeds maximum of ${MAX_POINTER_ACTIONS}`);
  }

  let pointerX = null;
  let pointerY = null;
  let pressedButton = null;

  for (const action of actions) {
    if (!action || typeof action !== 'object') {
      throw new Error('each action must be an object');
    }
    if (!['move', 'down', 'up', 'pause'].includes(action.type)) {
      throw new Error(`unsupported pointer action: ${String(action.type || '')}`);
    }

    if (action.type === 'pause') {
      const durationMs =
        action.durationMs === undefined
          ? 0
          : requireNonNegativeInteger(action.durationMs, 'durationMs');
      if (durationMs > 0) {
        await sleep(durationMs);
      }
      continue;
    }

    if (action.type === 'move') {
      let point = null;
      if (typeof action.selector === 'string' && action.selector.trim() !== '') {
        point = await resolveElementCenterPoint(
          page,
          requireNonEmptyString(action.selector, 'actions.selector'),
          requireOptionalNonNegativeInteger(action.nth, 'actions.nth'),
          parseOptionalNonEmptyString(action.frameSelector),
          action.pierceShadow === true,
          'drag coordinates unavailable'
        );
      } else if (typeof action.x === 'number' && typeof action.y === 'number') {
        point = {
          x: requireFiniteNumber(action.x, 'actions.x'),
          y: requireFiniteNumber(action.y, 'actions.y'),
        };
      } else {
        throw new Error('drag coordinates unavailable');
      }

      pointerX = point.x;
      pointerY = point.y;
      await dispatchMousePointerEvent(
        page,
        'mouseMoved',
        pointerX,
        pointerY,
        pressedButton || 'left',
        Boolean(pressedButton)
      );
      continue;
    }

    if (pointerX === null || pointerY === null) {
      throw new Error('pointer state error');
    }

    if (action.type === 'down') {
      if (pressedButton) {
        throw new Error('pointer state error');
      }
      pressedButton =
        requireEnumString(action.button, 'button', ['left', 'middle', 'right']) || 'left';
      await dispatchMousePointerEvent(
        page,
        'mousePressed',
        pointerX,
        pointerY,
        pressedButton,
        true
      );
      continue;
    }

    if (!pressedButton) {
      throw new Error('pointer state error');
    }
    const releaseButton =
      requireEnumString(action.button, 'button', ['left', 'middle', 'right']) || pressedButton;
    if (releaseButton !== pressedButton) {
      throw new Error('pointer state error');
    }
    await dispatchMousePointerEvent(
      page,
      'mouseReleased',
      pointerX,
      pointerY,
      releaseButton,
      false
    );
    pressedButton = null;
  }

  if (pressedButton) {
    throw new Error('pointer state error');
  }

  return `pageIndex: ${pageIndex}\nactionCount: ${actions.length}\nstatus: pointer-actions-completed`;
}

async function handleDragElement(toolArgs) {
  const pages = await listPageTargets();
  if (pages.length === 0) {
    throw new Error('Browser MCP did not find any page targets in the current Chrome session.');
  }

  const { page, pageIndex } = resolveTargetPage(pages, toolArgs, selectedPageId, {
    allowImplicitFallback: false,
  });
  if (!page.webSocketDebuggerUrl) {
    throw new Error(`Browser MCP page ${pageIndex} does not expose a websocket debugger URL.`);
  }

  const selector = requireNonEmptyString(toolArgs.selector, 'selector');
  const nth = requireOptionalNonNegativeInteger(toolArgs.nth, 'nth');
  const targetNth = requireOptionalNonNegativeInteger(toolArgs.targetNth, 'targetNth');
  const frameSelector = parseOptionalNonEmptyString(toolArgs.frameSelector);
  const pierceShadow = toolArgs.pierceShadow === true;
  const targetSelector = parseOptionalNonEmptyString(toolArgs.targetSelector);
  const hasTargetX = Object.prototype.hasOwnProperty.call(toolArgs, 'targetX');
  const hasTargetY = Object.prototype.hasOwnProperty.call(toolArgs, 'targetY');
  const hasTargetCoordinates = hasTargetX || hasTargetY;
  if (targetSelector && hasTargetCoordinates) {
    throw new Error('targetSelector and targetX/targetY cannot be used together');
  }
  if (!targetSelector && !hasTargetCoordinates) {
    throw new Error('targetSelector or targetX/targetY is required');
  }
  if (hasTargetX !== hasTargetY) {
    throw new Error('targetX and targetY must be provided together');
  }

  const sourcePoint = await resolveElementCenterPoint(
    page,
    selector,
    nth,
    frameSelector,
    pierceShadow,
    'source element not found'
  );

  const targetPoint = targetSelector
    ? await resolveElementCenterPoint(
        page,
        targetSelector,
        targetNth,
        frameSelector,
        pierceShadow,
        'target element not found'
      )
    : {
        x: requireFiniteNumber(toolArgs.targetX, 'targetX'),
        y: requireFiniteNumber(toolArgs.targetY, 'targetY'),
      };

  const steps =
    toolArgs.steps === undefined
      ? DEFAULT_DRAG_STEPS
      : requirePositiveInteger(toolArgs.steps, 'steps');

  await dispatchMousePointerEvent(page, 'mouseMoved', sourcePoint.x, sourcePoint.y, 'left', false);
  await dispatchMousePointerEvent(page, 'mousePressed', sourcePoint.x, sourcePoint.y, 'left', true);
  for (const point of interpolatePoints(sourcePoint, targetPoint, steps)) {
    await dispatchMousePointerEvent(page, 'mouseMoved', point.x, point.y, 'left', true);
  }
  await dispatchMousePointerEvent(
    page,
    'mouseReleased',
    targetPoint.x,
    targetPoint.y,
    'left',
    false
  );

  return [
    `pageIndex: ${pageIndex}`,
    `selector: ${selector}`,
    `nth: ${nth ?? 0}`,
    targetSelector ? `targetSelector: ${targetSelector}` : `targetX: ${targetPoint.x}`,
    targetSelector ? `targetNth: ${targetNth ?? 0}` : `targetY: ${targetPoint.y}`,
    `steps: ${steps}`,
    `${frameSelector ? `frameSelector: ${frameSelector}\n` : ''}${pierceShadow ? 'pierceShadow: true\n' : ''}status: dragged`,
  ].join('\n');
}

async function handleHover(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const selector = requireNonEmptyString(toolArgs.selector, 'selector');
  const frameSelector = parseOptionalNonEmptyString(toolArgs.frameSelector);
  const pierceShadow = toolArgs.pierceShadow === true;
  const state = await getScrolledElementState(page, selector, frameSelector, pierceShadow);
  if (!state.exists) {
    throw new Error(`element not found for selector: ${selector}`);
  }
  if (state.connected !== true) {
    throw new Error(`element is detached for selector: ${selector}`);
  }
  if (state.interactable !== true || !state.centerPoint) {
    throw new Error(`element is hidden or not interactable for selector: ${selector}`);
  }

  await dispatchMousePointerEvent(
    page,
    'mouseMoved',
    state.centerPoint.x,
    state.centerPoint.y,
    'left',
    false
  );

  return `pageIndex: ${pageIndex}\nselector: ${selector}${formatScopedSelectorSuffix(frameSelector, pierceShadow)}\nstatus: hovered`;
}

async function handleQuery(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const selector = requireNonEmptyString(toolArgs.selector, 'selector');
  const nth = requireOptionalNonNegativeInteger(toolArgs.nth, 'nth');
  const frameSelector = parseOptionalNonEmptyString(toolArgs.frameSelector);
  const pierceShadow = toolArgs.pierceShadow === true;
  const fields = parseQueryFields(toolArgs.fields);
  const diagnostics = await getElementDiagnostics(page, selector, nth, frameSelector, pierceShadow);
  return formatQueryResponse(pageIndex, selector, nth, diagnostics, fields);
}

async function handleElementScreenshot(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const selector = requireNonEmptyString(toolArgs.selector, 'selector');
  const frameSelector = parseOptionalNonEmptyString(toolArgs.frameSelector);
  const pierceShadow = toolArgs.pierceShadow === true;
  const state = await getScrolledElementState(page, selector, frameSelector, pierceShadow);
  if (!state.exists) {
    throw new Error(`element not found for selector: ${selector}`);
  }
  if (state.connected !== true) {
    throw new Error(`element is detached for selector: ${selector}`);
  }
  if (state.interactable !== true || !state.visibleClip) {
    throw new Error(`element has empty bounds for selector: ${selector}`);
  }
  if (state.visibleClip.width <= 0 || state.visibleClip.height <= 0) {
    throw new Error(`element has empty bounds for selector: ${selector}`);
  }
  await ensureDrawableViewport(page);

  const response = await sendCdpCommand(page, 'Page.captureScreenshot', {
    format: 'png',
    clip: state.visibleClip,
  });

  const data = response && typeof response.data === 'string' ? response.data : '';
  if (!data) {
    throw new Error('screenshot capture failed');
  }

  return `pageIndex: ${pageIndex}\nselector: ${selector}${formatScopedSelectorSuffix(frameSelector, pierceShadow)}\nformat: png\ndata: ${data}`;
}

async function waitForPageEvent({ page, timeoutMs, event }) {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  return await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      abortSocket(ws);
      reject(new Error(`event wait timed out for kind: ${event.kind}`));
    }, timeoutMs);

    const settleError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      abortSocket(ws);
      reject(toSocketError(error));
    };

    const settleSuccess = (observed) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      closeSocket(ws);
      resolve(observed);
    };

    addSocketListener(ws, 'open', () => {
      if (event.kind === 'dialog' || event.kind === 'navigation') {
        ws.send(JSON.stringify({ id: ++requestCounter, method: 'Page.enable', params: {} }));
      }
      if (event.kind === 'request') {
        ws.send(JSON.stringify({ id: ++requestCounter, method: 'Network.enable', params: {} }));
      }
    });

    addSocketListener(ws, 'message', (data) => {
      void (async () => {
        const raw = await getSocketMessageText(data);
        let message;
        try {
          message = JSON.parse(raw);
        } catch {
          return;
        }
        if (!message || typeof message !== 'object' || typeof message.method !== 'string') {
          return;
        }
        let observed = null;
        if (message.method === 'Page.javascriptDialogOpening') {
          observed = { type: message.params?.type || '', message: message.params?.message || '' };
        } else if (message.method === 'Page.frameNavigated') {
          const frame = message.params?.frame;
          if (!frame?.parentId) {
            observed = { url: frame?.url || '' };
          }
        } else if (message.method === 'Network.requestWillBeSent') {
          observed = {
            url: message.params?.request?.url || '',
            method: message.params?.request?.method || '',
          };
        }
        if (observed && matchesObservedEvent(event, observed)) {
          settleSuccess(observed);
        }
      })().catch(settleError);
    });

    addSocketListener(ws, 'error', settleError);
    addSocketListener(ws, 'close', () => {
      if (!settled) {
        settleError(new Error('Browser MCP lost the DevTools websocket connection.'));
      }
    });
  });
}

async function getPageFrameIds(page) {
  const response = await sendCdpCommand(page, 'Page.getFrameTree', {});
  const frameTree = response?.frameTree;
  const frameIds = new Set();

  function visitFrameTree(node) {
    if (!node || typeof node !== 'object') {
      return;
    }
    const frameId = node.frame?.id;
    if (typeof frameId === 'string' && frameId) {
      frameIds.add(frameId);
    }
    const childFrames = Array.isArray(node.childFrames) ? node.childFrames : [];
    for (const childFrame of childFrames) {
      visitFrameTree(childFrame);
    }
  }

  visitFrameTree(frameTree);

  if (frameIds.size === 0) {
    throw new Error('Browser MCP could not determine the selected page frame IDs.');
  }
  return frameIds;
}

async function waitForBrowserDownloadEvent(page, timeoutMs, event) {
  const [targets, frameIds] = await Promise.all([
    fetchJson(`${getHttpUrl()}/json/list`),
    getPageFrameIds(page),
  ]);
  const browserTarget = Array.isArray(targets)
    ? targets.find((target) => target && typeof target === 'object' && target.type === 'browser')
    : null;
  if (
    !browserTarget ||
    typeof browserTarget.webSocketDebuggerUrl !== 'string' ||
    !browserTarget.webSocketDebuggerUrl
  ) {
    throw new Error('browser-level download events are unavailable');
  }

  const ws = new WebSocket(browserTarget.webSocketDebuggerUrl);
  return await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      abortSocket(ws);
      reject(new Error('event wait timed out for kind: download'));
    }, timeoutMs);

    const settleError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      abortSocket(ws);
      reject(toSocketError(error));
    };

    const settleSuccess = (observed) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      closeSocket(ws);
      resolve(observed);
    };

    addSocketListener(ws, 'message', (data) => {
      void (async () => {
        const raw = await getSocketMessageText(data);
        let message;
        try {
          message = JSON.parse(raw);
        } catch {
          return;
        }
        if (message?.method !== 'Browser.downloadWillBegin') {
          return;
        }
        const eventFrameId = message.params?.frameId;
        if (!frameIds.has(eventFrameId)) {
          const refreshedFrameIds = await getPageFrameIds(page);
          if (!refreshedFrameIds.has(eventFrameId)) {
            return;
          }
          for (const frameId of refreshedFrameIds) {
            frameIds.add(frameId);
          }
        }
        const observed = {
          url: message.params?.url || '',
          suggestedFilename: message.params?.suggestedFilename || '',
        };
        if (matchesObservedEvent(event, observed)) {
          settleSuccess(observed);
        }
      })().catch(settleError);
    });

    addSocketListener(ws, 'error', settleError);
    addSocketListener(ws, 'close', () => {
      if (!settled) {
        settleError(new Error('Browser MCP lost the DevTools websocket connection.'));
      }
    });
  });
}

async function waitForMatchingEvent({ page, timeoutMs, event }) {
  if (event.kind === 'download') {
    return await waitForBrowserDownloadEvent(page, timeoutMs, event);
  }
  return await waitForPageEvent({ page, timeoutMs, event });
}

async function handleWaitForEvent(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const timeoutMs = requirePositiveIntegerOrDefault(
    toolArgs.timeoutMs,
    'timeoutMs',
    DEFAULT_WAIT_TIMEOUT_MS
  );
  const event = parseEventCondition(toolArgs.event);
  const observed = await waitForMatchingEvent({ page, pageIndex, timeoutMs, event });
  return `pageIndex: ${pageIndex}\nevent: ${event.kind}\nstatus: observed\ndetail: ${JSON.stringify(observed)}`;
}

function findInterceptRuleIndex(ruleId) {
  return interceptRules.findIndex((rule) => rule.ruleId === ruleId);
}

function getRulesForPage(pageId) {
  return interceptRules.filter((rule) => rule.pageId === pageId);
}

function getRulesForMatching(pageId) {
  return getRulesForPage(pageId)
    .slice()
    .sort((left, right) => right.priority - left.priority);
}

function matchesUrlPattern(pattern, url) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(url);
}

function normalizePausedRequestHeaders(paused) {
  const normalized = new Map();
  const headers = paused.request?.headers;
  if (!headers || typeof headers !== 'object') {
    return normalized;
  }
  for (const [name, value] of Object.entries(headers)) {
    normalized.set(name.toLowerCase(), String(value));
  }
  return normalized;
}

function matchesHeaderMatchers(headerMatchers, paused) {
  if (!headerMatchers.length) {
    return true;
  }
  const normalizedHeaders = normalizePausedRequestHeaders(paused);
  return headerMatchers.every((matcher) => {
    const headerValue = normalizedHeaders.get(matcher.name.toLowerCase());
    if (headerValue === undefined) {
      return false;
    }
    if (matcher.valueIncludes && !headerValue.includes(matcher.valueIncludes)) {
      return false;
    }
    if (matcher.valueRegex && !new RegExp(matcher.valueRegex).test(headerValue)) {
      return false;
    }
    return true;
  });
}

function matchesInterceptRule(rule, paused) {
  const requestMethod = String(paused.request?.method || '').toUpperCase();
  const requestUrl = String(paused.request?.url || '');
  const requestResourceType = String(paused.resourceType || '');
  if (rule.method && rule.method !== requestMethod) {
    return false;
  }
  if (rule.urlIncludes && !requestUrl.includes(rule.urlIncludes)) {
    return false;
  }
  if (rule.urlPattern && !matchesUrlPattern(rule.urlPattern, requestUrl)) {
    return false;
  }
  if (rule.urlRegex && !new RegExp(rule.urlRegex).test(requestUrl)) {
    return false;
  }
  if (rule.resourceType && rule.resourceType.toLowerCase() !== requestResourceType.toLowerCase()) {
    return false;
  }
  if (!matchesHeaderMatchers(rule.headerMatchers || [], paused)) {
    return false;
  }
  return true;
}

async function ensureInterceptSession(page) {
  const existing = interceptSessionsByPageId.get(page.id);
  if (existing) {
    return existing;
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let enableRequestId = 0;
  let resolveReady;
  let rejectReady;
  let activityChain = Promise.resolve();
  const pendingCommands = new Map();
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const session = {
    pageId: page.id,
    webSocketDebuggerUrl: page.webSocketDebuggerUrl,
    ws,
    enabled: false,
    ready,
    pendingCommands,
    activityVersion: 0,
    getLastActivity() {
      return activityChain;
    },
  };
  interceptSessionsByPageId.set(page.id, session);

  function settleReadyError(error) {
    if (rejectReady) {
      rejectReady(error instanceof Error ? error : new Error(String(error)));
      rejectReady = null;
      resolveReady = null;
    }
  }

  function rejectPendingCommands(error) {
    for (const pending of pendingCommands.values()) {
      pending.reject(error instanceof Error ? error : new Error(String(error)));
    }
    pendingCommands.clear();
  }

  addSocketListener(ws, 'open', () => {
    enableRequestId = ++requestCounter;
    ws.send(
      JSON.stringify({
        id: enableRequestId,
        method: 'Fetch.enable',
        params: { patterns: [{ urlPattern: '*' }] },
      })
    );
  });

  addSocketListener(ws, 'message', (data) => {
    const activity = (async () => {
      const raw = await getSocketMessageText(data);
      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        return;
      }
      session.activityVersion += 1;
      if (message.id === enableRequestId) {
        if (message.error) {
          const error = new Error(message.error.message || 'DevTools request failed.');
          settleReadyError(error);
          rejectPendingCommands(error);
          removeInterceptStateForPage(page.id);
          closeSocket(ws);
          return;
        }
        session.enabled = true;
        if (resolveReady) {
          resolveReady();
          resolveReady = null;
          rejectReady = null;
        }
        return;
      }
      if (message.id && pendingCommands.has(message.id)) {
        const pending = pendingCommands.get(message.id);
        pendingCommands.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message || 'DevTools request failed.'));
          return;
        }
        pending.resolve(message.result || null);
        return;
      }
      if (message.method !== 'Fetch.requestPaused') {
        return;
      }
      const paused = message.params || {};
      const matchedRule = getRulesForMatching(page.id).find((rule) =>
        matchesInterceptRule(rule, paused)
      );
      const action = matchedRule ? matchedRule.action : 'continue';
      if (action === 'fail') {
        ws.send(
          JSON.stringify({
            id: ++requestCounter,
            method: 'Fetch.failRequest',
            params: { requestId: paused.requestId, errorReason: FETCH_FAIL_ERROR_REASON },
          })
        );
      } else if (action === 'fulfill') {
        ws.send(
          JSON.stringify({
            id: ++requestCounter,
            method: 'Fetch.fulfillRequest',
            params: {
              requestId: paused.requestId,
              responseCode: matchedRule.statusCode,
              responseHeaders: matchedRule.responseHeaders,
              body: encodeFulfillBody(matchedRule.body),
            },
          })
        );
      } else {
        ws.send(
          JSON.stringify({
            id: ++requestCounter,
            method: 'Fetch.continueRequest',
            params: { requestId: paused.requestId },
          })
        );
      }
      pushRecentRequest({
        requestId: String(paused.requestId || ''),
        pageId: page.id,
        url: String(paused.request?.url || ''),
        method: String(paused.request?.method || ''),
        resourceType: String(paused.resourceType || ''),
        matchedRuleId: matchedRule ? matchedRule.ruleId : '',
        action,
        statusCode: action === 'fulfill' ? matchedRule.statusCode : 0,
      });
    })();
    activityChain = activityChain
      .catch(() => {})
      .then(() => activity)
      .catch(() => {});
    void activity.catch(() => {});
  });

  addSocketListener(ws, 'close', () => {
    const error = new Error('Browser MCP lost the DevTools websocket connection.');
    if (!session.enabled) {
      settleReadyError(error);
    }
    rejectPendingCommands(error);
    removeInterceptStateForPage(page.id);
  });

  addSocketListener(ws, 'error', (error) => {
    const socketError = toSocketError(error);
    if (!session.enabled) {
      settleReadyError(socketError);
    }
    rejectPendingCommands(socketError);
    removeInterceptStateForPage(page.id);
  });

  await ready;
  return session;
}

async function handleSelectPage(toolArgs) {
  const pages = await listPageTargets();
  if (pages.length === 0) {
    throw new Error('Browser MCP did not find any page targets in the current Chrome session.');
  }
  const { page, pageIndex } = resolveTargetPage(pages, toolArgs, selectedPageId, {
    allowImplicitFallback: false,
  });
  if (!page.webSocketDebuggerUrl) {
    throw new Error(`Browser MCP page ${pageIndex} does not expose a websocket debugger URL.`);
  }
  selectedPageId = page.id;
  return `pageIndex: ${pageIndex}\npageId: ${page.id}\ntitle: ${page.title || '<untitled>'}\nurl: ${page.url || '<empty>'}\nstatus: selected`;
}

async function handleOpenPage(toolArgs) {
  const query = toolArgs?.url
    ? `?${new URLSearchParams({ url: requireValidHttpUrl(toolArgs.url) }).toString()}`
    : '';
  const createdTarget = await fetchJson(`${getHttpUrl()}/json/new${query}`, { method: 'PUT' });
  const pageId = typeof createdTarget?.id === 'string' ? createdTarget.id : '';
  if (!pageId) {
    throw new Error('Browser MCP failed to create a new page target.');
  }
  selectedPageId = pageId;
  const pages = await listPageTargets();
  const pageIndex = findPageIndexById(pages, pageId);
  const selectedPage = pages[pageIndex];
  if (!selectedPage) {
    throw new Error('Browser MCP could not resolve the newly opened page target.');
  }
  return `pageIndex: ${pageIndex}\npageId: ${selectedPage.id}\ntitle: ${selectedPage.title || '<untitled>'}\nurl: ${selectedPage.url || '<empty>'}\nstatus: opened`;
}

async function handleClosePage(toolArgs) {
  const pages = await listPageTargets();
  if (pages.length === 0) {
    throw new Error('Browser MCP did not find any page targets in the current Chrome session.');
  }
  const previousSelectedPageId = selectedPageId;
  const { page, pageIndex } = resolveTargetPage(pages, toolArgs, selectedPageId, {
    allowImplicitFallback: false,
  });
  if (activeRecordingSession && activeRecordingSession.pageId === page.id) {
    try {
      await finalizeRecordingCapture(activeRecordingSession);
    } catch {
      // Keep the recording session and still report the page-close warning below.
    }
    activeRecordingSession.status = 'stopped';
    activeRecordingSession.stoppedAt = new Date().toISOString();
    activeRecordingSession.warnings.push('recording stopped because target page was closed');
    latestRecordingSession = activeRecordingSession;
    activeRecordingSession = null;
  }

  await fetchJson(`${getHttpUrl()}/json/close/${encodeURIComponent(page.id)}`);
  const interceptSession = interceptSessionsByPageId.get(page.id);
  if (interceptSession) {
    closeSocket(interceptSession.ws);
  }
  removeInterceptStateForPage(page.id);
  const remainingPages = await listPageTargets();
  if (findPageIndexById(remainingPages, previousSelectedPageId) !== -1) {
    selectedPageId = previousSelectedPageId;
  } else {
    selectedPageId = resolveFallbackSelectedPageId(
      remainingPages,
      pageIndex > 0 ? pageIndex - 1 : 0
    );
  }
  const selectedIndex = findPageIndexById(remainingPages, selectedPageId);
  return [
    `pageIndex: ${pageIndex}`,
    `pageId: ${page.id}`,
    'status: closed',
    selectedPageId ? `selectedPageIndex: ${selectedIndex}` : 'selectedPageIndex: none',
    selectedPageId ? `selectedPageId: ${selectedPageId}` : 'selectedPageId: none',
  ].join('\n');
}

async function handleAddInterceptRule(toolArgs) {
  const pages = await listPageTargets();
  if (pages.length === 0) {
    throw new Error('Browser MCP did not find any page targets in the current Chrome session.');
  }
  const defaultPageId = selectedPageId || resolveFallbackSelectedPageId(pages, 0);
  const { page } = resolveTargetPage(pages, toolArgs, defaultPageId, {
    allowImplicitFallback: false,
  });
  if (!page.webSocketDebuggerUrl) {
    throw new Error('Target page does not expose a websocket debugger URL.');
  }
  const urlIncludes = parseOptionalUrlIncludes(toolArgs.urlIncludes);
  const method = parseOptionalMethod(toolArgs.method);
  const resourceType = parseOptionalResourceType(toolArgs.resourceType);
  const urlPattern = parseOptionalUrlPattern(toolArgs.urlPattern);
  const urlRegex = parseOptionalUrlRegex(toolArgs.urlRegex);
  const headerMatchers = parseOptionalHeaderMatchers(toolArgs.headerMatchers);
  const priority = parseOptionalPriority(toolArgs.priority);
  const action = parseInterceptAction(toolArgs.action);
  validateInterceptMatcherSet({
    urlIncludes,
    method,
    resourceType,
    urlPattern,
    urlRegex,
    headerMatchers,
  });
  const statusCode = parseOptionalStatusCode(toolArgs.statusCode);
  const contentType =
    toolArgs.contentType === undefined
      ? ''
      : requireNonEmptyString(toolArgs.contentType, 'contentType');
  const body = parseOptionalBody(toolArgs.body);
  const responseHeaders = parseOptionalResponseHeaders(toolArgs.responseHeaders, contentType);
  const rule = {
    ruleId: createInterceptRuleId(),
    pageId: page.id,
    pageTitleSnapshot: page.title || '',
    urlIncludes,
    method,
    resourceType,
    urlPattern,
    urlRegex,
    headerMatchers,
    priority,
    action,
    statusCode: action === 'fulfill' ? statusCode : 0,
    contentType: action === 'fulfill' ? contentType : '',
    responseHeaders: action === 'fulfill' ? responseHeaders : [],
    body: action === 'fulfill' ? body : '',
    createdAt: new Date().toISOString(),
  };
  interceptRules.push(rule);
  await ensureInterceptSession(page);
  return formatInterceptRules([rule]);
}

async function handleRemoveInterceptRule(toolArgs) {
  const ruleId = requireNonEmptyString(toolArgs.ruleId, 'ruleId');
  const index = findInterceptRuleIndex(ruleId);
  if (index === -1) {
    throw new Error(`rule not found: ${ruleId}`);
  }
  const [removed] = interceptRules.splice(index, 1);
  if (getRulesForPage(removed.pageId).length === 0) {
    const session = interceptSessionsByPageId.get(removed.pageId);
    if (session) {
      closeSocket(session.ws);
      interceptSessionsByPageId.delete(removed.pageId);
    }
  }
  return `ruleId: ${removed.ruleId}\nstatus: removed`;
}

async function handleListInterceptRules() {
  const pages = await listPageTargets();
  const livePageIds = new Set(pages.map((page) => page.id));
  for (let index = interceptRules.length - 1; index >= 0; index -= 1) {
    if (!livePageIds.has(interceptRules[index].pageId)) {
      interceptRules.splice(index, 1);
    }
  }
  return formatInterceptRules(interceptRules);
}

async function handleListRequests(toolArgs) {
  const pages = await listPageTargets();
  const filteredPage =
    toolArgs && (Object.prototype.hasOwnProperty.call(toolArgs, 'pageIndex') || toolArgs.pageId)
      ? resolveTargetPage(pages, toolArgs, selectedPageId)
      : null;
  const limit = requirePositiveIntegerOrDefault(toolArgs.limit, 'limit', 20);
  const sessions = Array.from(interceptSessionsByPageId.values());
  await Promise.all(sessions.map((session) => session.ready));
  await Promise.all(
    sessions.map(async (session) => {
      const barrierRequestId = ++requestCounter;
      const barrierPromise = new Promise((resolve, reject) => {
        session.pendingCommands.set(barrierRequestId, { resolve, reject });
      });
      session.ws.send(
        JSON.stringify({
          id: barrierRequestId,
          method: 'Runtime.evaluate',
          params: {
            expression: '0',
            returnByValue: true,
          },
        })
      );
      await barrierPromise;
      await session.getLastActivity();
      await new Promise((resolve) => setTimeout(resolve, 35));
      await session.getLastActivity();
    })
  );
  const entries = recentRequests
    .filter((entry) => !filteredPage || entry.pageId === filteredPage.page.id)
    .slice(-limit)
    .reverse();
  return formatRecentRequests(entries);
}

async function handleSetDownloadBehavior(toolArgs) {
  const behavior = requireEnumString(toolArgs.behavior, 'behavior', ['accept', 'deny']);
  const downloadPath = parseOptionalNonEmptyString(toolArgs.downloadPath);
  const eventsEnabled =
    toolArgs.eventsEnabled === undefined ? true : toolArgs.eventsEnabled === true;

  if (behavior === 'deny' && downloadPath) {
    throw new Error('downloadPath is only allowed when behavior=accept');
  }

  await ensureBrowserDownloadSession();

  const resolvedDownloadPath =
    behavior === 'accept' ? ensureWritableDirectory(downloadPath || getSessionDownloadPath()) : '';
  await sendBrowserCdpCommand('Browser.setDownloadBehavior', {
    behavior: behavior === 'accept' ? 'allow' : 'deny',
    ...(resolvedDownloadPath ? { downloadPath: resolvedDownloadPath } : {}),
    eventsEnabled,
  });

  return `scope: browser\nbehavior: ${behavior}\ndownloadPath: ${resolvedDownloadPath || '<none>'}\neventsEnabled: ${eventsEnabled}\nstatus: configured`;
}

async function handleListDownloads(toolArgs) {
  const limit = requirePositiveIntegerOrDefault(toolArgs.limit, 'limit', 20);
  if (browserDownloadSession) {
    await browserDownloadSession.ready;
    await browserDownloadSession.getLastActivity();
    await sleep(35);
    await browserDownloadSession.getLastActivity();
  }
  const entries = recentDownloads.slice(-limit).reverse();
  return formatRecentDownloads(entries);
}

function resolveDownloadRecord(toolArgs) {
  const downloadId = parseOptionalNonEmptyString(toolArgs.downloadId);
  const guid = parseOptionalNonEmptyString(toolArgs.guid);
  if (!downloadId && !guid) {
    throw new Error('downloadId or guid is required');
  }

  const matched = recentDownloads.filter(
    (entry) => (!downloadId || entry.downloadId === downloadId) && (!guid || entry.guid === guid)
  );
  if (matched.length !== 1) {
    throw new Error('download not found');
  }
  return matched[0];
}

async function handleCancelDownload(toolArgs) {
  const entry = resolveDownloadRecord(toolArgs);
  if (entry.status === 'completed' || entry.status === 'failed' || entry.status === 'denied') {
    throw new Error(`download is not cancelable in status: ${entry.status}`);
  }

  await sendBrowserCdpCommand('Browser.cancelDownload', { guid: entry.guid });
  entry.status = 'canceled';
  entry.finishedAt = new Date().toISOString();
  return `downloadId: ${entry.downloadId}\nguid: ${entry.guid}\nstatus: canceled`;
}

async function handleSetFileInput(toolArgs) {
  const pages = await listPageTargets();
  if (pages.length === 0) {
    throw new Error('Browser MCP did not find any page targets in the current Chrome session.');
  }

  const { page, pageIndex } = resolveTargetPage(pages, toolArgs, selectedPageId, {
    allowImplicitFallback: false,
  });
  const selector = requireNonEmptyString(toolArgs.selector, 'selector');
  const files = validateLocalFiles(requireNonEmptyStringArray(toolArgs.files, 'files'));
  const nth = toolArgs.nth === undefined ? 0 : requireNonNegativeInteger(toolArgs.nth, 'nth');
  const frameSelector = parseOptionalNonEmptyString(toolArgs.frameSelector);
  const pierceShadow = toolArgs.pierceShadow === true;

  await withPageCommandSession(page, async (session) => {
    const objectId = await evaluateObjectHandle(
      session,
      buildFileInputHandleExpression(selector, nth, frameSelector, pierceShadow)
    );
    await session.sendCommand('DOM.setFileInputFiles', {
      files,
      objectId,
    });
  });

  return formatFileInputResult({
    pageIndex,
    selector,
    nth,
    frameSelector,
    pierceShadow,
    files,
  });
}

async function handleDragFiles(toolArgs) {
  const pages = await listPageTargets();
  if (pages.length === 0) {
    throw new Error('Browser MCP did not find any page targets in the current Chrome session.');
  }

  const { page, pageIndex } = resolveTargetPage(pages, toolArgs, selectedPageId, {
    allowImplicitFallback: false,
  });
  const selector = requireNonEmptyString(toolArgs.selector, 'selector');
  const files = readLocalFilesForDrop(requireNonEmptyStringArray(toolArgs.files, 'files'));
  const nth = toolArgs.nth === undefined ? 0 : requireNonNegativeInteger(toolArgs.nth, 'nth');
  const frameSelector = parseOptionalNonEmptyString(toolArgs.frameSelector);
  const pierceShadow = toolArgs.pierceShadow === true;

  const response = await sendCdpCommand(page, 'Runtime.evaluate', {
    expression: buildDropFilesExpression(selector, nth, frameSelector, pierceShadow, files),
    returnByValue: true,
    awaitPromise: true,
  });

  if (response?.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || 'drop target evaluation failed');
  }

  const result = response?.result || null;
  if (!result) {
    throw new Error('Browser MCP received an invalid DevTools evaluation response.');
  }
  if (result.subtype === 'error') {
    throw new Error(result.description || 'drop target evaluation failed');
  }
  if (result.value?.accepted === false) {
    throw new Error('drop target rejected files');
  }

  return formatDragFilesResult({
    pageIndex,
    selector,
    nth,
    frameSelector,
    pierceShadow,
    files,
  });
}

function buildRecordingInstallExpression(recordingPayload) {
  return `(() => {
    const recordingPayload = JSON.parse(${JSON.stringify(JSON.stringify(recordingPayload))});
    const existing = globalThis.__CCS_BROWSER_RECORDING_RECORDER__;
    if (existing && existing.installed === true) {
      return { installed: true };
    }

    const events = Array.isArray(recordingPayload.events) ? [...recordingPayload.events] : [];
    const warnings = Array.isArray(recordingPayload.warnings) ? [...recordingPayload.warnings] : [];
    const getSelector = (element) => {
      if (!(element instanceof Element)) {
        return undefined;
      }
      if (element.id) {
        return '#' + element.id;
      }
      const attr = typeof element.getAttribute === 'function' ? element.getAttribute('data-testid') : '';
      if (attr) {
        return '[data-testid="' + attr + '"]';
      }
      return element.tagName ? element.tagName.toLowerCase() : undefined;
    };
    const pushEvent = (event) => {
      events.push(event);
    };
    const onClick = (event) => {
      pushEvent({
        kind: 'click',
        selector: getSelector(event.target),
        button: event.button === 1 ? 'middle' : event.button === 2 ? 'right' : 'left',
        clickCount: event.detail || 1,
        offsetX: typeof event.offsetX === 'number' ? event.offsetX : undefined,
        offsetY: typeof event.offsetY === 'number' ? event.offsetY : undefined,
        timestamp: Date.now(),
      });
    };
    const onInput = (event) => {
      const target = event.target;
      let text = '';
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        text = target.value;
      } else if (target && target.isContentEditable === true) {
        text = target.textContent || '';
      } else {
        return;
      }
      pushEvent({ kind: 'type', selector: getSelector(target), text, timestamp: Date.now() });
    };
    const onKeyDown = (event) => {
      const modifiers = [];
      if (event.altKey) modifiers.push('Alt');
      if (event.ctrlKey) modifiers.push('Control');
      if (event.metaKey) modifiers.push('Meta');
      if (event.shiftKey) modifiers.push('Shift');
      pushEvent({ kind: 'press_key', key: event.key, modifiers, timestamp: Date.now() });
    };
    const onScroll = (event) => {
      const target = event.target === document ? document.scrollingElement || document.documentElement : event.target;
      pushEvent({
        kind: 'scroll',
        selector: getSelector(target),
        deltaX: 0,
        deltaY: 0,
        timestamp: Date.now(),
      });
    };

    document.addEventListener('click', onClick, true);
    document.addEventListener('input', onInput, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('scroll', onScroll, true);

    globalThis.__CCS_BROWSER_RECORDING_RECORDER__ = {
      installed: true,
      events,
      warnings,
      teardown: () => {
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('input', onInput, true);
        document.removeEventListener('keydown', onKeyDown, true);
        document.removeEventListener('scroll', onScroll, true);
      },
    };
    return { installed: true };
  })()`;
}

async function installRecorderAndCapture(page) {
  const response = await sendCdpCommand(page, 'Runtime.evaluate', {
    expression: buildRecordingInstallExpression({ events: [], warnings: [] }),
    returnByValue: true,
    awaitPromise: true,
  });

  if (response?.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || 'recording injection failed');
  }

  const result = response?.result || null;
  if (!result) {
    throw new Error('recording injection failed');
  }
  if (result.subtype === 'error') {
    throw new Error(result.description || 'recording injection failed');
  }

  return result.value || { installed: true };
}

async function finalizeRecordingCapture(session) {
  const page = {
    id: session.pageId,
    webSocketDebuggerUrl: session.pageWebSocketDebuggerUrl,
  };

  const response = await sendCdpCommand(page, 'Runtime.evaluate', {
    expression: `(() => globalThis.__CCS_BROWSER_RECORDING_RECORDER__ || { events: [], warnings: [] })()`,
    returnByValue: true,
    awaitPromise: true,
  });

  if (response?.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || 'recording injection failed');
  }

  const value = response?.result?.value || { events: [], warnings: [] };
  const rawEvents = Array.isArray(value.events) ? value.events : [];
  const warnings = Array.isArray(value.warnings) ? value.warnings : [];

  session.rawEvents = rawEvents;
  session.steps = rawEvents
    .map((event) => normalizeRecordedEvent(session.pageId, event))
    .filter(Boolean);
  session.warnings = warnings.map((warning) => String(warning.message || warning));
}

async function handleStartRecording(toolArgs) {
  if (activeRecordingSession) {
    throw new Error('recording already active');
  }

  const pages = await listPageTargets();
  if (pages.length === 0) {
    throw new Error('Browser MCP did not find any page targets in the current Chrome session.');
  }

  const { page, pageIndex } = resolveTargetPage(pages, toolArgs, selectedPageId, {
    allowImplicitFallback: false,
  });
  if (!page.webSocketDebuggerUrl) {
    throw new Error(`Browser MCP page ${pageIndex} does not expose a websocket debugger URL.`);
  }

  const session = {
    recordingId: createRecordingId(),
    pageId: page.id,
    pageIndex,
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    status: 'recording',
    steps: [],
    warnings: [],
    rawEvents: [],
    pageWebSocketDebuggerUrl: page.webSocketDebuggerUrl,
    captureInstalled: false,
  };

  await installRecorderAndCapture(page);
  session.captureInstalled = true;
  activeRecordingSession = session;
  latestRecordingSession = session;

  return formatRecordingSummary(session);
}

async function handleStopRecording() {
  if (!activeRecordingSession) {
    throw new Error('no active recording');
  }
  const session = activeRecordingSession;
  let finalizeError = null;
  try {
    await finalizeRecordingCapture(session);
  } catch (error) {
    finalizeError = error instanceof Error ? error : new Error(String(error));
    session.warnings.push(`recording capture finalization failed: ${finalizeError.message}`);
  }
  session.status = 'stopped';
  session.stoppedAt = new Date().toISOString();
  activeRecordingSession = null;
  latestRecordingSession = session;
  if (finalizeError) {
    throw finalizeError;
  }
  return formatRecordingSummary(session);
}

async function handleGetRecording() {
  const session = requireLatestRecording();
  return formatRecordingDetail(session);
}

async function handleClearRecording() {
  if (!latestRecordingSession && !activeRecordingSession) {
    throw new Error('no recording available');
  }
  activeRecordingSession = null;
  latestRecordingSession = null;
  return 'status: cleared';
}

function buildReplayToolArgs(step, replayPage) {
  const baseArgs = {
    pageId: replayPage.pageId,
  };

  if (step.type === 'click') {
    return {
      toolName: TOOL_CLICK,
      toolArgs: {
        ...baseArgs,
        selector: requireNonEmptyString(step.selector, 'selector'),
        nth: step.nth,
        frameSelector: step.frameSelector,
        pierceShadow: step.pierceShadow,
        button: step.args?.button,
        clickCount: step.args?.clickCount,
        offsetX: step.args?.offsetX,
        offsetY: step.args?.offsetY,
      },
    };
  }

  if (step.type === 'type') {
    return {
      toolName: TOOL_TYPE,
      toolArgs: {
        ...baseArgs,
        selector: requireNonEmptyString(step.selector, 'selector'),
        nth: step.nth,
        frameSelector: step.frameSelector,
        pierceShadow: step.pierceShadow,
        text: requireString(step.args?.text, 'text'),
        clearFirst: true,
      },
    };
  }

  if (step.type === 'press_key') {
    return {
      toolName: TOOL_PRESS_KEY,
      toolArgs: {
        ...baseArgs,
        key: requireNonEmptyString(step.args?.key, 'key'),
        modifiers: Array.isArray(step.args?.modifiers) ? step.args.modifiers : [],
      },
    };
  }

  if (step.type === 'scroll') {
    return {
      toolName: TOOL_SCROLL,
      toolArgs: {
        ...baseArgs,
        selector: step.selector,
        frameSelector: step.frameSelector,
        pierceShadow: step.pierceShadow,
        behavior: 'by-offset',
        deltaX: step.args?.deltaX ?? 0,
        deltaY: step.args?.deltaY ?? 0,
      },
    };
  }

  if (step.type === 'drag_element') {
    return {
      toolName: TOOL_DRAG_ELEMENT,
      toolArgs: {
        ...baseArgs,
        selector: requireNonEmptyString(step.selector, 'selector'),
        nth: step.nth,
        frameSelector: step.frameSelector,
        pierceShadow: step.pierceShadow,
        ...(step.args?.targetSelector !== undefined
          ? { targetSelector: step.args.targetSelector }
          : {}),
        ...(step.args?.targetNth !== undefined ? { targetNth: step.args.targetNth } : {}),
        ...(step.args?.targetX !== undefined ? { targetX: step.args.targetX } : {}),
        ...(step.args?.targetY !== undefined ? { targetY: step.args.targetY } : {}),
      },
    };
  }

  if (step.type === 'pointer_action') {
    return {
      toolName: TOOL_POINTER_ACTION,
      toolArgs: {
        ...baseArgs,
        actions: Array.isArray(step.args?.actions) ? step.args.actions : [],
      },
    };
  }

  return null;
}

async function executeReplaySteps(session) {
  for (let index = 0; index < session.steps.length; index += 1) {
    throwIfSessionCanceled(session, 'replay');
    const step = session.steps[index];
    session.currentStepIndex = index;
    validateReplayStep(step, session.pageId);

    const mapped = buildReplayToolArgs(step, session);
    if (!mapped) {
      throw new Error('unsupported replay step type');
    }

    if (mapped.toolName === TOOL_CLICK) {
      await handleClick(mapped.toolArgs);
    } else if (mapped.toolName === TOOL_TYPE) {
      await handleType(mapped.toolArgs);
    } else if (mapped.toolName === TOOL_PRESS_KEY) {
      await handlePressKey(mapped.toolArgs);
    } else if (mapped.toolName === TOOL_SCROLL) {
      await handleScroll(mapped.toolArgs);
    } else if (mapped.toolName === TOOL_DRAG_ELEMENT) {
      await handleDragElement(mapped.toolArgs);
    } else if (mapped.toolName === TOOL_POINTER_ACTION) {
      await handlePointerAction(mapped.toolArgs);
    } else {
      throw new Error('unsupported replay step type');
    }

    session.completedSteps = index + 1;
    throwIfSessionCanceled(session, 'replay');
  }
}

async function runReplaySession(session, options = {}) {
  try {
    await executeReplaySteps(session);
    if (session.cancelRequested) {
      session.status = 'canceled';
    } else {
      session.status = 'completed';
    }
  } catch (error) {
    if (isSessionCanceledError(error) || session.cancelRequested) {
      session.status = 'canceled';
      session.error = null;
    } else {
      session.status = 'failed';
      session.failedStepIndex = session.currentStepIndex;
      session.error = error instanceof Error ? error.message : String(error);
    }
  } finally {
    latestReplaySession = session;
    if (options.manageActiveState === true) {
      if (activeReplaySession === session) {
        activeReplaySession = null;
      }
      activeReplayTask = null;
    }
  }
  return session;
}

async function handleStartReplay(toolArgs) {
  if (activeReplaySession) {
    throw new Error('replay already active');
  }

  const pages = await listPageTargets();
  if (pages.length === 0) {
    throw new Error('Browser MCP did not find any page targets in the current Chrome session.');
  }

  const { page, pageIndex } = resolveTargetPage(pages, toolArgs, selectedPageId, {
    allowImplicitFallback: false,
  });
  if (!page.webSocketDebuggerUrl) {
    throw new Error(`Browser MCP page ${pageIndex} does not expose a websocket debugger URL.`);
  }

  const steps = requireReplaySteps(toolArgs);
  const session = createReplaySession(page, pageIndex, steps);

  latestReplaySession = session;
  activeReplaySession = session;
  const task = Promise.resolve().then(() => runReplaySession(session, { manageActiveState: true }));
  activeReplayTask = task;
  task.catch(() => {
    // Session state is recorded in runReplaySession.
  });
  await waitForSessionToSettle(task);
  return formatReplaySummary(session);
}

async function handleGetReplay() {
  const session = requireLatestReplay();
  return formatReplaySummary(session);
}

async function handleCancelReplay() {
  if (!activeReplaySession) {
    throw new Error('no active replay');
  }
  activeReplaySession.cancelRequested = true;
  activeReplaySession.status = 'canceled';
  latestReplaySession = activeReplaySession;
  return formatReplaySummary(activeReplaySession);
}

async function executeOrchestrationBlock(session, block) {
  if (block.type === 'select_page_then_run') {
    const selectResult = await handleSelectPage(block.args.select || {});
    const match = /pageId: (.+)/.exec(selectResult);
    const selectedPageId = match?.[1]?.trim() || session.pageId;
    const runBlock = requireCrossPageRunBlock(block);
    const childSession = { ...session, pageId: selectedPageId };
    await executeOrchestrationBlock(childSession, runBlock);
    return;
  }

  if (block.type === 'open_page_then_run') {
    const openResult = await handleOpenPage(block.args.open || {});
    const match = /pageId: (.+)/.exec(openResult);
    const openedPageId = match?.[1]?.trim() || session.pageId;
    const runBlock = requireCrossPageRunBlock(block);
    const childSession = { ...session, pageId: openedPageId };
    await executeOrchestrationBlock(childSession, runBlock);
    return;
  }

  if (block.type === 'close_page_then_continue') {
    await handleClosePage(block.args.close || {});
    return;
  }

  if (block.type === 'wait_for_then_click') {
    await handleWaitFor({ pageId: session.pageId, ...block.args.wait });
    await handleClick({ pageId: session.pageId, ...block.args.click });
    return;
  }

  if (block.type === 'wait_for_then_type') {
    await handleWaitFor({ pageId: session.pageId, ...block.args.wait });
    await handleType({ pageId: session.pageId, ...block.args.type });
    return;
  }

  if (block.type === 'wait_for_then_press_key') {
    await handleWaitFor({ pageId: session.pageId, ...block.args.wait });
    await handlePressKey({ pageId: session.pageId, ...block.args.pressKey });
    return;
  }

  if (block.type === 'run_replay_sequence') {
    const replaySteps = requireReplaySteps({ steps: block.args.steps });
    const replaySession = createReplaySession(
      { id: session.pageId },
      session.pageIndex,
      replaySteps
    );
    await runReplaySession(replaySession);
    if (replaySession.status === 'failed' || replaySession.status === 'canceled') {
      throw new Error(formatReplaySummary(replaySession));
    }
    return;
  }

  if (block.type === 'assert_query') {
    const queryText = await handleQuery({ pageId: session.pageId, ...block.args.query });
    const queryMap = parseQueryTextToMap(queryText);
    const assertions = parseAssertions(block.args);

    for (const [index, assertion] of assertions.entries()) {
      const actualValue = queryMap[assertion.field];
      if (actualValue === undefined) {
        throw new Error(`assert_query field missing from query result: ${assertion.field}`);
      }
      const failure = evaluateAssertion(assertion, actualValue, index);
      if (failure) {
        throw new Error(JSON.stringify(failure));
      }
    }
    return;
  }

  if (block.type === 'sequence') {
    await executeSequenceSteps(session, block);
    return;
  }

  throw new Error('unsupported orchestration block type');
}

async function executeSequenceSteps(session, block) {
  const steps = requireSequenceSteps(block);
  session.failedSequenceStepIndex = null;
  for (let index = 0; index < steps.length; index += 1) {
    throwIfSessionCanceled(session, 'orchestration');
    const step = steps[index];
    validateSequenceStep(step);
    try {
      await executeOrchestrationBlock(session, step);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushOrchestrationFailure(session, {
        blockIndex: session.currentBlockIndex,
        sequenceStepIndex: index,
        type: step.type,
        message,
      });
      session.failedSequenceStepIndex = index;
      if (step.continueOnError === true) {
        continue;
      }
      throw markOrchestrationFailureRecorded(error);
    }
  }
}

async function executeOrchestrationBlocks(session) {
  for (let index = 0; index < session.blocks.length; index += 1) {
    throwIfSessionCanceled(session, 'orchestration');
    const block = session.blocks[index];
    session.currentBlockIndex = index;
    session.failedSequenceStepIndex = null;
    validateOrchestrationBlock(block);
    try {
      await executeOrchestrationBlock(session, block);
      session.completedBlocks = index + 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!wasOrchestrationFailureRecorded(error)) {
        pushOrchestrationFailure(session, {
          blockIndex: index,
          sequenceStepIndex: null,
          type: block.type,
          message,
        });
      }
      if (block.continueOnError === true) {
        session.completedBlocks = index + 1;
        continue;
      }
      throw error;
    }
  }
}

async function runOrchestrationSession(session, options = {}) {
  try {
    await executeOrchestrationBlocks(session);
    if (session.cancelRequested) {
      session.status = 'canceled';
    } else if ((session.failedCount || 0) > 0) {
      session.status = 'completed_with_failures';
    } else {
      session.status = 'completed';
    }
  } catch (error) {
    if (isSessionCanceledError(error) || session.cancelRequested) {
      session.status = 'canceled';
      session.error = null;
      session.errorDetails = undefined;
    } else {
      session.status = 'failed';
      session.failedBlockIndex = session.currentBlockIndex;
      session.errorDetails = formatOrchestrationError(error);
      session.error =
        session.errorDetails.message || (error instanceof Error ? error.message : String(error));
    }
  } finally {
    latestOrchestrationSession = session;
    if (options.manageActiveState === true) {
      if (activeOrchestrationSession === session) {
        activeOrchestrationSession = null;
      }
      activeOrchestrationTask = null;
    }
  }
  return session;
}

async function handleStartOrchestration(toolArgs) {
  if (activeOrchestrationSession) {
    throw new Error('orchestration already active');
  }

  const pages = await listPageTargets();
  if (pages.length === 0) {
    throw new Error('Browser MCP did not find any page targets in the current Chrome session.');
  }

  const { page, pageIndex } = resolveTargetPage(pages, toolArgs, selectedPageId, {
    allowImplicitFallback: false,
  });
  if (!page.webSocketDebuggerUrl) {
    throw new Error(`Browser MCP page ${pageIndex} does not expose a websocket debugger URL.`);
  }

  const blocks = requireOrchestrationBlocks(toolArgs);
  const session = createOrchestrationSession(page, pageIndex, blocks);

  latestOrchestrationSession = session;
  activeOrchestrationSession = session;
  const task = Promise.resolve().then(() =>
    runOrchestrationSession(session, { manageActiveState: true })
  );
  activeOrchestrationTask = task;
  task.catch(() => {
    // Session state is recorded in runOrchestrationSession.
  });
  await waitForSessionToSettle(task);
  return formatOrchestrationSummary(session);
}

async function handleGetOrchestration() {
  const session = requireLatestOrchestration();
  return formatOrchestrationSummary(session);
}

async function handleCancelOrchestration() {
  if (!activeOrchestrationSession) {
    throw new Error('no active orchestration');
  }
  activeOrchestrationSession.cancelRequested = true;
  activeOrchestrationSession.status = 'canceled';
  latestOrchestrationSession = activeOrchestrationSession;
  return formatOrchestrationSummary(activeOrchestrationSession);
}

function getArtifactPayloadForKind(kind) {
  if (kind === 'recording') {
    return requireLatestRecording();
  }
  if (kind === 'replay') {
    return requireLatestReplay();
  }
  if (kind === 'orchestration') {
    return requireLatestOrchestration();
  }
  throw new Error(`unsupported artifact kind: ${kind}`);
}

function resolveArtifactPath(reference) {
  const value = requireNonEmptyString(reference, 'path');
  if (value.startsWith('artifact:')) {
    return getArtifactPath(value.slice('artifact:'.length));
  }
  return path.resolve(value);
}

function deleteArtifactByName(name) {
  const filePath = getArtifactPath(name);
  if (!fs.existsSync(filePath)) {
    throw new Error('artifact not found');
  }
  fs.unlinkSync(filePath);
  return filePath;
}

async function handleExportArtifact(toolArgs) {
  const kind = requireNonEmptyString(toolArgs.kind, 'kind');
  const name = requireArtifactName(toolArgs.name);
  const filePath = getArtifactPath(name);
  if (fs.existsSync(filePath)) {
    throw new Error('artifact already exists');
  }
  const payload = getArtifactPayloadForKind(kind);
  const artifact = buildArtifact(kind, name, payload);
  const serialized = JSON.stringify(artifact, null, 2);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_ARTIFACT_FILE_BYTES) {
    throw new Error(`artifact file exceeds maximum size of ${MAX_ARTIFACT_FILE_BYTES} bytes`);
  }
  fs.writeFileSync(filePath, serialized, { encoding: 'utf8', mode: 0o600 });
  return `name: ${name}\nkind: ${kind}\npath: ${filePath}\nstatus: exported`;
}

async function handleListArtifacts() {
  const dir = getArtifactDir();
  const entries = fs
    .readdirSync(dir)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => readArtifactFile(path.join(dir, entry)));
  if (entries.length === 0) {
    return 'artifacts: []';
  }
  return entries
    .map((entry) =>
      [
        `name: ${entry.name}`,
        `kind: ${entry.kind}`,
        `createdAt: ${entry.createdAt}`,
        `path: ${getArtifactPath(entry.name)}`,
      ].join('\n')
    )
    .join('\n---\n');
}

async function handleImportArtifact(toolArgs) {
  const filePath = resolveArtifactPath(toolArgs.path);
  const artifact = readArtifactFile(filePath);

  if (artifact.kind === 'recording') {
    latestRecordingSession = artifact.payload;
  } else if (artifact.kind === 'replay') {
    latestReplaySession = artifact.payload;
  } else if (artifact.kind === 'orchestration') {
    latestOrchestrationSession = artifact.payload;
  } else {
    throw new Error('artifact kind mismatch');
  }

  return `name: ${artifact.name}\nkind: ${artifact.kind}\nstatus: imported`;
}

async function handleDeleteArtifact(toolArgs) {
  const name = requireArtifactName(toolArgs.name);
  deleteArtifactByName(name);
  return `name: ${name}\nstatus: deleted`;
}

async function handleToolCall(message) {
  const id = message.id;
  const params = message.params || {};
  const toolName = params.name || '<missing>';
  const toolArgs = params.arguments || {};

  if (!getAvailableToolNames().includes(toolName)) {
    writeError(id, -32602, `Unknown tool: ${toolName}`);
    return;
  }

  if (!shouldExposeTools()) {
    writeResponse(id, {
      content: [
        {
          type: 'text',
          text: 'Browser MCP is unavailable because browser reuse is not configured for this Claude session.',
        },
      ],
      isError: true,
    });
    return;
  }

  try {
    if (toolName === TOOL_SESSION_INFO) {
      const pages = await listPageTargets();
      if (pages.length > 0 && findPageIndexById(pages, selectedPageId) === -1) {
        selectedPageId = resolveFallbackSelectedPageId(pages, 0);
      }
      writeResponse(id, {
        content: [{ type: 'text', text: formatSessionInfo(pages, selectedPageId) }],
      });
      return;
    }

    if (toolName === TOOL_NAVIGATE) {
      const text = await handleNavigate(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_CLICK) {
      const text = await handleClick(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_TYPE) {
      const text = await handleType(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_PRESS_KEY) {
      const text = await handlePressKey(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_SCROLL) {
      const text = await handleScroll(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_SELECT_PAGE) {
      const text = await handleSelectPage(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_OPEN_PAGE) {
      const text = await handleOpenPage(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_CLOSE_PAGE) {
      const text = await handleClosePage(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_ADD_INTERCEPT_RULE) {
      const text = await handleAddInterceptRule(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_REMOVE_INTERCEPT_RULE) {
      const text = await handleRemoveInterceptRule(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_LIST_INTERCEPT_RULES) {
      const text = await handleListInterceptRules(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_LIST_REQUESTS) {
      const text = await handleListRequests(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_SET_DOWNLOAD_BEHAVIOR) {
      const text = await handleSetDownloadBehavior(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_LIST_DOWNLOADS) {
      const text = await handleListDownloads(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_CANCEL_DOWNLOAD) {
      const text = await handleCancelDownload(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_SET_FILE_INPUT) {
      const text = await handleSetFileInput(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_DRAG_FILES) {
      const text = await handleDragFiles(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_DRAG_ELEMENT) {
      const text = await handleDragElement(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_POINTER_ACTION) {
      const text = await handlePointerAction(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_START_RECORDING) {
      const text = await handleStartRecording(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_STOP_RECORDING) {
      const text = await handleStopRecording(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_GET_RECORDING) {
      const text = await handleGetRecording(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_CLEAR_RECORDING) {
      const text = await handleClearRecording(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_START_REPLAY) {
      const text = await handleStartReplay(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_GET_REPLAY) {
      const text = await handleGetReplay(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_CANCEL_REPLAY) {
      const text = await handleCancelReplay(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_START_ORCHESTRATION) {
      const text = await handleStartOrchestration(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_GET_ORCHESTRATION) {
      const text = await handleGetOrchestration(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_CANCEL_ORCHESTRATION) {
      const text = await handleCancelOrchestration(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_EXPORT_ARTIFACT) {
      const text = await handleExportArtifact(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_IMPORT_ARTIFACT) {
      const text = await handleImportArtifact(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_LIST_ARTIFACTS) {
      const text = await handleListArtifacts(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_DELETE_ARTIFACT) {
      const text = await handleDeleteArtifact(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_TAKE_SCREENSHOT) {
      const text = await handleScreenshot(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_WAIT_FOR) {
      const text = await handleWaitFor(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_EVAL) {
      const text = await handleEval(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_HOVER) {
      const text = await handleHover(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_QUERY) {
      const text = await handleQuery(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_TAKE_ELEMENT_SCREENSHOT) {
      const text = await handleElementScreenshot(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_WAIT_FOR_EVENT) {
      const text = await handleWaitForEvent(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    const { page, pageIndex } = await getSelectedPage(toolArgs);

    if (toolName === TOOL_URL_TITLE) {
      const raw = await evaluateInPage(page, 'url-title');
      const parsed = JSON.parse(raw);
      writeResponse(id, {
        content: [
          {
            type: 'text',
            text: `pageIndex: ${pageIndex}\ntitle: ${parsed.title || ''}\nurl: ${parsed.url || ''}`,
          },
        ],
      });
      return;
    }

    if (toolName === TOOL_VISIBLE_TEXT) {
      const text = await evaluateInPage(page, 'visible-text');
      writeResponse(id, {
        content: [{ type: 'text', text: text || '' }],
      });
      return;
    }

    const html = await evaluateInPage(page, 'dom-snapshot');
    writeResponse(id, {
      content: [{ type: 'text', text: html || '' }],
    });
  } catch (error) {
    writeResponse(id, {
      content: [
        {
          type: 'text',
          text: `Browser MCP failed: ${(error && error.message) || String(error)}`,
        },
      ],
      isError: true,
    });
  }
}

async function handleMessage(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return;
  }

  switch (message.method) {
    case 'initialize':
      writeResponse(message.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
      return;
    case 'notifications/initialized':
      return;
    case 'ping':
      writeResponse(message.id, {});
      return;
    case 'tools/list':
      writeResponse(message.id, { tools: getAvailableTools() });
      return;
    case 'tools/call':
      await handleToolCall(message);
      return;
    default:
      if (message.id !== undefined) {
        writeError(message.id, -32601, `Method not found: ${message.method}`);
      }
  }
}

function parseMessages() {
  while (true) {
    let body;
    const startsWithLegacyHeaders = inputBuffer
      .subarray(0, Math.min(inputBuffer.length, 32))
      .toString('utf8')
      .toLowerCase()
      .startsWith('content-length:');

    if (startsWithLegacyHeaders) {
      const headerEnd = inputBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        return;
      }

      const headerText = inputBuffer.subarray(0, headerEnd).toString('utf8');
      const match = headerText.match(/content-length:\s*(\d+)/i);
      if (!match) {
        inputBuffer = Buffer.alloc(0);
        return;
      }

      const contentLength = Number.parseInt(match[1], 10);
      const messageEnd = headerEnd + 4 + contentLength;
      if (inputBuffer.length < messageEnd) {
        return;
      }

      body = inputBuffer.subarray(headerEnd + 4, messageEnd).toString('utf8');
      inputBuffer = inputBuffer.subarray(messageEnd);
    } else {
      const newlineIndex = inputBuffer.indexOf('\n');
      if (newlineIndex === -1) {
        return;
      }

      body = inputBuffer.subarray(0, newlineIndex).toString('utf8').replace(/\r$/, '').trim();
      inputBuffer = inputBuffer.subarray(newlineIndex + 1);
      if (!body) {
        continue;
      }
    }

    let message;
    try {
      message = JSON.parse(body);
    } catch {
      continue;
    }

    messageQueue = messageQueue
      .then(() => handleMessage(message))
      .catch((error) => {
        if (message && message.id !== undefined) {
          writeError(message.id, -32603, (error && error.message) || 'Internal error');
        }
      });
  }
}

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  parseMessages();
});

process.stdin.on('error', () => {
  process.exit(0);
});

['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((signal) => {
  process.on(signal, () => process.exit(0));
});

process.stdin.resume();
