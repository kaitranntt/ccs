#!/usr/bin/env node

/**
 * SSEParser - Parse Server-Sent Events (SSE) stream
 *
 * Handles:
 * - Incomplete events across chunks
 * - Multiple events in single chunk
 * - Malformed data (skip gracefully)
 * - [DONE] marker
 *
 * Usage:
 *   const parser = new SSEParser();
 *   stream.on('data', chunk => {
 *     const events = parser.parse(chunk);
 *     events.forEach(event => { ... });
 *   });
 */

import { createLogger } from '../services/logging';

interface SSEParserOptions {
  maxBufferSize?: number;
  throwOnMalformedJson?: boolean;
}

interface SSEEvent {
  event: string;
  data: unknown;
  index?: number;
  id?: string;
  retry?: number;
}

export class SSEParser {
  private buffer: string;
  private eventCount: number;
  private maxBufferSize: number;
  private throwOnMalformedJson: boolean;
  private pendingCR: boolean;
  private readonly logger = createLogger('glmt:sse-parser');

  constructor(options: SSEParserOptions = {}) {
    this.buffer = '';
    this.eventCount = 0;
    this.maxBufferSize = options.maxBufferSize || 1024 * 1024; // 1MB default
    this.throwOnMalformedJson = options.throwOnMalformedJson === true;
    this.pendingCR = false;
  }

  /**
   * Parse chunk and extract SSE events
   * @param chunk - Data chunk from stream
   * @returns Array of parsed events
   */
  parse(chunk: Buffer | string): SSEEvent[] {
    let normalizedChunk = chunk.toString();

    if (this.pendingCR) {
      if (normalizedChunk.startsWith('\n')) {
        normalizedChunk = normalizedChunk.slice(1);
      }
      this.pendingCR = false;
    }

    const endsWithCR = normalizedChunk.endsWith('\r');
    normalizedChunk = normalizedChunk.replace(/\r\n?/g, '\n');
    this.pendingCR = endsWithCR;
    this.buffer += normalizedChunk;

    // C-01 Fix: Prevent unbounded buffer growth (DoS protection)
    if (this.buffer.length > this.maxBufferSize) {
      throw new Error(`SSE buffer exceeded ${this.maxBufferSize} bytes (DoS protection)`);
    }

    const events: SSEEvent[] = [];
    const segments = this.buffer.split('\n\n');
    this.buffer = segments.pop() || '';

    for (const segment of segments) {
      const lines = segment.split('\n');
      const currentEvent: SSEEvent = { event: 'message', data: '' };
      const dataLines: string[] = [];

      for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        if (!line || line.startsWith(':')) {
          continue;
        }
        if (line.startsWith('event: ')) {
          currentEvent.event = line.substring(7).trim();
          continue;
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.substring(5).trimStart());
          continue;
        }
        if (line.startsWith('id: ')) {
          currentEvent.id = line.substring(4).trim();
          continue;
        }
        if (line.startsWith('retry: ')) {
          currentEvent.retry = parseInt(line.substring(7), 10);
        }
      }

      const data = dataLines.join('\n');
      if (!data) {
        continue;
      }

      if (data === '[DONE]') {
        this.eventCount++;
        events.push({ event: 'done', data: null, index: this.eventCount });
        continue;
      }

      try {
        currentEvent.data = JSON.parse(data);
        this.eventCount++;
        currentEvent.index = this.eventCount;
        events.push({ ...currentEvent });
      } catch (e) {
        this.logger.warn('sse.malformed_json', 'Malformed JSON event in SSE stream', {
          err: e instanceof Error ? { name: e.name, message: e.message } : { message: String(e) },
          dataPreview: data.substring(0, 100),
          eventIndex: this.eventCount,
        });
        if (this.throwOnMalformedJson) {
          throw new Error(`Malformed SSE JSON event: ${(e as Error).message}`);
        }
      }
    }

    return events;
  }

  /**
   * Reset parser state (for reuse)
   */
  reset(): void {
    this.buffer = '';
    this.eventCount = 0;
    this.pendingCR = false;
  }
}
