/**
 * Tool Sanitization Proxy SSE Stream Processor & Empty-Response Guard
 */

import * as http from 'http';
import type { Logger } from '../../../services/logging';
import { ToolNameMapper, type ContentBlock } from '../../ai-providers/tool-name-mapper';
import { hasEncodedBody } from '../content-encoding';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Process a single SSE event, restoring tool names if present.
 */
export function processSSEEvent(event: string, mapper: ToolNameMapper): string {
  const lines = event.split('\n');
  const processedLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const jsonStr = line.slice(6);

      if (jsonStr.trim() === '[DONE]') {
        processedLines.push(line);
        continue;
      }

      try {
        const data = JSON.parse(jsonStr);

        if (
          isRecord(data) &&
          data.type === 'content_block_start' &&
          isRecord(data.content_block) &&
          data.content_block.type === 'tool_use' &&
          typeof data.content_block.name === 'string'
        ) {
          const originalName = mapper.restoreName(data.content_block.name);
          data.content_block.name = originalName;
          processedLines.push('data: ' + JSON.stringify(data));
          continue;
        }

        if (isRecord(data) && Array.isArray(data.content)) {
          data.content = mapper.restoreToolUse(data.content as ContentBlock[]);
          processedLines.push('data: ' + JSON.stringify(data));
          continue;
        }

        processedLines.push(line);
      } catch {
        processedLines.push(line);
      }
    } else {
      processedLines.push(line);
    }
  }

  return processedLines.join('\n');
}

/**
 * Build a synthetic minimal SSE response when upstream returns empty content.
 */
export function buildSyntheticErrorResponse(
  upstreamSentMessageStart = false,
  upstreamSentMessageDelta = false,
  upstreamSentMessageStop = false
): string {
  const events: string[] = [];

  if (!upstreamSentMessageStart) {
    const msgId = `msg_synthetic_${Date.now()}`;
    events.push(
      `event: message_start\ndata: {"type":"message_start","message":{"id":"${msgId}","type":"message","role":"assistant","content":[],"model":"unknown","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":0,"output_tokens":0}}}`
    );
  }

  events.push(
    `event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
    `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"[Proxy Error] The upstream API returned an empty response. This typically occurs when the proxy drops unsigned thinking blocks during sub-agent execution. Please retry the request."}}`,
    `event: content_block_stop\ndata: {"type":"content_block_stop","index":0}`
  );

  if (!upstreamSentMessageDelta) {
    events.push(
      `event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":0,"output_tokens":0}}`
    );
  }

  if (!upstreamSentMessageStop) {
    events.push(`event: message_stop\ndata: {"type":"message_stop"}`);
  }

  return events.join('\n\n') + '\n\n';
}

export function warnEncodedPassthrough(logger: Logger, headers: http.IncomingHttpHeaders): void {
  logger.warn(
    'tool-sanitization.proxy.encoded-passthrough',
    'Upstream compressed the response despite Accept-Encoding: identity. Passing it through without tool-name restoration or the empty-response safety net.',
    { contentEncoding: headers['content-encoding'] }
  );
}

export function pipeStreamingSseResponse(params: {
  upstreamRes: http.IncomingMessage;
  clientRes: http.ServerResponse;
  mapper: ToolNameMapper;
  logger: Logger;
  isSettled: () => boolean;
  settleResolve: () => void;
  settleReject: (err: unknown) => void;
}): void {
  const { upstreamRes, clientRes, mapper, logger, isSettled, settleResolve, settleReject } = params;

  if (hasEncodedBody(upstreamRes.headers)) {
    warnEncodedPassthrough(logger, upstreamRes.headers);
    upstreamRes.on('data', (chunk: Buffer) => {
      if (isSettled()) return;
      const canContinue = clientRes.write(chunk);
      if (!canContinue) {
        upstreamRes.pause();
        clientRes.once('drain', () => upstreamRes.resume());
      }
    });
    upstreamRes.on('end', () => {
      clientRes.end();
      settleResolve();
    });
    upstreamRes.on('error', (error) => settleReject(error));
    return;
  }

  const lifecycle = {
    hasContent: false,
    hasData: false,
    hasMessageStart: false,
    hasMessageDelta: false,
    hasMessageStop: false,
    update(text: string) {
      if (text.includes('"content_block_start"')) this.hasContent = true;
      if (text.includes('"message_start"')) this.hasMessageStart = true;
      if (text.includes('"message_delta"')) this.hasMessageDelta = true;
      if (text.includes('"message_stop"')) this.hasMessageStop = true;
    },
  };
  const isSuccessResponse =
    (upstreamRes.statusCode || 200) >= 200 && (upstreamRes.statusCode || 200) < 300;

  const injectSyntheticIfEmpty = () => {
    if (!lifecycle.hasContent && isSuccessResponse && lifecycle.hasData) {
      logger.warn(
        'tool-sanitization.proxy.empty-response',
        'Empty response detected from upstream (no content blocks). Injecting synthetic response to prevent client crash.'
      );
      clientRes.write(
        buildSyntheticErrorResponse(
          lifecycle.hasMessageStart,
          lifecycle.hasMessageDelta,
          lifecycle.hasMessageStop
        )
      );
    }
  };

  if (!mapper.hasChanges()) {
    upstreamRes.on('data', (chunk: Buffer) => {
      if (isSettled()) return;
      lifecycle.hasData = true;
      lifecycle.update(chunk.toString('utf8'));
      const canContinue = clientRes.write(chunk);
      if (!canContinue) {
        upstreamRes.pause();
        clientRes.once('drain', () => upstreamRes.resume());
      }
    });
    upstreamRes.on('end', () => {
      if (isSettled()) return;
      try {
        injectSyntheticIfEmpty();
        clientRes.end();
      } catch {
        // Client may have disconnected — safe to ignore
      }
      settleResolve();
    });
    upstreamRes.on('error', (error) => settleReject(error));
    return;
  }

  let buffer = '';

  upstreamRes.on('data', (chunk: Buffer) => {
    if (isSettled()) return;
    lifecycle.hasData = true;
    buffer += chunk.toString('utf8');

    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      if (!event.trim()) continue;
      lifecycle.update(event);
      clientRes.write(processSSEEvent(event, mapper) + '\n\n');
    }
  });

  upstreamRes.on('end', () => {
    if (isSettled()) return;
    try {
      if (buffer.trim()) {
        lifecycle.update(buffer);
        clientRes.write(processSSEEvent(buffer, mapper) + '\n\n');
      }
      injectSyntheticIfEmpty();
      clientRes.end();
    } catch {
      // Client may have disconnected — safe to ignore
    }
    settleResolve();
  });

  upstreamRes.on('error', (error) => settleReject(error));
}
