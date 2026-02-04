/**
 * Schema Sanitizer Unit Tests
 *
 * Tests for MCP tool input_schema sanitization.
 */

import { describe, expect, test } from 'bun:test';
import { sanitizeInputSchema, sanitizeToolSchemas } from '../../../dist/cliproxy/schema-sanitizer';

describe('sanitizeInputSchema', () => {
  test('preserves valid JSON Schema properties', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The name' },
        age: { type: 'number', minimum: 0, maximum: 150 },
      },
      required: ['name'],
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(0);
    expect(result.removedPaths).toEqual([]);
    expect(result.schema).toEqual(schema);
  });

  test('removes non-standard properties at top level', () => {
    const schema = {
      type: 'object',
      cornerRadius: 8,
      fillColor: '#ffffff',
      properties: {
        name: { type: 'string' },
      },
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(2);
    expect(result.removedPaths).toContain('cornerRadius');
    expect(result.removedPaths).toContain('fillColor');
    expect(result.schema).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    });
  });

  test('removes non-standard properties from nested properties', () => {
    const schema = {
      type: 'object',
      properties: {
        style: {
          type: 'object',
          fontFamily: 'Arial',
          fontSize: 12,
          properties: {
            color: { type: 'string' },
          },
        },
      },
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(2);
    expect(result.removedPaths).toContain('properties.style.fontFamily');
    expect(result.removedPaths).toContain('properties.style.fontSize');
    expect(result.schema).toEqual({
      type: 'object',
      properties: {
        style: {
          type: 'object',
          properties: {
            color: { type: 'string' },
          },
        },
      },
    });
  });

  test('removes non-standard properties from array items', () => {
    const schema = {
      type: 'array',
      items: {
        type: 'object',
        gap: 10,
        padding: 20,
        properties: {
          id: { type: 'string' },
        },
      },
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(2);
    expect(result.removedPaths).toContain('items.gap');
    expect(result.removedPaths).toContain('items.padding');
    expect(result.schema).toEqual({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
    });
  });

  test('handles oneOf/anyOf/allOf with nested schemas', () => {
    const schema = {
      type: 'object',
      oneOf: [
        { type: 'string', customProp: 'remove' },
        { type: 'number', anotherCustom: 123 },
      ],
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(2);
    expect(result.schema).toEqual({
      type: 'object',
      oneOf: [{ type: 'string' }, { type: 'number' }],
    });
  });

  test('handles deeply nested structures', () => {
    const schema = {
      type: 'object',
      properties: {
        level1: {
          type: 'object',
          properties: {
            level2: {
              type: 'object',
              uiHint: 'remove-me',
              properties: {
                value: { type: 'string' },
              },
            },
          },
        },
      },
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(1);
    expect(result.removedPaths).toContain('properties.level1.properties.level2.uiHint');
  });

  test('preserves $defs and definitions', () => {
    const schema = {
      type: 'object',
      $defs: {
        address: {
          type: 'object',
          customUI: 'remove',
          properties: {
            street: { type: 'string' },
          },
        },
      },
      properties: {
        home: { $ref: '#/$defs/address' },
      },
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(1);
    expect(result.removedPaths).toContain('$defs.address.customUI');
    expect(result.schema).toEqual({
      type: 'object',
      $defs: {
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
          },
        },
      },
      properties: {
        home: { $ref: '#/$defs/address' },
      },
    });
  });

  test('handles empty schema', () => {
    const result = sanitizeInputSchema({});

    expect(result.removedCount).toBe(0);
    expect(result.schema).toEqual({});
  });

  test('preserves all standard metadata keywords', () => {
    const schema = {
      $id: 'https://example.com/schema',
      $schema: 'https://json-schema.org/draft-07/schema#',
      title: 'Test Schema',
      description: 'A test schema',
      type: 'string',
      examples: ['example1', 'example2'],
      deprecated: false,
      readOnly: true,
      $comment: 'Internal comment',
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(0);
    expect(result.schema).toEqual(schema);
  });
});

describe('sanitizeToolSchemas', () => {
  test('sanitizes multiple tools and tracks per-tool changes', () => {
    const tools = [
      {
        name: 'clean_tool',
        input_schema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
      },
      {
        name: 'figma_tool',
        input_schema: {
          type: 'object',
          cornerRadius: 8,
          fillColor: '#000',
          properties: { id: { type: 'string' } },
        },
      },
      {
        name: 'design_tool',
        input_schema: {
          type: 'object',
          fontWeight: 'bold',
          properties: { text: { type: 'string' } },
        },
      },
    ];

    const result = sanitizeToolSchemas(tools);

    expect(result.totalRemoved).toBe(3);
    expect(result.removedByTool).toHaveLength(2);
    expect(result.removedByTool[0].name).toBe('figma_tool');
    expect(result.removedByTool[0].removed).toContain('cornerRadius');
    expect(result.removedByTool[0].removed).toContain('fillColor');
    expect(result.removedByTool[1].name).toBe('design_tool');
    expect(result.removedByTool[1].removed).toContain('fontWeight');

    // Verify schemas are actually sanitized
    const figmaTool = result.tools.find((t) => t.name === 'figma_tool');
    expect(figmaTool?.input_schema).toEqual({
      type: 'object',
      properties: { id: { type: 'string' } },
    });
  });

  test('handles tools without input_schema', () => {
    const tools = [
      { name: 'simple_tool', description: 'No schema' },
      { name: 'another_tool' },
    ];

    const result = sanitizeToolSchemas(tools);

    expect(result.totalRemoved).toBe(0);
    expect(result.removedByTool).toHaveLength(0);
    expect(result.tools).toEqual(tools);
  });

  test('returns unmodified tools when all schemas are valid', () => {
    const tools = [
      {
        name: 'valid_tool',
        input_schema: {
          type: 'object',
          properties: { value: { type: 'number', minimum: 0 } },
          required: ['value'],
        },
      },
    ];

    const result = sanitizeToolSchemas(tools);

    expect(result.totalRemoved).toBe(0);
    expect(result.removedByTool).toHaveLength(0);
  });
});
