const assert = require('assert');

const {
  buildCodexModelEffortMap,
  getEffortForModel,
  injectReasoningEffortIntoBody,
  normalizeCodexEffortForModel,
} = require('../../../../dist/cliproxy/ai-providers/codex-reasoning-proxy');

describe('Codex Reasoning Proxy', () => {
  describe('buildCodexModelEffortMap', () => {
    it('maps tier models to expected efforts', () => {
      const map = buildCodexModelEffortMap({
        defaultModel: 'gpt-5.2-codex',
        opusModel: 'gpt-5.2-codex',
        sonnetModel: 'gpt-5.2-codex-high',
        haikuModel: 'gpt-5.2-codex-mini',
      });

      assert.strictEqual(map.get('gpt-5.2-codex'), 'xhigh');
      assert.strictEqual(map.get('gpt-5.2-codex-high'), 'high');
      assert.strictEqual(map.get('gpt-5.2-codex-mini'), 'medium');
    });

    it('uses the lowest effort when the same model appears in multiple tiers', () => {
      const map = buildCodexModelEffortMap({
        opusModel: 'same',
        sonnetModel: 'same',
        haikuModel: 'same',
      });

      assert.strictEqual(map.get('same'), 'medium');
    });

    it('returns empty map when all models undefined', () => {
      const map = buildCodexModelEffortMap({});
      assert.strictEqual(map.size, 0);
    });

    it('ignores empty string models', () => {
      const map = buildCodexModelEffortMap({ defaultModel: '', opusModel: '  ' });
      assert.strictEqual(map.size, 0);
    });
  });

  describe('getEffortForModel', () => {
    it('defaults to medium for unknown model', () => {
      const map = buildCodexModelEffortMap({ opusModel: 'm1' });
      assert.strictEqual(getEffortForModel('unknown', map, 'medium'), 'medium');
    });

    it('handles null model', () => {
      const map = buildCodexModelEffortMap({ opusModel: 'm1' });
      assert.strictEqual(getEffortForModel(null, map, 'high'), 'high');
    });
  });

  describe('injectReasoningEffortIntoBody', () => {
    it('overrides reasoning.effort on object bodies', () => {
      const out = injectReasoningEffortIntoBody(
        { model: 'm1', reasoning: { effort: 'xhigh' } },
        'high'
      );
      assert.deepStrictEqual(out, { model: 'm1', reasoning: { effort: 'high' } });
    });

    it('leaves non-object bodies unchanged', () => {
      assert.strictEqual(injectReasoningEffortIntoBody('x', 'medium'), 'x');
    });

    it('leaves array bodies unchanged (not treated as record)', () => {
      const arr = [1, 2, 3];
      assert.deepStrictEqual(injectReasoningEffortIntoBody(arr, 'high'), arr);
    });
  });

  describe('model suffix aliasing', () => {
    it('lets callers use model-id suffixes without changing upstream model ids', () => {
      // We can't call the full proxy in unit tests, but we can validate the intent:
      // - injected effort is based on the suffix
      // - callers should set request.model to the base model upstream (proxy does this)
      const out = injectReasoningEffortIntoBody(
        { model: 'gpt-5.2-codex', reasoning: { effort: 'medium' } },
        'xhigh'
      );
      assert.deepStrictEqual(out, {
        model: 'gpt-5.2-codex',
        reasoning: { effort: 'xhigh' },
      });
      const outMax = injectReasoningEffortIntoBody(
        { model: 'gpt-6-astra', reasoning: { effort: 'low' } },
        'max'
      );
      assert.deepStrictEqual(outMax, {
        model: 'gpt-6-astra',
        reasoning: { effort: 'max' },
      });
    });
  });

  describe('stripPathPrefix (remote mode)', () => {
    // Tests the path prefix stripping logic used in remote proxy mode
    // Remote CLIProxyAPI expects /v1/messages, but Claude sends /api/provider/codex/v1/messages

    /**
     * Updated to match the version in codex-reasoning-proxy.ts with boundary check.
     * Only strips if prefix matches a complete path segment (not partial like /codex matching /codextra)
     */
    function stripPathPrefix(path, prefix) {
      if (
        prefix &&
        path.startsWith(prefix) &&
        (path.length === prefix.length || path[prefix.length] === '/')
      ) {
        let stripped = path.slice(prefix.length);
        // Normalize: collapse any leading slashes to single slash and ensure path starts with '/'
        stripped = stripped.replace(/^\/+/, '/') || '/';
        if (!stripped.startsWith('/')) {
          stripped = '/' + stripped;
        }
        return stripped;
      }
      return path;
    }

    it('strips /api/provider/codex prefix for remote mode', () => {
      const result = stripPathPrefix('/api/provider/codex/v1/messages', '/api/provider/codex');
      assert.strictEqual(result, '/v1/messages');
    });

    it('returns root path when prefix equals full path', () => {
      const result = stripPathPrefix('/api/provider/codex', '/api/provider/codex');
      assert.strictEqual(result, '/');
    });

    it('leaves path unchanged when prefix is undefined', () => {
      const result = stripPathPrefix('/v1/messages', undefined);
      assert.strictEqual(result, '/v1/messages');
    });

    it('leaves path unchanged when prefix does not match', () => {
      const result = stripPathPrefix('/v1/messages', '/api/provider/codex');
      assert.strictEqual(result, '/v1/messages');
    });

    it('handles empty prefix', () => {
      const result = stripPathPrefix('/v1/messages', '');
      assert.strictEqual(result, '/v1/messages');
    });

    it('handles various provider prefixes', () => {
      // Gemini
      assert.strictEqual(
        stripPathPrefix('/api/provider/gemini/v1/chat', '/api/provider/gemini'),
        '/v1/chat'
      );
      // Agy
      assert.strictEqual(
        stripPathPrefix('/api/provider/agy/v1/messages', '/api/provider/agy'),
        '/v1/messages'
      );
    });

    it('preserves query strings after stripping', () => {
      const result = stripPathPrefix(
        '/api/provider/codex/v1/messages?stream=true',
        '/api/provider/codex'
      );
      assert.strictEqual(result, '/v1/messages?stream=true');
    });

    // Edge cases for path normalization
    it('collapses double slashes after stripping', () => {
      // e.g., '/api/provider/codex//v1/messages' → '/v1/messages'
      const result = stripPathPrefix('/api/provider/codex//v1/messages', '/api/provider/codex');
      assert.strictEqual(result, '/v1/messages');
    });

    it('handles multiple leading slashes after stripping', () => {
      // e.g., '/api/provider/codex///v1' → '/v1'
      const result = stripPathPrefix('/api/provider/codex///v1', '/api/provider/codex');
      assert.strictEqual(result, '/v1');
    });

    it('adds leading slash if missing after strip', () => {
      const result = stripPathPrefix('/prefix/suffix', '/prefix');
      assert.strictEqual(result, '/suffix');
    });

    // Boundary check tests - prevent partial segment matching
    it('does NOT strip partial path segment matches', () => {
      // /codex should NOT match /codextra
      const result = stripPathPrefix('/api/provider/codextra/v1/messages', '/api/provider/codex');
      assert.strictEqual(result, '/api/provider/codextra/v1/messages');
    });

    it('does NOT strip when prefix matches but next char is not slash', () => {
      // /api should NOT match /api-v2
      const result = stripPathPrefix('/api-v2/messages', '/api');
      assert.strictEqual(result, '/api-v2/messages');
    });

    it('strips when prefix matches exactly with slash boundary', () => {
      // /api/provider/codex should match /api/provider/codex/v1
      const result = stripPathPrefix('/api/provider/codex/v1', '/api/provider/codex');
      assert.strictEqual(result, '/v1');
    });
  });
  describe('normalizeCodexEffortForModel', () => {
    it('clamps unsupported lower efforts up to low for gpt-6.1-sol', () => {
      assert.strictEqual(normalizeCodexEffortForModel('gpt-6.1-sol', 'none'), 'low');
      assert.strictEqual(normalizeCodexEffortForModel('gpt-6.1-sol', 'minimal'), 'low');
      assert.strictEqual(normalizeCodexEffortForModel('gpt-6.1-sol', 'medium'), 'medium');
      assert.strictEqual(normalizeCodexEffortForModel('gpt-6.1-sol', 'max'), 'max');
    });

    it('preserves none for gpt-6-sol and gpt-6-luna', () => {
      assert.strictEqual(normalizeCodexEffortForModel('gpt-6-sol', 'none'), 'none');
      assert.strictEqual(normalizeCodexEffortForModel('gpt-6-sol', 'max'), 'max');
      assert.strictEqual(normalizeCodexEffortForModel('gpt-6-luna', 'none'), 'none');
      assert.strictEqual(normalizeCodexEffortForModel('gpt-6-luna', 'max'), 'max');
    });

    it('clamps unsupported max effort down to xhigh for models capped at xhigh', () => {
      assert.strictEqual(normalizeCodexEffortForModel('gpt-5.4', 'max'), 'xhigh');
      assert.strictEqual(normalizeCodexEffortForModel('gpt-5.5', 'max'), 'xhigh');
    });
    it('preserves minimal effort for gpt-6-astra and existing GPT-5 models', () => {
      assert.strictEqual(normalizeCodexEffortForModel('gpt-6-astra', 'minimal'), 'minimal');
      assert.strictEqual(normalizeCodexEffortForModel('gpt-5.5', 'minimal'), 'minimal');
    });
  });
});
