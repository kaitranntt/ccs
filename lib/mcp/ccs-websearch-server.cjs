#!/usr/bin/env node

const {
  getActiveProviderIds,
  getQueryFingerprint,
  getSkipReason,
  hasAnyActiveProviders,
  runLocalWebSearch,
  shouldSkipHook,
  traceWebSearchEvent,
} = require('../hooks/websearch-transformer.cjs');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'ccs-websearch';
const SERVER_VERSION = '1.0.0';
const TOOL_NAME = 'WebSearch';
const TOOL_ALIASES = ['search'];
const TOOL_DESCRIPTION =
  'Third-party WebSearch replacement for CCS-managed Claude launches. Use this instead of Bash/curl/http fetches for web lookups. Provider order: Exa, Tavily, Brave Search, SearXNG, Parallel (opt-in), DuckDuckGo, then optional legacy CLI fallback.';

function isSupportedToolName(name) {
  return name === TOOL_NAME || TOOL_ALIASES.includes(name);
}

let inputBuffer = Buffer.alloc(0);
const sessionState = {
  initializeCount: 0,
  toolsListCount: 0,
  exposed: false,
  toolCalls: 0,
};
let sessionSummaryWritten = false;

function shouldExposeTools() {
  return !shouldSkipHook() && hasAnyActiveProviders();
}

function getTools() {
  if (!shouldExposeTools()) {
    return [];
  }

  return [
    {
      name: TOOL_NAME,
      description: TOOL_DESCRIPTION,
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Web query to resolve through CCS providers. Prefer this tool over ad hoc Bash/curl lookups when you need current web information.',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  ];
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function writeResponse(id, result) {
  writeMessage({
    jsonrpc: '2.0',
    id,
    result,
  });
}

function writeError(id, code, message) {
  writeMessage({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  });
}

async function handleToolCall(message) {
  const id = message.id;
  const params = message.params || {};
  const toolArgs = params.arguments || {};
  const toolName = params.name || '<missing>';
  const query = typeof toolArgs.query === 'string' ? toolArgs.query.trim() : '';
  const fingerprint = getQueryFingerprint(query);

  if (!isSupportedToolName(toolName)) {
    traceWebSearchEvent('mcp_tool_call_rejected', {
      source: 'mcp',
      reason: 'unknown_tool',
      toolName,
    });
    writeError(id, -32602, `Unknown tool: ${toolName}`);
    return;
  }

  sessionState.toolCalls += 1;
  traceWebSearchEvent('mcp_tool_call_received', {
    source: 'mcp',
    toolName,
    ...fingerprint,
  });

  if (!shouldExposeTools()) {
    traceWebSearchEvent('mcp_tool_call_unavailable', {
      source: 'mcp',
      toolName,
      exposed: false,
      skipReason: getSkipReason(),
      activeProviderIds: getActiveProviderIds(),
      ...fingerprint,
    });
    writeResponse(id, {
      content: [
        {
          type: 'text',
          text: 'CCS WebSearch is unavailable for this profile or no providers are ready.',
        },
      ],
      isError: true,
    });
    return;
  }

  if (!query) {
    traceWebSearchEvent('mcp_tool_call_rejected', {
      source: 'mcp',
      reason: 'empty_query',
      toolName,
    });
    writeError(id, -32602, `Tool "${TOOL_NAME}" requires a non-empty string query.`);
    return;
  }

  const result = await runLocalWebSearch(query);
  if (result.success) {
    traceWebSearchEvent('mcp_tool_call_result', {
      source: 'mcp',
      toolName,
      success: true,
      providerId: result.providerId,
      providerName: result.providerName,
      ...fingerprint,
    });
    writeResponse(id, {
      content: [{ type: 'text', text: result.content }],
    });
    return;
  }

  traceWebSearchEvent('mcp_tool_call_result', {
    source: 'mcp',
    toolName,
    success: false,
    noActiveProviders: Boolean(result.noActiveProviders),
    errorCount: result.errors.length,
    ...fingerprint,
  });

  const errorDetail =
    result.noActiveProviders || result.errors.length === 0
      ? 'No active WebSearch providers are ready.'
      : result.errors.map((entry) => `${entry.provider}: ${entry.error}`).join(' | ');

  writeResponse(id, {
    content: [
      {
        type: 'text',
        text: `CCS local WebSearch failed for "${query}". ${errorDetail}`,
      },
    ],
    isError: true,
  });
}

async function handleMessage(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return;
  }

  switch (message.method) {
    case 'initialize':
      sessionState.initializeCount += 1;
      sessionState.exposed = sessionState.exposed || shouldExposeTools();
      traceWebSearchEvent('mcp_initialize', {
        source: 'mcp',
        exposed: shouldExposeTools(),
        skipReason: getSkipReason(),
        activeProviderIds: getActiveProviderIds(),
      });
      writeResponse(message.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION,
        },
      });
      return;
    case 'notifications/initialized':
      return;
    case 'ping':
      writeResponse(message.id, {});
      return;
    case 'tools/list':
      sessionState.toolsListCount += 1;
      {
        const tools = getTools();
        const exposed = tools.length > 0;
        sessionState.exposed = sessionState.exposed || exposed;
        traceWebSearchEvent('mcp_tools_list', {
          source: 'mcp',
          exposed,
          toolNames: tools.map((tool) => tool.name),
          activeProviderIds: getActiveProviderIds(),
          skipReason: getSkipReason(),
        });
        writeResponse(message.id, { tools });
      }
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

function writeSessionSummary(exitCodeOrSignal) {
  if (sessionSummaryWritten) {
    return;
  }

  sessionSummaryWritten = true;
  traceWebSearchEvent('mcp_session_summary', {
    source: 'mcp',
    initializeCount: sessionState.initializeCount,
    toolsListCount: sessionState.toolsListCount,
    exposed: sessionState.exposed,
    toolCalls: sessionState.toolCalls,
    calledWebSearch: sessionState.toolCalls > 0,
    likelyBypassed: sessionState.exposed && sessionState.toolCalls === 0 ? 'unknown' : false,
    activeProviderIds: getActiveProviderIds(),
    skipReason: getSkipReason(),
    exitCode: typeof exitCodeOrSignal === 'number' ? exitCodeOrSignal : null,
    exitSignal: typeof exitCodeOrSignal === 'string' ? exitCodeOrSignal : null,
  });
}

function parseMessages() {
  while (true) {
    let body;
    const startsWithLegacyHeaders = inputBuffer
      .slice(0, Math.min(inputBuffer.length, 32))
      .toString('utf8')
      .toLowerCase()
      .startsWith('content-length:');

    if (startsWithLegacyHeaders) {
      const headerEnd = inputBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        return;
      }

      const headerText = inputBuffer.slice(0, headerEnd).toString('utf8');
      const contentLengthMatch = headerText.match(/content-length:\s*(\d+)/i);
      if (!contentLengthMatch) {
        inputBuffer = Buffer.alloc(0);
        return;
      }

      const contentLength = Number.parseInt(contentLengthMatch[1], 10);
      const messageEnd = headerEnd + 4 + contentLength;
      if (inputBuffer.length < messageEnd) {
        return;
      }

      body = inputBuffer.slice(headerEnd + 4, messageEnd).toString('utf8');
      inputBuffer = inputBuffer.slice(messageEnd);
    } else {
      const newlineIndex = inputBuffer.indexOf('\n');
      if (newlineIndex === -1) {
        return;
      }

      body = inputBuffer.slice(0, newlineIndex).toString('utf8').replace(/\r$/, '').trim();
      inputBuffer = inputBuffer.slice(newlineIndex + 1);
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

    Promise.resolve(handleMessage(message)).catch((error) => {
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

process.on('exit', (code) => {
  writeSessionSummary(code);
});

['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((signal) => {
  process.on(signal, () => {
    writeSessionSummary(signal);
    process.exit(0);
  });
});

process.stdin.resume();
