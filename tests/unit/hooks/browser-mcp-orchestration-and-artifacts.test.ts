import { describe, expect, it } from 'bun:test';
import { runMcpRequests, getResponseText, createReplayStep, createOrchestrationBlock, mkdtempSync, rmSync, writeFileSync, tmpdir, join } from './browser-mcp-test-harness';
import type { MockPageState } from './browser-mcp-test-harness';

describe('ccs-browser MCP server - orchestration and artifacts', () => {
  it('starts orchestration, reports progress, and completes a wait_then_click flow', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Orchestration Page',
        currentUrl: 'https://example.com/orchestration',
        click: {
          '#menu': {},
        },
        wait: {
          selectorSnapshots: {
            '#menu': [
              [
                {
                  exists: true,
                  rect: {
                    x: 20,
                    y: 30,
                    width: 100,
                    height: 40,
                    top: 30,
                    right: 120,
                    bottom: 70,
                    left: 20,
                  },
                  display: 'block',
                  visibility: 'visible',
                  opacity: '1',
                },
              ],
            ],
          },
        },
        query: {
          '#menu': {
            exists: true,
            connected: true,
            rect: {
              x: 20,
              y: 30,
              width: 100,
              height: 40,
              top: 30,
              right: 120,
              bottom: 70,
              left: 20,
            },
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
        },
      },
    ];

    const responses = await runMcpRequests(pages, [
      {
        jsonrpc: '2.0',
        id: 1201,
        method: 'tools/call',
        params: {
          name: 'browser_start_orchestration',
          arguments: {
            blocks: [
              createOrchestrationBlock({
                type: 'wait_for_then_click',
                args: {
                  wait: {
                    selector: '#menu',
                    condition: { kind: 'visibility' },
                    timeoutMs: 1000,
                  },
                  click: {
                    selector: '#menu',
                  },
                },
              }),
            ],
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: 1202,
        method: 'tools/call',
        params: { name: 'browser_get_orchestration', arguments: {} },
      },
    ]);

    expect(getResponseText(responses.find((message) => message.id === 1201))).toContain('status: completed');
    expect(getResponseText(responses.find((message) => message.id === 1202))).toContain('completedBlocks: 1');
    expect(getResponseText(responses.find((message) => message.id === 1202))).toContain('status: completed');
  });

  it('cancels orchestration before later blocks run', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Orchestration Cancel Page',
        currentUrl: 'https://example.com/orchestration-cancel',
        query: {
          '#handle': {
            exists: true,
            connected: true,
            rect: {
              x: 20,
              y: 30,
              width: 40,
              height: 40,
              top: 30,
              right: 60,
              bottom: 70,
              left: 20,
            },
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
          '#status': {
            exists: true,
            connected: true,
            innerText: 'ready',
            textContent: 'ready',
            rect: {
              x: 80,
              y: 30,
              width: 80,
              height: 20,
              top: 30,
              right: 160,
              bottom: 50,
              left: 80,
            },
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
        },
      },
    ];

    const responses = await runMcpRequests(pages, [
      {
        jsonrpc: '2.0',
        id: 1202_1,
        method: 'tools/call',
        params: {
          name: 'browser_start_orchestration',
          arguments: {
            blocks: [
              createOrchestrationBlock({
                type: 'run_replay_sequence',
                args: {
                  steps: [
                    createReplayStep({
                      type: 'pointer_action',
                      pageId: 'page-1',
                      args: {
                        actions: [
                          { type: 'move', selector: '#handle' },
                          { type: 'pause', durationMs: 400 },
                        ],
                      },
                    }),
                  ],
                },
              }),
              createOrchestrationBlock({
                type: 'assert_query',
                args: {
                  query: { selector: '#status', fields: ['innerText'] },
                  assertions: [{ field: 'innerText', op: 'equals', value: 'ready' }],
                },
              }),
            ],
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: 1202_2,
        method: 'tools/call',
        params: { name: 'browser_cancel_orchestration', arguments: {} },
      },
      {
        jsonrpc: '2.0',
        id: 1202_3,
        method: 'tools/call',
        params: { name: 'browser_get_orchestration', arguments: {} },
      },
    ]);

    expect(getResponseText(responses.find((message) => message.id === 1202_1))).toContain(
      'status: running'
    );
    const text = getResponseText(responses.find((message) => message.id === 1202_3));
    expect(text).toContain('status: canceled');
    expect(text).not.toContain('completedBlocks: 2');
  });

  it('completes a wait_then_type flow', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Type Orchestration Page',
        currentUrl: 'https://example.com/type-orchestration',
        wait: {
          selectorSnapshots: {
            '#email': [
              [
                {
                  exists: true,
                  rect: {
                    x: 20,
                    y: 30,
                    width: 100,
                    height: 40,
                    top: 30,
                    right: 120,
                    bottom: 70,
                    left: 20,
                  },
                  display: 'block',
                  visibility: 'visible',
                  opacity: '1',
                },
              ],
            ],
          },
        },
        type: {
          '#email': { kind: 'input', inputType: 'email', value: '' },
        },
      },
    ];

    const responses = await runMcpRequests(pages, [
      {
        jsonrpc: '2.0',
        id: 1203,
        method: 'tools/call',
        params: {
          name: 'browser_start_orchestration',
          arguments: {
            blocks: [
              createOrchestrationBlock({
                type: 'wait_for_then_type',
                args: {
                  wait: { selector: '#email', condition: { kind: 'visibility' }, timeoutMs: 1000 },
                  type: { selector: '#email', text: 'walker@example.com', clearFirst: true },
                },
              }),
            ],
          },
        },
      },
    ]);

    expect(getResponseText(responses.find((message) => message.id === 1203))).toContain('status: completed');
    expect(getResponseText(responses.find((message) => message.id === 1203))).toContain('completedBlocks: 1');
  });

  it('completes a run_replay_sequence block', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Replay Sequence Orchestration Page',
        currentUrl: 'https://example.com/orchestration-replay',
        click: { '#submit': {} },
        query: {
          '#submit': {
            exists: true,
            connected: true,
            rect: {
              x: 20,
              y: 30,
              width: 100,
              height: 40,
              top: 30,
              right: 120,
              bottom: 70,
              left: 20,
            },
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
        },
      },
    ];

    const responses = await runMcpRequests(pages, [
      {
        jsonrpc: '2.0',
        id: 1211,
        method: 'tools/call',
        params: {
          name: 'browser_start_orchestration',
          arguments: {
            blocks: [
              createOrchestrationBlock({
                type: 'run_replay_sequence',
                args: {
                  steps: [createReplayStep({ type: 'click', pageId: 'page-1', selector: '#submit', args: {} })],
                },
              }),
            ],
          },
        },
      },
    ]);

    expect(getResponseText(responses.find((message) => message.id === 1211))).toContain('status: completed');
  });

  it('completes an assert_query block', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Assert Query Page',
          currentUrl: 'https://example.com/assert-query',
          query: {
            '#status': {
              exists: true,
              connected: true,
              innerText: 'ready',
              textContent: 'ready',
              display: 'block',
              visibility: 'visible',
              opacity: '1',
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 1212,
          method: 'tools/call',
          params: {
            name: 'browser_start_orchestration',
            arguments: {
              blocks: [
                createOrchestrationBlock({
                  type: 'assert_query',
                  args: {
                    query: { selector: '#status', fields: ['innerText'] },
                    assert: { field: 'innerText', equals: 'ready' },
                  },
                }),
              ],
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 1212))).toContain('status: completed');
  });

  it('fails orchestration on the first failing block', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Failure Page', currentUrl: 'https://example.com/orchestration-failure' }],
      [
        {
          jsonrpc: '2.0',
          id: 1213,
          method: 'tools/call',
          params: {
            name: 'browser_start_orchestration',
            arguments: {
              blocks: [
                createOrchestrationBlock({
                  type: 'assert_query',
                  args: {
                    query: { selector: '#missing', fields: ['exists'] },
                    assert: { field: 'exists', equals: 'true' },
                  },
                }),
              ],
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 1214,
          method: 'tools/call',
          params: { name: 'browser_get_orchestration', arguments: {} },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 1214));
    expect(text).toContain('status: failed');
    expect(text).toContain('failedBlockIndex: 0');
  });

  it('runs a single-layer sequence with two successful blocks', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Sequence Page',
        currentUrl: 'https://example.com/sequence',
        click: {
          '#menu': {},
        },
        wait: {
          selectorSnapshots: {
            '#menu': [
              [
                {
                  exists: true,
                  rect: {
                    x: 20,
                    y: 30,
                    width: 100,
                    height: 40,
                    top: 30,
                    right: 120,
                    bottom: 70,
                    left: 20,
                  },
                  display: 'block',
                  visibility: 'visible',
                  opacity: '1',
                },
              ],
            ],
          },
        },
        query: {
          '#menu': {
            exists: true,
            connected: true,
            rect: {
              x: 20,
              y: 30,
              width: 100,
              height: 40,
              top: 30,
              right: 120,
              bottom: 70,
              left: 20,
            },
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
          '#status': {
            exists: true,
            connected: true,
            innerText: 'ready state',
            textContent: 'ready state',
            display: 'block',
            visibility: 'visible',
            opacity: '1',
            rect: {
              x: 20,
              y: 80,
              width: 100,
              height: 40,
              top: 80,
              right: 120,
              bottom: 120,
              left: 20,
            },
          },
        },
      },
    ];

    const responses = await runMcpRequests(pages, [
      {
        jsonrpc: '2.0',
        id: 1401,
        method: 'tools/call',
        params: {
          name: 'browser_start_orchestration',
          arguments: {
            blocks: [
              createOrchestrationBlock({
                type: 'sequence',
                args: {
                  steps: [
                    createOrchestrationBlock({
                      type: 'wait_for_then_click',
                      args: {
                        wait: { selector: '#menu', condition: { kind: 'visibility' }, timeoutMs: 1000 },
                        click: { selector: '#menu' },
                      },
                    }),
                    createOrchestrationBlock({
                      type: 'assert_query',
                      args: {
                        query: { selector: '#status', fields: ['innerText'] },
                        assertions: [{ field: 'innerText', op: 'contains', value: 'ready' }],
                      },
                    }),
                  ],
                },
              }),
            ],
          },
        },
      },
    ]);

    expect(getResponseText(responses.find((message) => message.id === 1401))).toContain('status: completed');
    expect(getResponseText(responses.find((message) => message.id === 1401))).toContain('completedBlocks: 1');
  });

  it('reports failedSequenceStepIndex when a sequence step fails', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Sequence Failure Page',
        currentUrl: 'https://example.com/sequence-failure',
        click: {
          '#menu': {},
        },
        wait: {
          selectorSnapshots: {
            '#menu': [
              [
                {
                  exists: true,
                  rect: {
                    x: 20,
                    y: 30,
                    width: 100,
                    height: 40,
                    top: 30,
                    right: 120,
                    bottom: 70,
                    left: 20,
                  },
                  display: 'block',
                  visibility: 'visible',
                  opacity: '1',
                },
              ],
            ],
          },
        },
      },
    ];

    const responses = await runMcpRequests(pages, [
      {
        jsonrpc: '2.0',
        id: 1402,
        method: 'tools/call',
        params: {
          name: 'browser_start_orchestration',
          arguments: {
            blocks: [
              createOrchestrationBlock({
                type: 'sequence',
                args: {
                  steps: [
                    createOrchestrationBlock({
                      type: 'wait_for_then_click',
                      args: {
                        wait: { selector: '#menu', condition: { kind: 'visibility' }, timeoutMs: 1000 },
                        click: { selector: '#menu' },
                      },
                    }),
                    createOrchestrationBlock({
                      type: 'assert_query',
                      args: {
                        query: { selector: '#missing', fields: ['exists'] },
                        assertions: [{ field: 'exists', op: 'equals', value: true }],
                      },
                    }),
                  ],
                },
              }),
            ],
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: 1403,
        method: 'tools/call',
        params: { name: 'browser_get_orchestration', arguments: {} },
      },
    ]);

    const text = getResponseText(responses.find((message) => message.id === 1403));
    expect(text).toContain('status: failed');
    expect(text).toContain('failedBlockIndex: 0');
    expect(text).toContain('failedSequenceStepIndex: 1');
  });

  it('rejects empty sequence steps and nested sequence blocks', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Sequence Validation Page', currentUrl: 'https://example.com/sequence-validation' }],
      [
        {
          jsonrpc: '2.0',
          id: 1404,
          method: 'tools/call',
          params: {
            name: 'browser_start_orchestration',
            arguments: {
              blocks: [createOrchestrationBlock({ type: 'sequence', args: { steps: [] } })],
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 1405,
          method: 'tools/call',
          params: {
            name: 'browser_start_orchestration',
            arguments: {
              blocks: [
                createOrchestrationBlock({
                  type: 'sequence',
                  args: {
                    steps: [createOrchestrationBlock({ type: 'sequence', args: { steps: [] } })],
                  },
                }),
              ],
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 1404))).toContain('sequence steps must be a non-empty array');
    expect(getResponseText(responses.find((message) => message.id === 1405))).toContain('sequence does not support nested sequence blocks');
  });

  it('runs a top-level block followed by a sequence in order', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Mixed Sequence Page',
        currentUrl: 'https://example.com/mixed-sequence',
        click: {
          '#menu': {},
        },
        wait: {
          selectorSnapshots: {
            '#menu': [
              [
                {
                  exists: true,
                  rect: {
                    x: 20,
                    y: 30,
                    width: 100,
                    height: 40,
                    top: 30,
                    right: 120,
                    bottom: 70,
                    left: 20,
                  },
                  display: 'block',
                  visibility: 'visible',
                  opacity: '1',
                },
              ],
            ],
          },
        },
        query: {
          '#status': {
            exists: true,
            connected: true,
            innerText: 'ready state',
            textContent: 'ready state',
            display: 'block',
            visibility: 'visible',
            opacity: '1',
            rect: {
              x: 20,
              y: 80,
              width: 100,
              height: 40,
              top: 80,
              right: 120,
              bottom: 120,
              left: 20,
            },
          },
        },
      },
    ];

    const responses = await runMcpRequests(pages, [
      {
        jsonrpc: '2.0',
        id: 1406,
        method: 'tools/call',
        params: {
          name: 'browser_start_orchestration',
          arguments: {
            blocks: [
              createOrchestrationBlock({
                type: 'assert_query',
                args: {
                  query: { selector: '#status', fields: ['innerText'] },
                  assertions: [{ field: 'innerText', op: 'contains', value: 'ready' }],
                },
              }),
              createOrchestrationBlock({
                type: 'sequence',
                args: {
                  steps: [
                    createOrchestrationBlock({
                      type: 'wait_for_then_click',
                      args: {
                        wait: { selector: '#menu', condition: { kind: 'visibility' }, timeoutMs: 1000 },
                        click: { selector: '#menu' },
                      },
                    }),
                  ],
                },
              }),
            ],
          },
        },
      },
    ]);

    expect(getResponseText(responses.find((message) => message.id === 1406))).toContain('status: completed');
    expect(getResponseText(responses.find((message) => message.id === 1406))).toContain('completedBlocks: 2');
  });

  it('passes assert_query with multiple structured assertions', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Assert Query Page',
          currentUrl: 'https://example.com/assert-query',
          query: {
            '#status': {
              exists: true,
              connected: true,
              innerText: 'ready state',
              textContent: 'ready state',
              display: 'block',
              visibility: 'visible',
              opacity: '0.95',
              rect: {
                x: 20,
                y: 30,
                width: 100,
                height: 40,
                top: 30,
                right: 120,
                bottom: 70,
                left: 20,
              },
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 1301,
          method: 'tools/call',
          params: {
            name: 'browser_start_orchestration',
            arguments: {
              blocks: [
                createOrchestrationBlock({
                  type: 'assert_query',
                  args: {
                    query: { selector: '#status', fields: ['exists', 'innerText', 'opacity'] },
                    assertions: [
                      { field: 'exists', op: 'equals', value: true },
                      { field: 'innerText', op: 'contains', value: 'ready' },
                      { field: 'opacity', op: 'gte', value: 0.9 },
                    ],
                  },
                }),
              ],
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 1301))).toContain('status: completed');
  });

  it('returns failedAssertionIndex, expected, and actual when assert_query fails', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Assert Failure Page',
          currentUrl: 'https://example.com/assert-failure',
          query: {
            '#status': {
              exists: true,
              connected: true,
              innerText: 'loading',
              textContent: 'loading',
              display: 'block',
              visibility: 'visible',
              opacity: '0.42',
              rect: {
                x: 20,
                y: 30,
                width: 100,
                height: 40,
                top: 30,
                right: 120,
                bottom: 70,
                left: 20,
              },
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 1302,
          method: 'tools/call',
          params: {
            name: 'browser_start_orchestration',
            arguments: {
              blocks: [
                createOrchestrationBlock({
                  type: 'assert_query',
                  args: {
                    query: { selector: '#status', fields: ['innerText', 'opacity'] },
                    assertions: [
                      { field: 'innerText', op: 'contains', value: 'ready' },
                      { field: 'opacity', op: 'gte', value: 0.9 },
                    ],
                  },
                }),
              ],
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 1303,
          method: 'tools/call',
          params: { name: 'browser_get_orchestration', arguments: {} },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 1303));
    expect(text).toContain('status: failed');
    expect(text).toContain('failedBlockIndex: 0');
    expect(text).toContain('failedAssertionIndex: 0');
    expect(text).toContain('field: innerText');
    expect(text).toContain('expected: "ready"');
    expect(text).toContain('actual: "loading"');
  });

  it('fails when numeric comparison is used on a non-number-like field or when op is unsupported', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Assert Type Error Page',
          currentUrl: 'https://example.com/assert-type-error',
          query: {
            '#status': {
              exists: true,
              connected: true,
              innerText: 'loading',
              textContent: 'loading',
              opacity: '0.42',
              display: 'block',
              visibility: 'visible',
              rect: {
                x: 20,
                y: 30,
                width: 100,
                height: 40,
                top: 30,
                right: 120,
                bottom: 70,
                left: 20,
              },
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 1304,
          method: 'tools/call',
          params: {
            name: 'browser_start_orchestration',
            arguments: {
              blocks: [
                createOrchestrationBlock({
                  type: 'assert_query',
                  args: {
                    query: { selector: '#status', fields: ['innerText'] },
                    assertions: [{ field: 'innerText', op: 'gte', value: 1 }],
                  },
                }),
              ],
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 1305,
          method: 'tools/call',
          params: {
            name: 'browser_start_orchestration',
            arguments: {
              blocks: [
                createOrchestrationBlock({
                  type: 'assert_query',
                  args: {
                    query: { selector: '#status', fields: ['opacity'] },
                    assertions: [{ field: 'opacity', op: 'matches', value: '.*' }],
                  },
                }),
              ],
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 1304))).toContain('numeric comparison expects a number-like field: innerText');
    expect(getResponseText(responses.find((message) => message.id === 1305))).toContain('unsupported assertion operator');
  });

  it('passes numeric gte and lt assertions', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Numeric Assertion Page',
          currentUrl: 'https://example.com/assert-numeric',
          query: {
            '#status': {
              exists: true,
              connected: true,
              opacity: '0.95',
              display: 'block',
              visibility: 'visible',
              rect: {
                x: 20,
                y: 30,
                width: 100,
                height: 40,
                top: 30,
                right: 120,
                bottom: 70,
                left: 20,
              },
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 1306,
          method: 'tools/call',
          params: {
            name: 'browser_start_orchestration',
            arguments: {
              blocks: [
                createOrchestrationBlock({
                  type: 'assert_query',
                  args: {
                    query: { selector: '#status', fields: ['opacity'] },
                    assertions: [
                      { field: 'opacity', op: 'gte', value: 0.9 },
                      { field: 'opacity', op: 'lt', value: 1.0 },
                    ],
                  },
                }),
              ],
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 1306))).toContain('status: completed');
  });

  it('continues to the next top-level block when continueOnError is true', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Policy Page',
        currentUrl: 'https://example.com/policy',
        query: {
          '#status': {
            exists: true,
            connected: true,
            innerText: 'ready state',
            textContent: 'ready state',
            display: 'block',
            visibility: 'visible',
            opacity: '1',
            rect: {
              x: 20,
              y: 80,
              width: 100,
              height: 40,
              top: 80,
              right: 120,
              bottom: 120,
              left: 20,
            },
          },
        },
      },
    ];

    const responses = await runMcpRequests(pages, [
      {
        jsonrpc: '2.0',
        id: 1501,
        method: 'tools/call',
        params: {
          name: 'browser_start_orchestration',
          arguments: {
            blocks: [
              createOrchestrationBlock({
                type: 'assert_query',
                continueOnError: true,
                args: {
                  query: { selector: '#missing', fields: ['exists'] },
                  assertions: [{ field: 'exists', op: 'equals', value: true }],
                },
              }),
              createOrchestrationBlock({
                type: 'assert_query',
                args: {
                  query: { selector: '#status', fields: ['innerText'] },
                  assertions: [{ field: 'innerText', op: 'contains', value: 'ready' }],
                },
              }),
            ],
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: 1502,
        method: 'tools/call',
        params: { name: 'browser_get_orchestration', arguments: {} },
      },
    ]);

    const text = getResponseText(responses.find((message) => message.id === 1502));
    expect(text).toContain('status: completed_with_failures');
    expect(text).toContain('completedBlocks: 2');
    expect(text).toContain('failedCount: 1');
    expect(text).toContain('failure[0].blockIndex: 0');
  });

  it('continues inside sequence when a step has continueOnError', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Sequence Policy Page',
        currentUrl: 'https://example.com/sequence-policy',
        query: {
          '#status': {
            exists: true,
            connected: true,
            innerText: 'ready state',
            textContent: 'ready state',
            display: 'block',
            visibility: 'visible',
            opacity: '1',
            rect: {
              x: 20,
              y: 80,
              width: 100,
              height: 40,
              top: 80,
              right: 120,
              bottom: 120,
              left: 20,
            },
          },
        },
      },
    ];

    const responses = await runMcpRequests(pages, [
      {
        jsonrpc: '2.0',
        id: 1503,
        method: 'tools/call',
        params: {
          name: 'browser_start_orchestration',
          arguments: {
            blocks: [
              createOrchestrationBlock({
                type: 'sequence',
                args: {
                  steps: [
                    createOrchestrationBlock({
                      type: 'assert_query',
                      continueOnError: true,
                      args: {
                        query: { selector: '#missing', fields: ['exists'] },
                        assertions: [{ field: 'exists', op: 'equals', value: true }],
                      },
                    }),
                    createOrchestrationBlock({
                      type: 'assert_query',
                      args: {
                        query: { selector: '#status', fields: ['innerText'] },
                        assertions: [{ field: 'innerText', op: 'contains', value: 'ready' }],
                      },
                    }),
                  ],
                },
              }),
            ],
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: 1504,
        method: 'tools/call',
        params: { name: 'browser_get_orchestration', arguments: {} },
      },
    ]);

    const text = getResponseText(responses.find((message) => message.id === 1504));
    expect(text).toContain('status: completed_with_failures');
    expect(text).toContain('completedBlocks: 1');
    expect(text).toContain('failedCount: 1');
    expect(text).toContain('failure[0].sequenceStepIndex: 0');
  });

  it('still stops immediately when continueOnError is not enabled', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Strict Stop Page', currentUrl: 'https://example.com/strict-stop' }],
      [
        {
          jsonrpc: '2.0',
          id: 1505,
          method: 'tools/call',
          params: {
            name: 'browser_start_orchestration',
            arguments: {
              blocks: [
                createOrchestrationBlock({
                  type: 'assert_query',
                  args: {
                    query: { selector: '#missing', fields: ['exists'] },
                    assertions: [{ field: 'exists', op: 'equals', value: true }],
                  },
                }),
                createOrchestrationBlock({
                  type: 'assert_query',
                  continueOnError: true,
                  args: {
                    query: { selector: '#status', fields: ['innerText'] },
                    assertions: [{ field: 'innerText', op: 'contains', value: 'ready' }],
                  },
                }),
              ],
            },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 1505));
    expect(text).toContain('status: failed');
    expect(text).toContain('completedBlocks: 0');
  });

  it('continues to the next top-level block when a sequence block itself allows continueOnError', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Sequence Top-Level Policy Page',
        currentUrl: 'https://example.com/sequence-top-policy',
        query: {
          '#status': {
            exists: true,
            connected: true,
            innerText: 'ready state',
            textContent: 'ready state',
            display: 'block',
            visibility: 'visible',
            opacity: '1',
            rect: {
              x: 20,
              y: 80,
              width: 100,
              height: 40,
              top: 80,
              right: 120,
              bottom: 120,
              left: 20,
            },
          },
        },
      },
    ];

    const responses = await runMcpRequests(pages, [
      {
        jsonrpc: '2.0',
        id: 1506,
        method: 'tools/call',
        params: {
          name: 'browser_start_orchestration',
          arguments: {
            blocks: [
              createOrchestrationBlock({
                type: 'sequence',
                continueOnError: true,
                args: {
                  steps: [
                    createOrchestrationBlock({
                      type: 'assert_query',
                      args: {
                        query: { selector: '#missing', fields: ['exists'] },
                        assertions: [{ field: 'exists', op: 'equals', value: true }],
                      },
                    }),
                  ],
                },
              }),
              createOrchestrationBlock({
                type: 'assert_query',
                args: {
                  query: { selector: '#status', fields: ['innerText'] },
                  assertions: [{ field: 'innerText', op: 'contains', value: 'ready' }],
                },
              }),
            ],
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: 1507,
        method: 'tools/call',
        params: { name: 'browser_get_orchestration', arguments: {} },
      },
    ]);

    const text = getResponseText(responses.find((message) => message.id === 1507));
    expect(text).toContain('status: completed_with_failures');
    expect(text).toContain('completedBlocks: 2');
    expect(text).toContain('failedCount: 1');
    expect(text).toContain('failure[0].sequenceStepIndex: 0');
  });

  it('exports recording and replay artifacts and lists them', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Artifact Page',
          currentUrl: 'https://example.com/artifact',
          recording: {
            events: [
              {
                kind: 'click',
                selector: '#submit',
                timestamp: 1710000000000,
              },
            ],
          },
          click: {
            '#submit': {},
          },
          query: {
            '#submit': {
              exists: true,
              connected: true,
              rect: {
                x: 20,
                y: 30,
                width: 100,
                height: 40,
                top: 30,
                right: 120,
                bottom: 70,
                left: 20,
              },
              display: 'block',
              visibility: 'visible',
              opacity: '1',
            },
          },
        },
      ],
      [
        { jsonrpc: '2.0', id: 1601, method: 'tools/call', params: { name: 'browser_start_recording', arguments: {} } },
        { jsonrpc: '2.0', id: 1602, method: 'tools/call', params: { name: 'browser_stop_recording', arguments: {} } },
        {
          jsonrpc: '2.0',
          id: 1603,
          method: 'tools/call',
          params: { name: 'browser_export_artifact', arguments: { kind: 'recording', name: 'rec-smoke' } },
        },
        {
          jsonrpc: '2.0',
          id: 1604,
          method: 'tools/call',
          params: {
            name: 'browser_start_replay',
            arguments: {
              steps: [createReplayStep({ type: 'click', pageId: 'page-1', selector: '#submit', args: {} })],
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 1605,
          method: 'tools/call',
          params: { name: 'browser_export_artifact', arguments: { kind: 'replay', name: 'replay-smoke' } },
        },
        {
          jsonrpc: '2.0',
          id: 1606,
          method: 'tools/call',
          params: { name: 'browser_list_artifacts', arguments: {} },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 1603))).toContain('status: exported');
    expect(getResponseText(responses.find((message) => message.id === 1605))).toContain('status: exported');
    const listText = getResponseText(responses.find((message) => message.id === 1606));
    expect(listText).toContain('name: rec-smoke');
    expect(listText).toContain('name: replay-smoke');
  });

  it('imports and deletes orchestration artifacts', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Artifact Page',
          currentUrl: 'https://example.com/artifact',
          click: { '#submit': {} },
          wait: {
            selectorSnapshots: {
              '#submit': [
                [
                  {
                    exists: true,
                    rect: {
                      x: 20,
                      y: 30,
                      width: 100,
                      height: 40,
                      top: 30,
                      right: 120,
                      bottom: 70,
                      left: 20,
                    },
                    display: 'block',
                    visibility: 'visible',
                    opacity: '1',
                  },
                ],
              ],
            },
          },
          query: {
            '#status': {
              exists: true,
              connected: true,
              innerText: 'ready state',
              textContent: 'ready state',
              display: 'block',
              visibility: 'visible',
              opacity: '1',
              rect: {
                x: 20,
                y: 80,
                width: 100,
                height: 40,
                top: 80,
                right: 120,
                bottom: 120,
                left: 20,
              },
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 1607,
          method: 'tools/call',
          params: {
            name: 'browser_start_orchestration',
            arguments: {
              blocks: [
                createOrchestrationBlock({
                  type: 'assert_query',
                  args: {
                    query: { selector: '#status', fields: ['innerText'] },
                    assertions: [{ field: 'innerText', op: 'contains', value: 'ready' }],
                  },
                }),
              ],
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 1608,
          method: 'tools/call',
          params: { name: 'browser_export_artifact', arguments: { kind: 'orchestration', name: 'orc-smoke' } },
        },
        {
          jsonrpc: '2.0',
          id: 1609,
          method: 'tools/call',
          params: { name: 'browser_list_artifacts', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 1610,
          method: 'tools/call',
          params: { name: 'browser_import_artifact', arguments: { path: 'artifact:orc-smoke' } },
        },
        {
          jsonrpc: '2.0',
          id: 1611,
          method: 'tools/call',
          params: { name: 'browser_delete_artifact', arguments: { name: 'orc-smoke' } },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 1608))).toContain('status: exported');
    expect(getResponseText(responses.find((message) => message.id === 1610))).toContain('status: imported');
    expect(getResponseText(responses.find((message) => message.id === 1611))).toContain('status: deleted');
  });

  it('rejects duplicate export, invalid import payload, and missing artifact delete target', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-artifact-failures-'));
    try {
      const oversizedArtifactPath = join(tempDir, 'oversized-artifact.json');
      writeFileSync(oversizedArtifactPath, Buffer.alloc(5 * 1024 * 1024 + 1, 'a'));

      const responses = await runMcpRequests(
        [
          {
            id: 'page-1',
            title: 'Artifact Failure Page',
            currentUrl: 'https://example.com/artifact-failure',
            recording: {
              events: [{ kind: 'click', selector: '#submit', timestamp: 1710000000000 }],
            },
          },
        ],
        [
          { jsonrpc: '2.0', id: 1612, method: 'tools/call', params: { name: 'browser_start_recording', arguments: {} } },
          { jsonrpc: '2.0', id: 1613, method: 'tools/call', params: { name: 'browser_stop_recording', arguments: {} } },
          { jsonrpc: '2.0', id: 1614, method: 'tools/call', params: { name: 'browser_export_artifact', arguments: { kind: 'recording', name: 'dup-artifact' } } },
          { jsonrpc: '2.0', id: 1615, method: 'tools/call', params: { name: 'browser_export_artifact', arguments: { kind: 'recording', name: 'dup-artifact' } } },
          { jsonrpc: '2.0', id: 1616, method: 'tools/call', params: { name: 'browser_import_artifact', arguments: { path: 'artifact:invalid-json' } } },
          { jsonrpc: '2.0', id: 1617, method: 'tools/call', params: { name: 'browser_delete_artifact', arguments: { name: 'missing-artifact' } } },
          { jsonrpc: '2.0', id: 1618, method: 'tools/call', params: { name: 'browser_export_artifact', arguments: { kind: 'recording', name: '../escape' } } },
          { jsonrpc: '2.0', id: 1619, method: 'tools/call', params: { name: 'browser_import_artifact', arguments: { path: 'artifact:../escape' } } },
          { jsonrpc: '2.0', id: 1620, method: 'tools/call', params: { name: 'browser_import_artifact', arguments: { path: oversizedArtifactPath } } },
        ]
      );

      expect(getResponseText(responses.find((message) => message.id === 1615))).toContain('artifact already exists');
      expect(getResponseText(responses.find((message) => message.id === 1616))).toContain('artifact file not found');
      expect(getResponseText(responses.find((message) => message.id === 1617))).toContain('artifact not found');
      expect(getResponseText(responses.find((message) => message.id === 1618))).toContain(
        'artifact name must start with a letter or number'
      );
      expect(getResponseText(responses.find((message) => message.id === 1619))).toContain(
        'artifact name must start with a letter or number'
      );
      expect(getResponseText(responses.find((message) => message.id === 1620))).toContain(
        'artifact file exceeds maximum size'
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('runs select_page_then_run and executes the inner single-page block on the selected page', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Home',
          currentUrl: 'https://example.com/',
        },
        {
          id: 'page-2',
          title: 'Docs',
          currentUrl: 'https://example.com/docs',
          query: {
            '#status': {
              exists: true,
              connected: true,
              innerText: 'ready state',
              textContent: 'ready state',
              display: 'block',
              visibility: 'visible',
              opacity: '1',
              rect: {
                x: 20,
                y: 80,
                width: 100,
                height: 40,
                top: 80,
                right: 120,
                bottom: 120,
                left: 20,
              },
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 1701,
          method: 'tools/call',
          params: {
            name: 'browser_start_orchestration',
            arguments: {
              blocks: [
                createOrchestrationBlock({
                  type: 'select_page_then_run',
                  args: {
                    select: { pageIndex: 1 },
                    run: {
                      type: 'assert_query',
                      args: {
                        query: { selector: '#status', fields: ['innerText'] },
                        assertions: [{ field: 'innerText', op: 'contains', value: 'ready' }],
                      },
                    },
                  },
                }),
              ],
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 1701))).toContain('status: completed');
  });

  it('runs open_page_then_run and executes the inner block on the newly opened page', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 1702,
          method: 'tools/call',
          params: {
            name: 'browser_start_orchestration',
            arguments: {
              blocks: [
                createOrchestrationBlock({
                  type: 'open_page_then_run',
                  args: {
                    open: { url: 'https://example.com/docs' },
                    run: {
                      type: 'wait_for_then_press_key',
                      args: {
                        wait: { condition: { kind: 'text', includes: 'New page visible text' }, timeoutMs: 1000 },
                        pressKey: { key: 'Enter' },
                      },
                    },
                  },
                }),
              ],
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 1702))).toContain('status: completed');
  });

  it('runs close_page_then_continue and then continues with the remaining blocks', async () => {
    const responses = await runMcpRequests(
      [
        { id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' },
        {
          id: 'page-2',
          title: 'Docs',
          currentUrl: 'https://example.com/docs',
          query: {
            '#status': {
              exists: true,
              connected: true,
              innerText: 'ready state',
              textContent: 'ready state',
              display: 'block',
              visibility: 'visible',
              opacity: '1',
              rect: {
                x: 20,
                y: 80,
                width: 100,
                height: 40,
                top: 80,
                right: 120,
                bottom: 120,
                left: 20,
              },
            },
          },
        },
      ],
      [
        { jsonrpc: '2.0', id: 1703, method: 'tools/call', params: { name: 'browser_select_page', arguments: { pageId: 'page-2' } } },
        {
          jsonrpc: '2.0',
          id: 1704,
          method: 'tools/call',
          params: {
            name: 'browser_start_orchestration',
            arguments: {
              blocks: [
                createOrchestrationBlock({
                  type: 'close_page_then_continue',
                  args: { close: { pageId: 'page-2' } },
                }),
                createOrchestrationBlock({
                  type: 'select_page_then_run',
                  args: {
                    select: { pageIndex: 0 },
                    run: {
                      type: 'assert_query',
                      args: {
                        query: { selector: '#status', fields: ['innerText'] },
                        assertions: [{ field: 'innerText', op: 'contains', value: 'ready' }],
                      },
                    },
                  },
                  continueOnError: true,
                }),
              ],
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 1704))).toContain('completedBlocks: 2');
  });

  it('rejects missing run payloads and nested cross-page blocks', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 1705,
          method: 'tools/call',
          params: {
            name: 'browser_start_orchestration',
            arguments: {
              blocks: [createOrchestrationBlock({ type: 'select_page_then_run', args: { select: { pageIndex: 0 } } })],
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 1706,
          method: 'tools/call',
          params: {
            name: 'browser_start_orchestration',
            arguments: {
              blocks: [
                createOrchestrationBlock({
                  type: 'select_page_then_run',
                  args: {
                    select: { pageIndex: 0 },
                    run: createOrchestrationBlock({
                      type: 'open_page_then_run',
                      args: { open: { url: 'https://example.com' }, run: { type: 'assert_query', args: {} } },
                    }),
                  },
                }),
              ],
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 1705))).toContain('cross-page run block is required');
    expect(getResponseText(responses.find((message) => message.id === 1706))).toContain('nested cross-page blocks are not supported');
  });

  it('fails when select_page_then_run targets a missing page', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 1707,
          method: 'tools/call',
          params: {
            name: 'browser_start_orchestration',
            arguments: {
              blocks: [
                createOrchestrationBlock({
                  type: 'select_page_then_run',
                  args: {
                    select: { pageId: 'page-9' },
                    run: {
                      type: 'assert_query',
                      args: {
                        query: { selector: '#status', fields: ['innerText'] },
                        assertions: [{ field: 'innerText', op: 'contains', value: 'ready' }],
                      },
                    },
                  },
                }),
              ],
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 1708,
          method: 'tools/call',
          params: { name: 'browser_get_orchestration', arguments: {} },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 1708));
    expect(text).toContain('status: failed');
    expect(text).toContain('page not found: page-9');
  });

});
