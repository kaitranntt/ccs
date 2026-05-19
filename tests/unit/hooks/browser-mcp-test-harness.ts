// Shared harness extracted from the Browser MCP hook suite.
// Keep helpers here and split domain assertions into smaller *.test.ts files.

import { spawn } from 'child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import { WebSocketServer } from 'ws';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type JsonRpcMessage = Record<string, unknown>;

type MockRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type MockQueryState = {
  exists?: boolean;
  connected?: boolean;
  innerText?: string;
  textContent?: string;
  rect?: MockRect;
  display?: string;
  visibility?: string;
  opacity?: string;
  href?: string;
  onclick?: string;
  error?: string;
};

type MockQueryPlan = MockQueryState | MockQueryState[];

type MockClickState = {
  error?: string;
  disabled?: boolean;
  detached?: boolean;
  hidden?: boolean;
  requireMouseSequence?: boolean;
  requireNativeClick?: boolean;
  forbidSyntheticClickEvent?: boolean;
  cancelMouseDown?: boolean;
  cancelMouseUp?: boolean;
  detachAfterMouseDown?: boolean;
  mouseSequenceError?: string;
  label?: string;
  expectedOffset?: { x: number; y: number };
  expectedButton?: 'left' | 'middle' | 'right';
  expectedClickCount?: number;
  requireDoubleClickEvent?: boolean;
};

type MockClickPlan = MockClickState | MockClickState[];

type MockHoverState = {
  error?: string;
  detached?: boolean;
  hidden?: boolean;
  zeroSized?: boolean;
  requireCdpMouseMove?: boolean;
  lastMouseMove?: {
    x: number;
    y: number;
  };
};

type MockWaitPlan = {
  selectorSnapshots?: Record<string, MockQueryPlan[]>;
  pageTextSequence?: string[];
};

type MockDownloadProgressState = {
  receivedBytes: number;
  totalBytes: number;
  state: 'inProgress' | 'completed' | 'canceled';
  filePath?: string;
};

type MockDownloadState = {
  guid?: string;
  url: string;
  suggestedFilename: string;
  frameId?: string;
  progress?: MockDownloadProgressState[];
};

type MockBrowserState = {
  setDownloadBehaviorCalls?: Array<{
    behavior: string;
    downloadPath?: string;
    eventsEnabled?: boolean;
  }>;
  canceledDownloadGuids?: string[];
};

type MockPageEventPlan = {
  dialogs?: Array<{ type: string; message: string }>;
  navigations?: Array<{ url: string; parentId?: string }>;
  requests?: Array<{ url: string; method: string }>;
  downloads?: MockDownloadState[];
};

type MockFileInputState = {
  kind: 'file' | 'nonfile';
  multiple?: boolean;
  assignedFiles?: string[];
};

type MockFileInputPlan = MockFileInputState | MockFileInputState[];

type MockDropzoneState = {
  accepted?: boolean;
  acceptedByCancel?: boolean;
  requireFiles?: boolean;
  receivedEventTypes?: string[];
  receivedFiles?: Array<{ name: string; size: number; type: string }>;
  error?: string;
};

type MockDropzonePlan = MockDropzoneState | MockDropzoneState[];

type MockPointerActionRecord = {
  type: string;
  x?: number;
  y?: number;
  button?: string;
};

type MockDragPlan = {
  recordedActions?: MockPointerActionRecord[];
};

type MockRecordedEvent =
  | {
      kind: 'click';
      selector: string;
      nth?: number;
      frameSelector?: string;
      pierceShadow?: boolean;
      button?: 'left' | 'middle' | 'right';
      clickCount?: number;
      offsetX?: number;
      offsetY?: number;
      timestamp?: number;
    }
  | {
      kind: 'type';
      selector: string;
      text: string;
      nth?: number;
      frameSelector?: string;
      pierceShadow?: boolean;
      timestamp?: number;
    }
  | {
      kind: 'press_key';
      key: string;
      modifiers?: string[];
      timestamp?: number;
    }
  | {
      kind: 'scroll';
      selector?: string;
      deltaX?: number;
      deltaY?: number;
      frameSelector?: string;
      pierceShadow?: boolean;
      timestamp?: number;
    }
  | {
      kind: 'drag_element';
      selector: string;
      targetSelector?: string;
      targetX?: number;
      targetY?: number;
      nth?: number;
      targetNth?: number;
      frameSelector?: string;
      pierceShadow?: boolean;
      timestamp?: number;
    }
  | {
      kind: 'pointer_action';
      actions: Array<{
        type: 'move' | 'down' | 'up' | 'pause';
        selector?: string;
        x?: number;
        y?: number;
        button?: 'left' | 'middle' | 'right';
        durationMs?: number;
      }>;
      timestamp?: number;
    };

type MockRecordingWarning = {
  message: string;
};

type MockRecordingPlan = {
  events?: MockRecordedEvent[];
  warnings?: MockRecordingWarning[];
  injectionError?: string;
  finalizeError?: string;
  installed?: boolean;
  teardownCalls?: number;
};

type MockFrameState = {
  selector: string;
  query?: Record<string, MockQueryPlan>;
  visibleText?: string;
  fileInputs?: Record<string, MockFileInputPlan>;
  dropzones?: Record<string, MockDropzonePlan>;
};

type MockShadowRootState = {
  hostSelector: string;
  query?: Record<string, MockQueryPlan>;
  fileInputs?: Record<string, MockFileInputPlan>;
  dropzones?: Record<string, MockDropzonePlan>;
};

type MockEvalPlan = Record<
  string,
  {
    result?: unknown;
    error?: string;
    nonSerializable?: boolean;
    unserializableValue?: string;
  }
>;

type MockInterceptRuleMatch = {
  url: string;
  method: string;
  resourceType?: string;
  requestId?: string;
  requestHeaders?: Record<string, string>;
};

type MockFulfilledRequest = {
  requestId: string;
  responseCode?: number;
  responseHeaders?: Array<{ name: string; value: string }>;
  body?: string;
};

type MockInterceptState = {
  pausedRequests?: MockInterceptRuleMatch[];
  continuedRequestIds?: string[];
  failedRequests?: Array<{ requestId: string; errorReason?: string }>;
  fulfilledRequests?: MockFulfilledRequest[];
  fetchEnabledPatterns?: unknown[];
  enableError?: string;
  pauseDispatchDelayMs?: number;
};

type MockFrameTree = {
  frame: { id: string };
  childFrames?: MockFrameTree[];
};

type MockPageState = {
  id: string;
  title: string;
  currentUrl: string;
  targetType?: string;
  fileInputs?: Record<string, MockFileInputPlan>;
  browser?: MockBrowserState;
  frameTree?: MockFrameTree;
  frameTreeSequence?: MockFrameTree[];
  readyStateSequence?: string[];
  visibleText?: string;
  domSnapshot?: string;
  navigate?: Record<string, { finalUrl: string; readyStates?: string[]; errorText?: string }>;
  click?: Record<string, MockClickPlan>;
  hover?: Record<string, MockHoverState>;
  query?: Record<string, MockQueryPlan>;
  wait?: MockWaitPlan;
  eval?: MockEvalPlan;
  frames?: MockFrameState[];
  shadowRoots?: MockShadowRootState[];
  dropzones?: Record<string, MockDropzonePlan>;
  drag?: MockDragPlan;
  recording?: MockRecordingPlan;
  events?: MockPageEventPlan;
  intercept?: MockInterceptState;
  viewport?: {
    width: number;
    height: number;
  };
  screenshot?: {
    expectedClip?: {
      x: number;
      y: number;
      width: number;
      height: number;
      scale: number;
    };
    requireScrolledMeasurement?: boolean;
    scrolledSelectors?: string[];
    data?: string;
    lastCaptureBeyondViewport?: boolean;
    lastClip?: {
      x: number;
      y: number;
      width: number;
      height: number;
      scale: number;
    };
  };
  type?: Record<
    string,
    {
      kind: 'input' | 'textarea' | 'contenteditable' | 'unsupported' | 'noneditable';
      inputType?: string;
      value?: string;
      expectedValueWhenClearFirst?: string;
      expectedValueWhenAppend?: string;
      requireFocus?: boolean;
      focused?: boolean;
    }
  >;
  keyboard?: {
    expectedKey?: string;
    expectedModifiers?: string[];
    expectedRepeat?: number;
    _seenKeyDownCount?: number;
  };
  scroll?: Record<
    string,
    {
      expectedBehavior?: 'into-view' | 'by-offset';
      expectedDeltaX?: number;
      expectedDeltaY?: number;
    }
  >;
};

const bundledServerPath = join(process.cwd(), 'lib', 'mcp', 'ccs-browser-server.cjs');

type RunMcpRequestsOptions = {
  serverPath?: string;
  childEnv?: NodeJS.ProcessEnv;
  responseTimeoutMs?: number;
  requirePutForNewPage?: boolean;
};

function encodeMessage(message: unknown): string {
  return `${JSON.stringify(message)}\n`;
}

function collectResponses(
  child: ReturnType<typeof spawn>,
  expectedCount: number,
  timeoutMs = 7000
): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    let stderrBuffer = '';
    let settled = false;
    const responses: Array<Record<string, unknown>> = [];
    const fail = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(responses);
    };
    const timer = setTimeout(() => {
      const details = stderrBuffer.trim();
      fail(
        new Error(
          details
            ? `Timed out waiting for MCP responses\n${details}`
            : 'Timed out waiting for MCP responses'
        )
      );
    }, timeoutMs);

    function tryParse(): void {
      while (true) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) {
          return;
        }

        const body = buffer.subarray(0, newlineIndex).toString('utf8').replace(/\r$/, '').trim();
        buffer = buffer.subarray(newlineIndex + 1);
        if (!body) {
          continue;
        }

        responses.push(JSON.parse(body) as Record<string, unknown>);
        if (responses.length >= expectedCount) {
          finish();
          return;
        }
      }
    }

    if (!child.stdout) {
      fail(new Error('MCP child stdout is unavailable'));
      return;
    }

    child.stdout.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        tryParse();
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderrBuffer += chunk.toString();
    });

    child.on('error', (error) => {
      fail(error);
    });

    child.on('exit', (code, signal) => {
      if (settled || responses.length >= expectedCount) {
        return;
      }
      const details = stderrBuffer.trim();
      const suffix = details ? `\n${details}` : '';
      fail(
        new Error(
          `MCP child exited before all responses arrived (code=${code}, signal=${signal})${suffix}`
        )
      );
    });
  });
}

function getResponseText(message: Record<string, unknown> | undefined): string {
  const result = (message?.result as { content?: Array<{ text?: string }> }) || {};
  return result.content?.[0]?.text || '';
}

function createReplayStep(step: Record<string, unknown>): Record<string, unknown> {
  return step;
}

function createOrchestrationBlock(block: Record<string, unknown>): Record<string, unknown> {
  return block;
}

function parseJsonArgument(expression: string, key: string): string | undefined {
  const marker = `const ${key} = JSON.parse(`;
  const start = expression.indexOf(marker);
  if (start === -1) {
    return undefined;
  }

  const quoteStart = start + marker.length;
  const quote = expression[quoteStart];
  if (quote !== '"' && quote !== "'") {
    return undefined;
  }

  let index = quoteStart + 1;
  while (index < expression.length) {
    if (expression[index] === '\\') {
      index += 2;
      continue;
    }
    if (expression[index] === quote) {
      const encoded = expression.slice(quoteStart, index + 1);
      const decoded = JSON.parse(encoded) as string;
      if (!decoded.startsWith('"') && !decoded.startsWith("'")) {
        return undefined;
      }
      return JSON.parse(decoded) as string;
    }
    index += 1;
  }

  return undefined;
}

function parseNumberArgument(expression: string, key: string): number | undefined {
  const match = expression.match(new RegExp(`const ${key} = ([0-9]+|undefined);`));
  if (!match?.[1] || match[1] === 'undefined') {
    return undefined;
  }
  return Number.parseInt(match[1], 10);
}

function parseParsedJsonArrayArgument<T>(expression: string, key: string): T[] {
  const marker = `const ${key} = JSON.parse(`;
  const start = expression.indexOf(marker);
  if (start === -1) {
    return [];
  }

  const quoteStart = start + marker.length;
  const quote = expression[quoteStart];
  if (quote !== '"' && quote !== "'") {
    return [];
  }

  let index = quoteStart + 1;
  while (index < expression.length) {
    if (expression[index] === '\\') {
      index += 2;
      continue;
    }
    if (expression[index] === quote) {
      const encoded = expression.slice(quoteStart, index + 1);
      const decoded = JSON.parse(encoded) as string;
      return JSON.parse(decoded) as T[];
    }
    index += 1;
  }

  return [];
}

function parseParsedJsonObjectArgument<T>(expression: string, key: string): T | null {
  const marker = `const ${key} = JSON.parse(`;
  const start = expression.indexOf(marker);
  if (start === -1) {
    return null;
  }

  const quoteStart = start + marker.length;
  const quote = expression[quoteStart];
  if (quote !== '"' && quote !== "'") {
    return null;
  }

  let index = quoteStart + 1;
  while (index < expression.length) {
    if (expression[index] === '\\') {
      index += 2;
      continue;
    }
    if (expression[index] === quote) {
      const encoded = expression.slice(quoteStart, index + 1);
      const decoded = JSON.parse(encoded) as string;
      return JSON.parse(decoded) as T;
    }
    index += 1;
  }

  return null;
}

function pickMockMatch<T>(
  plan: T | T[] | undefined,
  nth = 0
): {
  count: number;
  target: T | undefined;
} {
  if (Array.isArray(plan)) {
    return { count: plan.length, target: plan[nth] };
  }
  return { count: plan ? 1 : 0, target: nth === 0 ? plan : undefined };
}

function shiftSelectorSnapshot(page: MockPageState, selector: string): MockQueryPlan | undefined {
  const queue = page.wait?.selectorSnapshots?.[selector];
  if (!queue || queue.length === 0) {
    return page.query?.[selector];
  }
  if (queue.length === 1) {
    return queue[0];
  }
  return queue.shift();
}

function getMockFrame(page: MockPageState, frameSelector: string): MockFrameState | undefined {
  return page.frames?.find((frame) => frame.selector === frameSelector);
}

function getMockShadowRoot(page: MockPageState): MockShadowRootState | undefined {
  return page.shadowRoots?.[0];
}

function getMockDropzoneState(
  page: Pick<MockPageState, 'dropzones' | 'frames' | 'shadowRoots'>,
  selector: string,
  options: { nth?: number; frameSelector?: string; pierceShadow?: boolean } = {}
): MockDropzoneState | null {
  const nth = options.nth ?? 0;
  if (options.frameSelector) {
    const frame = page.frames?.find((entry) => entry.selector === options.frameSelector);
    const plan = frame?.dropzones?.[selector];
    if (!plan) {
      return null;
    }
    return Array.isArray(plan) ? (plan[nth] ?? null) : plan;
  }
  if (options.pierceShadow) {
    for (const shadowRoot of page.shadowRoots || []) {
      const plan = shadowRoot.dropzones?.[selector];
      if (plan) {
        return Array.isArray(plan) ? (plan[nth] ?? null) : plan;
      }
    }
  }
  const plan = page.dropzones?.[selector];
  if (!plan) {
    return null;
  }
  return Array.isArray(plan) ? (plan[nth] ?? null) : plan;
}

function pushPointerAction(page: MockPageState, action: MockPointerActionRecord): void {
  page.drag = page.drag || {};
  page.drag.recordedActions = page.drag.recordedActions || [];
  page.drag.recordedActions.push(action);
}

function getMockRecordingPlan(page: MockPageState): MockRecordingPlan {
  page.recording = page.recording || {};
  return page.recording;
}

function shiftPageText(page: MockPageState): string {
  const queue = page.wait?.pageTextSequence;
  if (!queue || queue.length === 0) {
    return page.visibleText || '';
  }
  if (queue.length === 1) {
    return queue[0] || '';
  }
  return queue.shift() || '';
}

function resolveNodeModulesPath(): string {
  const candidates = [
    join(process.cwd(), 'node_modules'),
    join(process.cwd(), '..', 'node_modules'),
    join(process.cwd(), '..', '..', 'node_modules'),
  ];
  return (
    candidates.find((candidate) => existsSync(join(candidate, 'ws'))) ||
    candidates.find((candidate) => existsSync(candidate)) ||
    candidates[0]
  );
}

function createMockBrowser(pagesInput: MockPageState[]) {
  let tempDir = '';
  let httpServer: http.Server | null = null;
  let wsServer: WebSocketServer | null = null;
  let browserSocketPath = '';
  const pageStates = new Map<string, MockPageState>();
  let nextPageCounter = pagesInput.length + 1;

  for (const [index, page] of pagesInput.entries()) {
    if (page.visibleText === undefined) {
      page.visibleText = 'Hello from visible text';
    }
    if (page.domSnapshot === undefined) {
      page.domSnapshot = '<html><body>Hello from DOM snapshot</body></html>';
    }
    pageStates.set(`/devtools/page/${index + 1}`, page);
  }

  async function start(options: RunMcpRequestsOptions = {}) {
    const entryServerPath = options.serverPath || bundledServerPath;
    const childEnv = options.childEnv || {};
    tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-mcp-server-'));

    const port = await new Promise<number>((resolve, reject) => {
      httpServer = http.createServer((req, res) => {
        const address = httpServer?.address();
        const serverPort = address && typeof address !== 'string' ? address.port : 0;

        if (req.url === '/json/list') {
          const pageEntries = Array.from(pageStates.entries());
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify([
              ...pageEntries.map(([wsPath, page]) => ({
                id: page.id,
                type: page.targetType || 'page',
                title: page.title,
                url: page.currentUrl,
                webSocketDebuggerUrl: `ws://127.0.0.1:${serverPort}${wsPath}`,
              })),
              {
                id: 'browser-target',
                type: 'browser',
                title: 'Browser',
                url: '',
                webSocketDebuggerUrl: `ws://127.0.0.1:${serverPort}${browserSocketPath || '/devtools/browser'}`,
              },
            ])
          );
          return;
        }

        if (req.url?.startsWith('/json/new')) {
          if (options.requirePutForNewPage && req.method !== 'PUT') {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'method not allowed' }));
            return;
          }

          const parsed = new URL(req.url, `http://127.0.0.1:${serverPort}`);
          const requestedUrl = parsed.searchParams.get('url') || 'about:blank';
          const wsPath = `/devtools/page/${nextPageCounter}`;
          const newPage: MockPageState = {
            id: `page-${nextPageCounter}`,
            title: requestedUrl === 'about:blank' ? 'about:blank' : requestedUrl,
            currentUrl: requestedUrl,
            visibleText: 'New page visible text',
            domSnapshot: '<html><body>New page</body></html>',
          };
          pageStates.set(wsPath, newPage);
          nextPageCounter += 1;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              id: newPage.id,
              type: 'page',
              title: newPage.title,
              url: newPage.currentUrl,
              webSocketDebuggerUrl: `ws://127.0.0.1:${serverPort}${wsPath}`,
            })
          );
          return;
        }

        if (req.url?.startsWith('/json/close/')) {
          const targetId = decodeURIComponent(req.url.slice('/json/close/'.length));
          const entry = Array.from(pageStates.entries()).find(([, page]) => page.id === targetId);
          if (!entry) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'page not found' }));
            return;
          }
          pageStates.delete(entry[0]);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: targetId }));
          return;
        }

        res.writeHead(404);
        res.end('not found');
      });

      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1', () => {
        const address = httpServer?.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to resolve mock browser server port'));
          return;
        }
        resolve(address.port);
      });
    });

    browserSocketPath = '/devtools/browser';
    wsServer = new WebSocketServer({ server: httpServer as http.Server });
    wsServer.on('connection', (socket, request) => {
      if ((request.url || '') === browserSocketPath) {
        const browserState =
          pagesInput[0]?.browser || (pagesInput[0] ? (pagesInput[0].browser = {}) : {});

        socket.on('message', (raw) => {
          const message = JSON.parse(raw.toString()) as {
            id: number;
            method: string;
            params?: Record<string, unknown>;
          };

          function reply(result: unknown): void {
            socket.send(JSON.stringify({ id: message.id, result }));
          }

          if (message.method === 'Browser.setDownloadBehavior') {
            browserState.setDownloadBehaviorCalls = browserState.setDownloadBehaviorCalls || [];
            browserState.setDownloadBehaviorCalls.push({
              behavior: typeof message.params?.behavior === 'string' ? message.params.behavior : '',
              downloadPath:
                typeof message.params?.downloadPath === 'string'
                  ? message.params.downloadPath
                  : undefined,
              eventsEnabled:
                typeof message.params?.eventsEnabled === 'boolean'
                  ? message.params.eventsEnabled
                  : undefined,
            });
            reply({});
            return;
          }

          if (message.method === 'Browser.cancelDownload') {
            browserState.canceledDownloadGuids = browserState.canceledDownloadGuids || [];
            browserState.canceledDownloadGuids.push(String(message.params?.guid || ''));
            reply({});
            return;
          }
        });

        for (const page of pagesInput) {
          for (const [index, download] of (page.events?.downloads || []).entries()) {
            const guid = download.guid || `${page.id}-download-${index + 1}`;
            setTimeout(
              () => {
                socket.send(
                  JSON.stringify({
                    method: 'Browser.downloadWillBegin',
                    params: {
                      frameId: download.frameId || `frame-${page.id}`,
                      guid,
                      url: download.url,
                      suggestedFilename: download.suggestedFilename,
                    },
                  })
                );
              },
              10 + index * 40
            );

            for (const [progressIndex, progress] of (download.progress || []).entries()) {
              setTimeout(
                () => {
                  socket.send(
                    JSON.stringify({
                      method: 'Browser.downloadProgress',
                      params: {
                        guid,
                        totalBytes: progress.totalBytes,
                        receivedBytes: progress.receivedBytes,
                        state: progress.state,
                        filePath: progress.filePath,
                      },
                    })
                  );
                },
                20 + index * 40 + progressIndex * 20
              );
            }
          }
        }
        return;
      }

      const page = pageStates.get(request.url || '');
      if (!page) {
        socket.close();
        return;
      }

      const remoteObjects = new Map<string, MockFileInputState>();

      socket.on('message', (raw) => {
        const message = JSON.parse(raw.toString()) as {
          id: number;
          method: string;
          params?: Record<string, unknown>;
        };

        function reply(result: unknown): void {
          socket.send(JSON.stringify({ id: message.id, result }));
        }

        function replyError(errorText: string): void {
          socket.send(
            JSON.stringify({
              id: message.id,
              result: { result: { subtype: 'error', description: errorText } },
            })
          );
        }

        if (message.method === 'Page.navigate') {
          const targetUrl = typeof message.params?.url === 'string' ? message.params.url : '';
          const navigatePlan = page.navigate?.[targetUrl];
          if (navigatePlan?.errorText) {
            reply({ frameId: 'frame-1', errorText: navigatePlan.errorText });
            return;
          }
          if (navigatePlan) {
            page.currentUrl = navigatePlan.finalUrl;
            page.readyStateSequence = [...(navigatePlan.readyStates || ['loading', 'interactive'])];
          }
          reply({ frameId: 'frame-1' });
          return;
        }

        if (message.method === 'Page.getFrameTree') {
          const nextFrameTree = page.frameTreeSequence?.shift();
          reply({
            frameTree: nextFrameTree || page.frameTree || { frame: { id: `frame-${page.id}` } },
          });
          return;
        }

        if (message.method === 'Page.getLayoutMetrics') {
          const width = page.viewport?.width ?? 1280;
          const height = page.viewport?.height ?? 720;
          reply({
            visualViewport: {
              pageX: 0,
              pageY: 0,
              clientWidth: width,
              clientHeight: height,
              scale: 1,
            },
            cssVisualViewport: {
              pageX: 0,
              pageY: 0,
              clientWidth: width,
              clientHeight: height,
              scale: 1,
            },
          });
          return;
        }

        if (message.method === 'Page.captureScreenshot') {
          if (!page.screenshot) {
            reply({ data: '' });
            return;
          }
          page.screenshot.lastCaptureBeyondViewport =
            message.params?.captureBeyondViewport === true;
          const clip =
            message.params?.clip && typeof message.params.clip === 'object'
              ? (message.params.clip as Record<string, unknown>)
              : null;
          page.screenshot.lastClip = clip
            ? {
                x: Number(clip.x),
                y: Number(clip.y),
                width: Number(clip.width),
                height: Number(clip.height),
                scale: Number(clip.scale),
              }
            : undefined;
          if (page.screenshot.expectedClip) {
            expect(page.screenshot.lastClip).toEqual(page.screenshot.expectedClip);
          }
          reply({ data: page.screenshot.data || '' });
          return;
        }

        if (message.method === 'Input.dispatchMouseEvent') {
          const type = typeof message.params?.type === 'string' ? message.params.type : '';
          const x = Number(message.params?.x);
          const y = Number(message.params?.y);
          const button =
            typeof message.params?.button === 'string' ? message.params.button : undefined;
          for (const hoverPlan of Object.values(page.hover || {})) {
            if (type === 'mouseMoved') {
              hoverPlan.lastMouseMove = { x, y };
            }
          }
          pushPointerAction(page, { type, x, y, button });
          reply({});
          return;
        }

        if (message.method === 'Input.dispatchKeyEvent') {
          const type = typeof message.params?.type === 'string' ? message.params.type : '';
          const key = typeof message.params?.key === 'string' ? message.params.key : '';
          const modifiersMask = Number(message.params?.modifiers || 0);
          const modifiers = [
            ...(modifiersMask & 1 ? ['Alt'] : []),
            ...(modifiersMask & 2 ? ['Control'] : []),
            ...(modifiersMask & 4 ? ['Meta'] : []),
            ...(modifiersMask & 8 ? ['Shift'] : []),
          ];
          const keyboardPlan = page.keyboard;
          if (type === 'keyDown') {
            if (keyboardPlan?.expectedKey && key !== keyboardPlan.expectedKey) {
              replyError(`unexpected key: ${key}`);
              return;
            }
            if (
              keyboardPlan?.expectedModifiers &&
              JSON.stringify(modifiers) !== JSON.stringify(keyboardPlan.expectedModifiers)
            ) {
              replyError(`unexpected modifiers for key: ${key}`);
              return;
            }
            if (keyboardPlan) {
              keyboardPlan._seenKeyDownCount = (keyboardPlan._seenKeyDownCount || 0) + 1;
            }
          }
          if (
            type === 'keyUp' &&
            typeof keyboardPlan?.expectedRepeat === 'number' &&
            (keyboardPlan._seenKeyDownCount || 0) !== keyboardPlan.expectedRepeat
          ) {
            replyError(`unexpected repeat for key: ${key}`);
            return;
          }
          reply({});
          return;
        }

        if (message.method === 'Page.enable' || message.method === 'Network.enable') {
          reply({});
          if (message.method === 'Page.enable') {
            const dialog = page.events?.dialogs?.[0];
            const navigations = page.events?.navigations || [];
            if (dialog) {
              setTimeout(() => {
                socket.send(
                  JSON.stringify({
                    method: 'Page.javascriptDialogOpening',
                    params: { message: dialog.message, type: dialog.type },
                  })
                );
              }, 10);
            }
            navigations.forEach((navigation, index) => {
              setTimeout(
                () => {
                  socket.send(
                    JSON.stringify({
                      method: 'Page.frameNavigated',
                      params: { frame: { url: navigation.url, parentId: navigation.parentId } },
                    })
                  );
                },
                10 + index * 10
              );
            });
          }
          if (message.method === 'Network.enable') {
            const requestPlan = page.events?.requests?.[0];
            if (requestPlan) {
              setTimeout(() => {
                socket.send(
                  JSON.stringify({
                    method: 'Network.requestWillBeSent',
                    params: { request: { url: requestPlan.url, method: requestPlan.method } },
                  })
                );
              }, 10);
            }
          }
          return;
        }

        if (message.method === 'Fetch.enable') {
          page.intercept = page.intercept || {};
          page.intercept.fetchEnabledPatterns = Array.isArray(message.params?.patterns)
            ? (message.params?.patterns as unknown[])
            : [];
          if (page.intercept.enableError) {
            socket.send(
              JSON.stringify({ id: message.id, error: { message: page.intercept.enableError } })
            );
            return;
          }
          reply({});
          const pauseDispatchDelayMs = page.intercept.pauseDispatchDelayMs ?? 10;
          for (const [index, paused] of (page.intercept.pausedRequests || []).entries()) {
            setTimeout(
              () => {
                socket.send(
                  JSON.stringify({
                    method: 'Fetch.requestPaused',
                    params: {
                      requestId: paused.requestId || `fetch-${index + 1}`,
                      resourceType: paused.resourceType || 'XHR',
                      request: {
                        url: paused.url,
                        method: paused.method,
                        headers: paused.requestHeaders || {},
                      },
                    },
                  })
                );
              },
              pauseDispatchDelayMs + index * 10
            );
          }
          return;
        }

        if (message.method === 'Fetch.continueRequest') {
          page.intercept = page.intercept || {};
          page.intercept.continuedRequestIds = page.intercept.continuedRequestIds || [];
          page.intercept.continuedRequestIds.push(String(message.params?.requestId || ''));
          reply({});
          return;
        }

        if (message.method === 'Fetch.failRequest') {
          page.intercept = page.intercept || {};
          page.intercept.failedRequests = page.intercept.failedRequests || [];
          page.intercept.failedRequests.push({
            requestId: String(message.params?.requestId || ''),
            errorReason:
              typeof message.params?.errorReason === 'string' ? message.params.errorReason : '',
          });
          reply({});
          return;
        }

        if (message.method === 'Fetch.fulfillRequest') {
          page.intercept = page.intercept || {};
          page.intercept.fulfilledRequests = page.intercept.fulfilledRequests || [];
          page.intercept.fulfilledRequests.push({
            requestId: String(message.params?.requestId || ''),
            responseCode:
              typeof message.params?.responseCode === 'number'
                ? message.params.responseCode
                : undefined,
            responseHeaders: Array.isArray(message.params?.responseHeaders)
              ? (message.params.responseHeaders as Array<{ name: string; value: string }>)
              : [],
            body: typeof message.params?.body === 'string' ? message.params.body : '',
          });
          reply({});
          return;
        }

        if (message.method === 'DOM.setFileInputFiles') {
          const objectId =
            typeof message.params?.objectId === 'string' ? message.params.objectId : '';
          const target = remoteObjects.get(objectId);
          if (!target) {
            socket.send(
              JSON.stringify({ id: message.id, error: { message: 'file input handle not found' } })
            );
            return;
          }
          target.assignedFiles = Array.isArray(message.params?.files)
            ? (message.params.files as unknown[]).map((entry) => String(entry))
            : [];
          reply({});
          return;
        }

        if (message.method !== 'Runtime.evaluate') {
          return;
        }

        const expression = String(message.params?.expression || '');
        const recordingPayload = parseParsedJsonObjectArgument<{
          events?: MockRecordedEvent[];
          warnings?: MockRecordingWarning[];
        }>(expression, 'recordingPayload');

        if (expression.includes('globalThis.__CCS_BROWSER_RECORDING_RECORDER__ =')) {
          const plan = getMockRecordingPlan(page);
          if (plan.injectionError) {
            reply({
              result: {
                type: 'object',
                subtype: 'error',
                description: plan.injectionError,
              },
            });
            return;
          }

          if (plan.installed) {
            plan.teardownCalls = (plan.teardownCalls || 0) + 1;
          }
          plan.installed = true;
          if (
            recordingPayload &&
            (recordingPayload.events?.length || recordingPayload.warnings?.length)
          ) {
            plan.events = recordingPayload.events || [];
            plan.warnings = recordingPayload.warnings || [];
          }

          reply({ result: { type: 'object', value: { installed: true } } });
          return;
        }

        if (
          expression.includes('const recorder = globalThis.__CCS_BROWSER_RECORDING_RECORDER__') &&
          expression.includes('return { events, warnings }')
        ) {
          const plan = getMockRecordingPlan(page);
          if (plan.finalizeError) {
            socket.send(
              JSON.stringify({
                id: message.id,
                result: { exceptionDetails: { text: plan.finalizeError } },
              })
            );
            return;
          }
          if (plan.installed) {
            plan.teardownCalls = (plan.teardownCalls || 0) + 1;
          }
          plan.installed = false;
          reply({
            result: {
              type: 'object',
              value: {
                events: plan.events || [],
                warnings: plan.warnings || [],
              },
            },
          });
          return;
        }

        if (
          expression.includes('const recorder = globalThis.__CCS_BROWSER_RECORDING_RECORDER__') &&
          expression.includes('return { installed: false }')
        ) {
          const plan = getMockRecordingPlan(page);
          if (plan.installed) {
            plan.teardownCalls = (plan.teardownCalls || 0) + 1;
          }
          plan.installed = false;
          reply({ result: { type: 'object', value: { installed: false } } });
          return;
        }

        if (expression.includes('new DragEvent') && expression.includes('new DataTransfer()')) {
          const selector = parseJsonArgument(expression, 'selector') || '';
          const nth = parseNumberArgument(expression, 'nth') ?? 0;
          const frameSelector = parseJsonArgument(expression, 'frameSelector') || '';
          const pierceShadow = expression.includes('const pierceShadow = true');
          const filePayloads = parseParsedJsonArrayArgument<{
            name: string;
            size: number;
            mimeType: string;
          }>(expression, 'filePayloads');
          const eventTypes = Array.from(
            expression.matchAll(/new DragEvent\('(dragenter|dragover|drop)'/g)
          ).map((match) => match[1]);

          const target = getMockDropzoneState(page, selector, {
            nth,
            frameSelector,
            pierceShadow,
          });
          if (!target) {
            replyError(`element not found for selector: ${selector}`);
            return;
          }
          if (target.error) {
            replyError(target.error);
            return;
          }
          if (eventTypes.length === 0) {
            replyError(`drag event sequence not found for selector: ${selector}`);
            return;
          }
          if (target.requireFiles && filePayloads.length === 0) {
            reply({ result: { type: 'object', value: { accepted: false } } });
            return;
          }
          target.receivedEventTypes = eventTypes;
          target.receivedFiles = filePayloads.map((file) => ({
            name: file.name,
            size: file.size,
            type: file.mimeType,
          }));
          reply({
            result: {
              type: 'object',
              value: {
                accepted: target.acceptedByCancel === true ? true : target.accepted !== false,
              },
            },
          });
          return;
        }

        if (page.eval?.[expression]) {
          const evalPlan = page.eval[expression];
          if (evalPlan.error) {
            socket.send(
              JSON.stringify({
                id: message.id,
                result: { exceptionDetails: { text: evalPlan.error } },
              })
            );
            return;
          }
          if (evalPlan.nonSerializable) {
            socket.send(JSON.stringify({ id: message.id, result: { result: { type: 'object' } } }));
            return;
          }
          if (typeof evalPlan.unserializableValue === 'string') {
            socket.send(
              JSON.stringify({
                id: message.id,
                result: {
                  result: {
                    type: 'number',
                    unserializableValue: evalPlan.unserializableValue,
                  },
                },
              })
            );
            return;
          }
          socket.send(
            JSON.stringify({
              id: message.id,
              result: { result: { type: 'object', value: evalPlan.result } },
            })
          );
          return;
        }

        if (expression === '0') {
          reply({ result: { type: 'number', value: 0 } });
          return;
        }

        if (expression.includes('element is not a file input for selector:')) {
          const selector = parseJsonArgument(expression, 'selector') || '';
          const nth = parseNumberArgument(expression, 'nth') ?? 0;
          const frameSelector = parseJsonArgument(expression, 'frameSelector') || '';
          const pierceShadow = expression.includes('const pierceShadow = true');

          const fileInputPlan = frameSelector
            ? getMockFrame(page, frameSelector)?.fileInputs?.[selector]
            : pierceShadow
              ? getMockShadowRoot(page)?.fileInputs?.[selector]
              : page.fileInputs?.[selector];

          const { count, target } = pickMockMatch(fileInputPlan, nth);
          if (!target || count <= nth) {
            replyError(`element not found for selector: ${selector}`);
            return;
          }
          if (target.kind !== 'file') {
            replyError(`element is not a file input for selector: ${selector}`);
            return;
          }

          const objectId = `file-input:${page.id}:${selector}:${nth}:${frameSelector || 'root'}:${pierceShadow ? 'shadow' : 'light'}`;
          remoteObjects.set(objectId, target);
          socket.send(
            JSON.stringify({
              id: message.id,
              result: {
                result: {
                  type: 'object',
                  subtype: 'node',
                  className: 'HTMLInputElement',
                  objectId,
                },
              },
            })
          );
          return;
        }

        if (expression.includes('document.title') && expression.includes('location.href')) {
          reply({
            result: {
              type: 'string',
              value: JSON.stringify({ title: page.title, url: page.currentUrl }),
            },
          });
          return;
        }

        if (expression.includes('document.body ? document.body.innerText')) {
          reply({ result: { type: 'string', value: shiftPageText(page) } });
          return;
        }

        if (expression.includes('document.documentElement ? document.documentElement.outerHTML')) {
          reply({ result: { type: 'string', value: page.domSnapshot || '' } });
          return;
        }

        if (expression.includes('document.readyState') && expression.includes('location.href')) {
          const readyState = page.readyStateSequence?.shift() || 'complete';
          reply({
            result: {
              type: 'string',
              value: JSON.stringify({ href: page.currentUrl, readyState }),
            },
          });
          return;
        }

        if (expression.includes('scrollIntoView') && expression.includes('resolvedOffsetX')) {
          const selector = parseJsonArgument(expression, 'selector') || '';
          const nth = parseNumberArgument(expression, 'nth') ?? 0;
          const clickPlan = page.click?.[selector];
          const { count, target: resolvedClickPlan } = pickMockMatch(clickPlan, nth);
          const attemptedMouseDown = expression.includes("dispatchMouseEvent('mousedown'");
          const attemptedMouseUp = expression.includes("dispatchMouseEvent('mouseup'");
          const attemptedMouseSequence = attemptedMouseDown && attemptedMouseUp;
          const attemptedClickEvent = expression.includes("dispatchMouseEvent('click'");
          const attemptedDoubleClickEvent = expression.includes("new MouseEvent('dblclick'");
          const readsDispatchResult = expression.includes('const dispatchResult = {');
          const gatesNativeClickOnDispatchResult = expression.includes(
            'if (!dispatchResult.shouldActivate)'
          );
          const checksIsConnectedBeforeNativeClick = expression.includes(
            'if (!element.isConnected)'
          );
          const catchIndex = expression.indexOf('catch (mouseError) {');
          const catchBlockEnd = catchIndex === -1 ? -1 : expression.indexOf('\n    }', catchIndex);
          const nativeClickIndexes = Array.from(expression.matchAll(/element\.click\(\)/g)).map(
            (match) => match.index ?? -1
          );
          const attemptedFallbackClick = nativeClickIndexes.some(
            (index) =>
              catchIndex !== -1 &&
              catchBlockEnd !== -1 &&
              index > catchIndex &&
              index < catchBlockEnd
          );
          const attemptedNativeClickOutsideCatch = nativeClickIndexes.some(
            (index) =>
              catchIndex === -1 ||
              catchBlockEnd === -1 ||
              index < catchIndex ||
              index > catchBlockEnd
          );
          const offsetX = parseNumberArgument(expression, 'offsetX');
          const offsetY = parseNumberArgument(expression, 'offsetY');
          const button = parseJsonArgument(expression, 'button') || 'left';
          const clickCount = parseNumberArgument(expression, 'clickCount') ?? 1;
          if (!resolvedClickPlan) {
            replyError(`element index ${nth} is out of range for selector: ${selector}`);
            return;
          }
          if (count <= nth) {
            replyError(`element index ${nth} is out of range for selector: ${selector}`);
            return;
          }
          if (resolvedClickPlan.detached && expression.includes('element.isConnected')) {
            replyError(`element is detached for selector: ${selector}`);
            return;
          }
          if (resolvedClickPlan.disabled) {
            replyError(`element is disabled for selector: ${selector}`);
            return;
          }
          if (resolvedClickPlan.hidden && expression.includes('getBoundingClientRect')) {
            replyError(`element is hidden or not interactable for selector: ${selector}`);
            return;
          }
          if (resolvedClickPlan.requireMouseSequence && !attemptedMouseSequence) {
            replyError(`mousedown/mouseup required for selector: ${selector}`);
            return;
          }
          if (resolvedClickPlan.forbidSyntheticClickEvent && attemptedClickEvent) {
            replyError(`synthetic click event forbidden for selector: ${selector}`);
            return;
          }
          if (
            (resolvedClickPlan.cancelMouseDown || resolvedClickPlan.cancelMouseUp) &&
            !readsDispatchResult
          ) {
            replyError(`dispatch result must be checked for selector: ${selector}`);
            return;
          }
          if (
            (resolvedClickPlan.cancelMouseDown || resolvedClickPlan.cancelMouseUp) &&
            !gatesNativeClickOnDispatchResult
          ) {
            replyError(`native click must be gated for selector: ${selector}`);
            return;
          }
          if (resolvedClickPlan.detachAfterMouseDown && !checksIsConnectedBeforeNativeClick) {
            replyError(`connected state must be rechecked for selector: ${selector}`);
            return;
          }
          if (resolvedClickPlan.requireNativeClick && !attemptedNativeClickOutsideCatch) {
            replyError(`native click required for selector: ${selector}`);
            return;
          }
          if (
            resolvedClickPlan.expectedOffset &&
            (offsetX !== resolvedClickPlan.expectedOffset.x ||
              offsetY !== resolvedClickPlan.expectedOffset.y)
          ) {
            replyError(`unexpected click offset for selector: ${selector}`);
            return;
          }
          if (resolvedClickPlan.expectedButton && button !== resolvedClickPlan.expectedButton) {
            replyError(`unexpected click button for selector: ${selector}`);
            return;
          }
          if (
            typeof resolvedClickPlan.expectedClickCount === 'number' &&
            clickCount !== resolvedClickPlan.expectedClickCount
          ) {
            replyError(`unexpected click count for selector: ${selector}`);
            return;
          }
          if (
            resolvedClickPlan.requireDoubleClickEvent &&
            clickCount === 2 &&
            !attemptedDoubleClickEvent
          ) {
            replyError(`dblclick event required for selector: ${selector}`);
            return;
          }
          if (resolvedClickPlan.mouseSequenceError) {
            if (!attemptedMouseSequence) {
              replyError(`mousedown/mouseup required for selector: ${selector}`);
              return;
            }
            if (attemptedFallbackClick || attemptedNativeClickOutsideCatch) {
              reply({
                result: {
                  type: 'string',
                  value: JSON.stringify({
                    resolvedOffsetX: offsetX ?? 50,
                    resolvedOffsetY: offsetY ?? 10,
                    button,
                    clickCount,
                  }),
                },
              });
              return;
            }
            replyError(resolvedClickPlan.mouseSequenceError);
            return;
          }
          if (resolvedClickPlan.error) {
            replyError(resolvedClickPlan.error);
            return;
          }
          reply({
            result: {
              type: 'string',
              value: JSON.stringify({
                resolvedOffsetX: offsetX ?? 50,
                resolvedOffsetY: offsetY ?? 10,
                button,
                clickCount,
              }),
            },
          });
          return;
        }

        if (
          expression.includes('getComputedStyle(element)') &&
          (expression.includes('boundingClientRect') ||
            expression.includes('visibleClip') ||
            expression.includes('centerPoint') ||
            expression.includes('querySelectorAll(selector)'))
        ) {
          const selector = parseJsonArgument(expression, 'selector') || '';
          const nth = parseNumberArgument(expression, 'nth');
          const frameSelector = parseJsonArgument(expression, 'frameSelector') || '';
          const pierceShadow = expression.includes('const pierceShadow = true');
          const frame = frameSelector ? getMockFrame(page, frameSelector) : undefined;
          const shadowRoot = pierceShadow ? getMockShadowRoot(page) : undefined;
          const scopedQuery = frame?.query?.[selector] ?? shadowRoot?.query?.[selector];
          const frameRootPlan = frame?.query?.[frameSelector];
          const frameRect = !Array.isArray(frameRootPlan) ? frameRootPlan?.rect : undefined;
          const applyFrameOffset = (rect?: MockRect): MockRect | undefined => {
            if (!rect || !frameRect) {
              return rect;
            }
            return {
              x: rect.x + frameRect.left,
              y: rect.y + frameRect.top,
              width: rect.width,
              height: rect.height,
              top: rect.top + frameRect.top,
              right: rect.right + frameRect.left,
              bottom: rect.bottom + frameRect.top,
              left: rect.left + frameRect.left,
            };
          };
          const queryPlan = scopedQuery ?? shiftSelectorSnapshot(page, selector);
          if (
            page.screenshot?.requireScrolledMeasurement &&
            (selector in (page.query || {}) || Boolean(scopedQuery)) &&
            !expression.includes('scrollIntoView')
          ) {
            replyError(`scrollIntoView required for selector: ${selector}`);
            return;
          }
          if (Array.isArray(queryPlan) && expression.includes('querySelectorAll(selector)')) {
            const targetIndex = nth ?? 0;
            const target = queryPlan[targetIndex];
            if (target?.error) {
              replyError(target.error);
              return;
            }
            if (queryPlan.length <= targetIndex || target?.exists === false || !target) {
              reply({
                result: {
                  type: 'string',
                  value: JSON.stringify({
                    exists:
                      nth === undefined ? queryPlan.length > 0 : queryPlan.length > targetIndex,
                    count: queryPlan.length,
                    targetIndex,
                    targetMissing: true,
                  }),
                },
              });
              return;
            }
            const rect = applyFrameOffset(target.rect);
            const text = target.innerText || target.textContent || '';
            reply({
              result: {
                type: 'string',
                value: JSON.stringify({
                  exists: true,
                  count: queryPlan.length,
                  targetIndex,
                  connected: target.connected !== false,
                  text,
                  innerText: target.innerText || '',
                  textContent: target.textContent || '',
                  boundingClientRect: rect,
                  display: target.display || 'block',
                  visibility: target.visibility || 'visible',
                  opacity: target.opacity || '1',
                  href: target.href || '',
                  onclick: target.onclick || '',
                  interactable:
                    target.connected !== false &&
                    (target.display || 'block') !== 'none' &&
                    (target.visibility || 'visible') !== 'hidden' &&
                    Boolean(rect && rect.width > 0 && rect.height > 0),
                }),
              },
            });
            return;
          }
          const resolvedQueryPlan = Array.isArray(queryPlan) ? queryPlan.shift() : queryPlan;
          if (resolvedQueryPlan?.error) {
            replyError(resolvedQueryPlan.error);
            return;
          }
          if (resolvedQueryPlan?.exists === false || !resolvedQueryPlan) {
            reply({ result: { type: 'string', value: JSON.stringify({ exists: false }) } });
            return;
          }
          const rect = applyFrameOffset(resolvedQueryPlan.rect);
          const text = resolvedQueryPlan.innerText || resolvedQueryPlan.textContent || '';
          const viewportWidth = 1280;
          const viewportHeight = 720;
          const clipX = Math.max(0, rect?.left ?? 0);
          const clipY = Math.max(0, rect?.top ?? 0);
          const clipRight = Math.min(viewportWidth, rect?.right ?? 0);
          const clipBottom = Math.min(viewportHeight, rect?.bottom ?? 0);
          reply({
            result: {
              type: 'string',
              value: JSON.stringify({
                exists: true,
                connected: resolvedQueryPlan.connected !== false,
                text,
                innerText: resolvedQueryPlan.innerText || '',
                textContent: resolvedQueryPlan.textContent || '',
                boundingClientRect: rect,
                display: resolvedQueryPlan.display || 'block',
                visibility: resolvedQueryPlan.visibility || 'visible',
                opacity: resolvedQueryPlan.opacity || '1',
                interactable:
                  resolvedQueryPlan.connected !== false &&
                  (resolvedQueryPlan.display || 'block') !== 'none' &&
                  (resolvedQueryPlan.visibility || 'visible') !== 'hidden' &&
                  Boolean(rect && rect.width > 0 && rect.height > 0),
                centerPoint: rect
                  ? {
                      x: rect.left + rect.width / 2,
                      y: rect.top + rect.height / 2,
                    }
                  : undefined,
                visibleClip: rect
                  ? {
                      x: clipX,
                      y: clipY,
                      width: Math.max(0, clipRight - clipX),
                      height: Math.max(0, clipBottom - clipY),
                      scale: 1,
                    }
                  : undefined,
              }),
            },
          });
          return;
        }

        if (
          expression.includes("dispatch('mouseover')") &&
          expression.includes("dispatch('mouseenter')") &&
          expression.includes("dispatch('mousemove')")
        ) {
          const selector = parseJsonArgument(expression, 'selector') || '';
          const hoverPlan = page.hover?.[selector];
          if (!hoverPlan) {
            replyError(`element not found for selector: ${selector}`);
            return;
          }
          if (hoverPlan.detached) {
            replyError(`element is detached for selector: ${selector}`);
            return;
          }
          if (hoverPlan.hidden || hoverPlan.zeroSized) {
            replyError(`element is hidden or not interactable for selector: ${selector}`);
            return;
          }
          if (hoverPlan.requireCdpMouseMove && !hoverPlan.lastMouseMove) {
            replyError(`real mouse movement required for selector: ${selector}`);
            return;
          }
          if (hoverPlan.error) {
            replyError(hoverPlan.error);
            return;
          }
          reply({ result: { type: 'string', value: 'ok' } });
          return;
        }

        if (expression.includes('focusTarget') && expression.includes('typedLength')) {
          const selector = parseJsonArgument(expression, 'selector') || '';
          const text = parseJsonArgument(expression, 'text') ?? '';
          const clearFirst = expression.includes('const clearFirst = true');
          const typePlan = page.type?.[selector];
          if (!typePlan) {
            replyError(`element not found for selector: ${selector}`);
            return;
          }
          if (typePlan.kind === 'unsupported') {
            replyError(`element is not text-editable for selector: ${selector}`);
            return;
          }
          if (typePlan.kind === 'noneditable') {
            replyError(`element is not text-editable for selector: ${selector}`);
            return;
          }
          if (typePlan.requireFocus && !expression.includes('focusTarget(element)')) {
            replyError(`focus was not requested for selector: ${selector}`);
            return;
          }

          const currentValue = typePlan.value || '';
          const expectedValue = clearFirst
            ? (typePlan.expectedValueWhenClearFirst ?? text)
            : (typePlan.expectedValueWhenAppend ?? `${currentValue}${text}`);

          typePlan.focused = true;
          typePlan.value = expectedValue;
          reply({
            result: {
              type: 'string',
              value: JSON.stringify({
                value: expectedValue,
                typedLength: expectedValue.length,
              }),
            },
          });
          return;
        }

        if (expression.includes('new KeyboardEvent(')) {
          const key = parseJsonArgument(expression, 'key') || '';
          const repeat = parseNumberArgument(expression, 'repeat') ?? 1;
          const modifiersMatch = expression.match(/const modifiers = (\[[^\n;]*\]);/);
          const modifiers = modifiersMatch ? (JSON.parse(modifiersMatch[1]) as string[]) : [];
          const keyboardPlan = page.keyboard;
          if (keyboardPlan?.expectedKey && key !== keyboardPlan.expectedKey) {
            replyError(`unexpected key: ${key}`);
            return;
          }
          if (
            keyboardPlan?.expectedModifiers &&
            JSON.stringify(modifiers) !== JSON.stringify(keyboardPlan.expectedModifiers)
          ) {
            replyError(`unexpected modifiers for key: ${key}`);
            return;
          }
          if (
            typeof keyboardPlan?.expectedRepeat === 'number' &&
            repeat !== keyboardPlan.expectedRepeat
          ) {
            replyError(`unexpected repeat for key: ${key}`);
            return;
          }
          reply({
            result: {
              type: 'string',
              value: JSON.stringify({ key, modifiers, repeat }),
            },
          });
          return;
        }

        if (
          expression.includes('window.scrollBy(deltaX, deltaY)') ||
          expression.includes('element.scrollBy(deltaX, deltaY)')
        ) {
          const selector = parseJsonArgument(expression, 'selector');
          const behavior = parseJsonArgument(expression, 'behavior') || '';
          const deltaX = Number(
            expression.match(/const deltaX = (-?[0-9]+(?:\.[0-9]+)?);/)?.[1] || 0
          );
          const deltaY = Number(
            expression.match(/const deltaY = (-?[0-9]+(?:\.[0-9]+)?);/)?.[1] || 0
          );
          const scrollPlan = selector ? page.scroll?.[selector] : undefined;
          if (selector && !scrollPlan) {
            replyError(`element not found for selector: ${selector}`);
            return;
          }
          if (scrollPlan?.expectedBehavior && behavior !== scrollPlan.expectedBehavior) {
            replyError(`unexpected scroll behavior for selector: ${selector}`);
            return;
          }
          if (
            typeof scrollPlan?.expectedDeltaX === 'number' &&
            deltaX !== scrollPlan.expectedDeltaX
          ) {
            replyError(`unexpected deltaX for selector: ${selector}`);
            return;
          }
          if (
            typeof scrollPlan?.expectedDeltaY === 'number' &&
            deltaY !== scrollPlan.expectedDeltaY
          ) {
            replyError(`unexpected deltaY for selector: ${selector}`);
            return;
          }
          reply({
            result: {
              type: 'string',
              value: JSON.stringify(
                selector
                  ? { scope: 'element', selector, behavior, deltaX, deltaY }
                  : { scope: 'page', behavior, deltaX, deltaY }
              ),
            },
          });
          return;
        }
      });
    });

    const child = spawn('node', [entryServerPath], {
      cwd: tempDir,
      env: {
        ...process.env,
        ...childEnv,
        CCS_BROWSER_DEVTOOLS_HTTP_URL: `http://127.0.0.1:${port}`,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return child;
  }

  async function stop() {
    await new Promise<void>((resolve) => {
      wsServer?.close(() => resolve());
      if (!wsServer) resolve();
    });
    wsServer = null;

    await new Promise<void>((resolve) => {
      httpServer?.close(() => resolve());
      if (!httpServer) resolve();
    });
    httpServer = null;

    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  }

  return { start, stop };
}

async function runMcpRequests(
  pages: MockPageState[],
  requests: JsonRpcMessage[],
  options: RunMcpRequestsOptions = {}
) {
  const browser = createMockBrowser(pages);
  const child = await browser.start(options);

  try {
    const responsesPromise = collectResponses(
      child,
      requests.length + 1,
      options.responseTimeoutMs
    );
    child.stdin.write(
      encodeMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'bun-test', version: '1.0.0' },
        },
      })
    );

    for (const request of requests) {
      child.stdin.write(encodeMessage(request));
    }
    child.stdin.end();

    return await responsesPromise;
  } finally {
    child.kill();
    await browser.stop();
  }
}

export {
  bundledServerPath,
  runMcpRequests,
  getResponseText,
  createReplayStep,
  createOrchestrationBlock,
  getMockDropzoneState,
  getMockFrame,
  getMockShadowRoot,
  getMockRecordingPlan,
  resolveNodeModulesPath,
  cpSync,
  rmSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  tmpdir,
  join,
};
export type { MockPageState };
