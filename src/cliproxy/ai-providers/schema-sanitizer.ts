/**
 * Schema Sanitizer
 *
 * Sanitizes tool input_schema to only include fields supported by Google's
 * Gemini/Vertex AI function_declarations Schema object.
 *
 * This sanitizer runs exclusively in the CLIProxy execution path (Gemini, Codex,
 * Antigravity, etc.), never for direct Anthropic API requests. Single-provider
 * Claude profiles also reach Anthropic through CLIProxy, so they skip it (see
 * `sanitizeSchemas` in proxy-chain-builder).
 *
 * Gemini supports a subset of OpenAPI 3.0 schema — fields outside this subset
 * (like "examples", "$ref", "oneOf", etc.) cause 400 errors.
 *
 * Reference: https://ai.google.dev/api/rest/v1beta/cachedContents#Schema
 */

/**
 * Fields supported by Gemini's function_declarations Schema object.
 * Source: https://ai.google.dev/api/rest/v1beta/cachedContents#Schema
 */
const GEMINI_SUPPORTED_SCHEMA_FIELDS = new Set([
  // Core
  'type',
  'format',
  'title',
  'description',
  'nullable',
  'example',
  'default',

  // Enum
  'enum',

  // Object
  'properties',
  'required',
  'minProperties',
  'maxProperties',

  // Array
  'items',
  'minItems',
  'maxItems',

  // String validation
  'minLength',
  'maxLength',
  'pattern',

  // Number validation
  'minimum',
  'maximum',

  // Composition (only anyOf supported, NOT oneOf/allOf/not)
  'anyOf',

  // Gemini-specific (non-standard OpenAPI)
  'propertyOrdering',
]);

/** Maximum recursion depth to prevent stack overflow */
const MAX_DEPTH = 100;

export interface SchemaSanitizationResult {
  /** The sanitized schema */
  schema: Record<string, unknown>;
  /** Number of properties removed */
  removedCount: number;
  /** List of removed property paths for logging */
  removedPaths: string[];
}

/**
 * Check if a key is supported by Gemini's Schema object.
 */
function isValidSchemaKey(key: string): boolean {
  return GEMINI_SUPPORTED_SCHEMA_FIELDS.has(key);
}

/**
 * Recursively sanitize a JSON Schema object.
 * Removes fields unsupported by Gemini while preserving valid schema structure.
 *
 * @param schema The schema object to sanitize
 * @param path Current path for logging (e.g., "properties.foo.items")
 * @param removedPaths Accumulator for removed property paths
 * @param visited WeakSet to track visited objects and prevent circular references
 * @param depth Current recursion depth to prevent stack overflow
 * @returns Sanitized schema object
 */
function sanitizeSchemaRecursive(
  schema: unknown,
  path: string,
  removedPaths: string[],
  visited: WeakSet<object> = new WeakSet(),
  depth: number = 0
): unknown {
  // Guard: prevent stack overflow from deep nesting
  if (depth > MAX_DEPTH) {
    return schema;
  }

  // Handle non-objects (primitives, null)
  if (typeof schema !== 'object' || schema === null) {
    return schema;
  }

  // Guard: prevent infinite recursion from circular references
  if (visited.has(schema)) {
    return schema;
  }

  // Mark object as visited
  visited.add(schema);

  // Handle arrays
  if (Array.isArray(schema)) {
    return schema.map((item, index) =>
      sanitizeSchemaRecursive(item, `${path}[${index}]`, removedPaths, visited, depth + 1)
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
          removedPaths,
          visited,
          depth + 1
        );
      }
      result[key] = sanitizedProps;
      continue;
    }

    if (key === 'items') {
      // items can be object or array of objects
      result[key] = sanitizeSchemaRecursive(value, keyPath, removedPaths, visited, depth + 1);
      continue;
    }

    // anyOf is the only composition keyword Gemini supports
    if (key === 'anyOf' && Array.isArray(value)) {
      result[key] = value.map((item, index) =>
        sanitizeSchemaRecursive(item, `${keyPath}[${index}]`, removedPaths, visited, depth + 1)
      );
      continue;
    }

    // Check if this is a Gemini-supported field
    if (isValidSchemaKey(key)) {
      // "example" and "default" hold arbitrary values, not nested schemas — pass through as-is
      if (key === 'example' || key === 'default') {
        result[key] = value;
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Recurse for nested objects that might contain schemas
        result[key] = sanitizeSchemaRecursive(value, keyPath, removedPaths, visited, depth + 1);
      } else {
        result[key] = value;
      }
    } else {
      // Unsupported field — remove it
      removedPaths.push(keyPath);
    }
  }

  return result;
}

/**
 * Sanitize an input_schema object, removing fields unsupported by Gemini.
 *
 * @param inputSchema The tool's input_schema object
 * @returns Sanitization result with cleaned schema and metadata
 */
export function sanitizeInputSchema(
  inputSchema: Record<string, unknown> | null | undefined
): SchemaSanitizationResult {
  // Preserve null/undefined as-is (graceful handling of missing schemas)
  if (inputSchema === null || inputSchema === undefined) {
    return {
      schema: inputSchema as unknown as Record<string, unknown>,
      removedCount: 0,
      removedPaths: [],
    };
  }

  // Non-object types (arrays, primitives) - return empty object
  if (typeof inputSchema !== 'object' || Array.isArray(inputSchema)) {
    return { schema: {}, removedCount: 0, removedPaths: [] };
  }

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
    // Guard against non-object elements
    if (typeof tool !== 'object' || tool === null) {
      return tool;
    }
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
