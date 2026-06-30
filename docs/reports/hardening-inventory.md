# Hardening Inventory Report

Scope: `src/**/*.{ts,tsx,js,jsx,mjs,cjs}`

## Summary

| Metric | Value |
|---|---:|
| Sync fs occurrences (all) | 2301 |
| Sync fs files affected (all) | 247 |
| Sync fs occurrences (runtime hotpaths) | 1946 |
| Sync fs files affected (runtime hotpaths) | 197 |
| Legacy shim markers | 427 |
| Legacy shim files affected | 164 |

## Top Runtime Hotpath Sync fs Files

| File | Sync Calls | API Names |
|---|---:|---|
| `src/cliproxy/__tests__/pool-routing-phase3.test.ts` | 96 | existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync |
| `src/cliproxy/config/__tests__/config-generator.test.js` | 88 | existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync |
| `src/cliproxy/config/__tests__/claude-model-neutral.test.ts` | 63 | existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync |
| `src/cliproxy/accounts/__tests__/account-safety-quota-exhaustion.test.ts` | 48 | existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync |
| `src/cliproxy/accounts/__tests__/account-registry-integrity.test.ts` | 45 | existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync |
| `src/cliproxy/executor/__tests__/variant-port-integration.test.js` | 36 | existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync |
| `src/cliproxy/executor/__tests__/composite-variant-service.test.ts` | 33 | existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync |
| `src/cliproxy/executor/__tests__/variant-port-edge-cases.test.js` | 33 | existsSync, mkdirSync, readdirSync, rmSync, unlinkSync, writeFileSync |
| `src/utils/browser/mcp-installer.ts` | 32 | chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync |
| `src/cliproxy/__tests__/session-tracker-port.test.js` | 31 | existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync |

## Top Legacy Shim Marker Files

| File | Marker Count |
|---|---:|
| `src/auth/profile-detector.ts` | 18 |
| `src/utils/config-manager.ts` | 13 |
| `src/cliproxy/__tests__/pool-onboarding-phase5.test.ts` | 12 |
| `src/cliproxy/executor/__tests__/variant-port-allocation.test.js` | 12 |
| `src/config/schemas/websearch.ts` | 10 |
| `src/commands/cursor-command-display.ts` | 9 |
| `src/config/migration-manager.ts` | 9 |
| `src/cliproxy/config/__tests__/env-builder-provider-url.test.ts` | 8 |
| `src/cliproxy/executor/__tests__/variant-port-edge-cases.test.js` | 8 |
| `src/cliproxy/config/__tests__/config-generator.test.js` | 7 |

## Explicit Shim/Re-export Files

- `src/cliproxy/__tests__/model-catalog-compat.test.ts`
- `src/cliproxy/ai-providers/__tests__/codex-plan-compatibility.test.ts`
- `src/cliproxy/ai-providers/__tests__/openai-compat-manager.test.js`
- `src/cliproxy/ai-providers/openai-compat-manager.ts`
- `src/cliproxy/types/__tests__/types-backward-compat.test.ts`
- `src/utils/profile-compat.ts`
- `src/web-server/services/compatible-cli-docs-registry.ts`
## Maintainability Metrics

| Metric | Value |
|---|---:|
| typed-error adoption (typed/total throws) | 8.6% (37/431) |
| typed-error adoption (P4 locked subdomains) | 91.3% (21/23), target 40% |
| hotpath console.error/warn occurrences | 267 (569 total, 302 CLI-UX exempt) |
| hotpath console.error/warn files | 82 |
| files with createLogger | 64/745 |
| subdomains with zero createLogger | 15 (api, bin, channels, cliproxy, cliproxy/accounts, cliproxy/ai-providers, cliproxy/binary, cliproxy/config, cliproxy/management, cliproxy/sync, cliproxy/types, config, dispatcher, shared, types) |
| files > 400 LOC | 89 |
| files > 600 LOC | 39 |

### Top Hotpath console.error/warn Files

| File | console.error/warn |
|---|---:|
| `src/errors/error-handler.ts` | 11 |
| `src/utils/prompt.ts` | 11 |
| `src/utils/websearch/profile-hook-injector.ts` | 10 |
| `src/cliproxy/accounts/account-safety-cross-lane.ts` | 9 |
| `src/utils/hooks/image-analyzer-profile-hook-injector.ts` | 9 |
| `src/utils/websearch/hook-installer.ts` | 8 |
| `src/cliproxy/auth/token-manager.ts` | 7 |
| `src/cliproxy/binary/downloader.ts` | 7 |
| `src/cliproxy/executor/account-resolution.ts` | 7 |
| `src/config/unified-config-loader.ts` | 7 |
| `src/targets/claude-adapter.ts` | 7 |
| `src/utils/shell-executor.ts` | 7 |
| `src/utils/websearch/hook-config.ts` | 7 |
| `src/targets/droid-detector.ts` | 6 |
| `src/utils/hooks/image-analyzer-hook-installer.ts` | 6 |

### Files > 400 LOC (top 15)

| File | LOC |
|---|---:|
| `src/web-server/routes/cliproxy-auth-routes.ts` | 1515 |
| `src/cliproxy/auth/oauth-handler.ts` | 1455 |
| `src/cursor/cursor-executor.ts` | 1234 |
| `src/web-server/model-pricing.ts` | 1070 |
| `src/web-server/routes/settings-routes.ts` | 1041 |
| `src/cliproxy/config/env-builder.ts` | 1037 |
| `src/cliproxy/proxy/tool-sanitization-proxy.ts` | 1020 |
| `src/cliproxy/auth/oauth-process.ts` | 1018 |
| `src/cliproxy/config/generator.ts` | 1012 |
| `src/commands/cliproxy/variant-subcommand.ts` | 978 |
| `src/cliproxy/quota/quota-manager.ts` | 954 |
| `src/web-server/services/codex-dashboard-service.ts` | 940 |
| `src/glmt/glmt-proxy.ts` | 939 |
| `src/cliproxy/accounts/registry.ts` | 871 |
| `src/channels/official-channels-runtime.ts` | 867 |

