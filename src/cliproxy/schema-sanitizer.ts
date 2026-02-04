/**
 * Schema Sanitizer
 *
 * Sanitizes MCP tool input_schema to remove non-standard JSON Schema properties
 * that Gemini/Vertex APIs reject.
 *
 * MCP servers (especially design tools) include UI-specific metadata in schemas:
 * - cornerRadius, fillColor, fontFamily, fontSize, fontWeight, gap, padding, etc.
 *
 * These are valid as MCP hints but invalid for strict JSON Schema validation.
 */

/** Valid JSON Schema Draft-07 keywords (used by Anthropic/Gemini APIs) */
const VALID_JSON_SCHEMA_KEYWORDS = new Set([
  // Core
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'const',
  'default',

  // String validation
  'minLength',
  'maxLength',
  'pattern',
  'format',

  // Number validation
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',

  // Array validation
  'minItems',
  'maxItems',
  'uniqueItems',
  'contains',
  'additionalItems',

  // Object validation
  'additionalProperties',
  'patternProperties',
  'minProperties',
  'maxProperties',
  'propertyNames',
  'dependencies',

  // Composition
  'oneOf',
  'anyOf',
  'allOf',
  'not',
  'if',
  'then',
  'else',

  // Metadata (allowed by most APIs)
  'title',
  'description',
  '$id',
  '$schema',
  '$ref',
  '$defs',
  'definitions',
  '$comment',
  'examples',
  'readOnly',
  'writeOnly',
  'deprecated',
  'contentMediaType',
  'contentEncoding',
]);

export interface SchemaSanitizationResult {
  /** The sanitized schema */
  schema: Record<string, unknown>;
  /** Number of properties removed */
  removedCount: number;
  /** List of removed property paths for logging */
  removedPaths: string[];
}

/**
 * Check if a key is a valid JSON Schema keyword.
 */
function isValidSchemaKey(key: string): boolean {
  return VALID_JSON_SCHEMA_KEYWORDS.has(key);
}

/**
 * Recursively sanitize a JSON Schema object.
 * Removes non-standard properties while preserving valid schema structure.
 *
 * @param schema The schema object to sanitize
 * @param path Current path for logging (e.g., "properties.foo.items")
 * @param removedPaths Accumulator for removed property paths
 * @returns Sanitized schema object
 */
function sanitizeSchemaRecursive(schema: unknown, path: string, removedPaths: string[]): unknown {
  // Handle non-objects (primitives, null)
  if (typeof schema !== 'object' || schema === null) {
    return schema;
  }

  // Handle arrays
  if (Array.isArray(schema)) {
    return schema.map((item, index) =>
      sanitizeSchemaRecursive(item, `${path}[${index}]`, removedPaths)
    );
  }

  // Handle objects
  const result: Record<string, unknown> = {};
  const obj = schema as Record<string, unknown>;

  for (const [key, value] of Object.entries(obj)) {
    const keyPath = path ? `${path}.${key}` : key;

    // Special handling for nested schema containers
    if (key === 'properties' && typeof value === 'object' && value !== null) {
      // Recurse into each property definition
      const sanitizedProps: Record<string, unknown> = {};
      for (const [propName, propSchema] of Object.entries(value as Record<string, unknown>)) {
        sanitizedProps[propName] = sanitizeSchemaRecursive(
          propSchema,
          `${keyPath}.${propName}`,
          removedPaths
        );
      }
      result[key] = sanitizedProps;
      continue;
    }

    if (key === 'items') {
      // items can be object or array of objects
      result[key] = sanitizeSchemaRecursive(value, keyPath, removedPaths);
      continue;
    }

    if (key === 'additionalProperties' && typeof value === 'object') {
      // Can be boolean or schema object
      result[key] = sanitizeSchemaRecursive(value, keyPath, removedPaths);
      continue;
    }

    // Composition keywords contain schema arrays
    if (['oneOf', 'anyOf', 'allOf'].includes(key) && Array.isArray(value)) {
      result[key] = value.map((item, index) =>
        sanitizeSchemaRecursive(item, `${keyPath}[${index}]`, removedPaths)
      );
      continue;
    }

    if (key === 'not' && typeof value === 'object') {
      result[key] = sanitizeSchemaRecursive(value, keyPath, removedPaths);
      continue;
    }

    // Conditional keywords
    if (['if', 'then', 'else'].includes(key) && typeof value === 'object') {
      result[key] = sanitizeSchemaRecursive(value, keyPath, removedPaths);
      continue;
    }

    if (key === '$defs' || key === 'definitions') {
      // Definition containers
      if (typeof value === 'object' && value !== null) {
        const sanitizedDefs: Record<string, unknown> = {};
        for (const [defName, defSchema] of Object.entries(value as Record<string, unknown>)) {
          sanitizedDefs[defName] = sanitizeSchemaRecursive(
            defSchema,
            `${keyPath}.${defName}`,
            removedPaths
          );
        }
        result[key] = sanitizedDefs;
        continue;
      }
    }

    // Check if this is a valid JSON Schema keyword
    if (isValidSchemaKey(key)) {
      // Recurse for nested objects that might contain schemas
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = sanitizeSchemaRecursive(value, keyPath, removedPaths);
      } else {
        result[key] = value;
      }
    } else {
      // Non-standard property - remove it
      removedPaths.push(keyPath);
    }
  }

  return result;
}

/**
 * Sanitize an input_schema object, removing non-standard JSON Schema properties.
 *
 * @param inputSchema The tool's input_schema object
 * @returns Sanitization result with cleaned schema and metadata
 */
export function sanitizeInputSchema(
  inputSchema: Record<string, unknown>
): SchemaSanitizationResult {
  const removedPaths: string[] = [];

  const sanitized = sanitizeSchemaRecursive(inputSchema, '', removedPaths) as Record<
    string,
    unknown
  >;

  return {
    schema: sanitized,
    removedCount: removedPaths.length,
    removedPaths,
  };
}

/**
 * Sanitize an array of tools, cleaning their input_schema properties.
 *
 * @param tools Array of tool definitions
 * @returns Object with sanitized tools and total removed count
 */
export function sanitizeToolSchemas(
  tools: Array<{ name: string; input_schema?: Record<string, unknown>; [key: string]: unknown }>
): {
  tools: typeof tools;
  totalRemoved: number;
  removedByTool: Array<{ name: string; removed: string[] }>;
} {
  const removedByTool: Array<{ name: string; removed: string[] }> = [];
  let totalRemoved = 0;

  const sanitizedTools = tools.map((tool) => {
    if (!tool.input_schema || typeof tool.input_schema !== 'object') {
      return tool;
    }

    const result = sanitizeInputSchema(tool.input_schema);

    if (result.removedCount > 0) {
      removedByTool.push({
        name: tool.name,
        removed: result.removedPaths,
      });
      totalRemoved += result.removedCount;
    }

    return {
      ...tool,
      input_schema: result.schema,
    };
  });

  return {
    tools: sanitizedTools,
    totalRemoved,
    removedByTool,
  };
}
