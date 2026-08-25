# Hardening Inventory Report

Scope: `src/**/*.{ts,tsx,js,jsx,mjs,cjs}`

## Summary

| Metric | Value |
|---|---:|
| Sync fs occurrences (all) | 2509 |
| Sync fs files affected (all) | 263 |
| Sync fs occurrences (runtime hotpaths) | 1183 |
| Sync fs files affected (runtime hotpaths) | 156 |
| Legacy shim markers | 465 |
| Legacy shim files affected | 176 |

## Top Runtime Hotpath Sync fs Files

| File | Sync Calls | API Names |
|---|---:|---|
| `src/utils/browser/mcp-installer.ts` | 32 | chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync |
| `src/utils/image-analysis/mcp-installer.ts` | 30 | chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync |
| `src/management/shared-manager/diverged-file-adopter.ts` | 29 | chmodSync, closeSync, fsyncSync, linkSync, lstatSync, openSync, readdirSync, readFileSync, readlinkSync, renameSync, statSync, unlinkSync, writeFileSync |
| `src/utils/claude-symlink-manager.ts` | 27 | copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync |
| `src/cliproxy/config/env-builder.ts` | 25 | existsSync, mkdirSync, readFileSync, writeFileSync |
| `src/management/shared-manager/migrations.ts` | 25 | copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, symlinkSync, unlinkSync, writeFileSync |
| `src/utils/websearch/mcp-installer.ts` | 25 | chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync |
| `src/cliproxy/services/variant-settings.ts` | 23 | existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync |
| `src/management/recovery-manager.ts` | 23 | copyFileSync, existsSync, lstatSync, mkdirSync, renameSync, statSync, unlinkSync, writeFileSync |
| `src/utils/shell-completion.ts` | 23 | appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, statSync |

## Top Legacy Shim Marker Files

| File | Marker Count |
|---|---:|
| `src/auth/profile-detector.ts` | 18 |
| `src/web-server/usage/native-quota-collector.ts` | 15 |
| `src/utils/config-manager.ts` | 13 |
| `src/cliproxy/__tests__/pool-onboarding-phase5.test.ts` | 12 |
| `src/cliproxy/executor/__tests__/variant-port-allocation.test.js` | 12 |
| `src/config/schemas/websearch.ts` | 10 |
| `src/commands/cursor-command-display.ts` | 9 |
| `src/config/migration-manager.ts` | 9 |
| `src/cliproxy/config/__tests__/env-builder-provider-url.test.ts` | 8 |
| `src/cliproxy/executor/__tests__/variant-port-edge-cases.test.js` | 8 |

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
| typed-error adoption (typed/total throws) | 19.6% (89/455) |
| typed-error adoption (P4 locked subdomains) | 93.3% (28/30), target 40% |
| hotpath console.error/warn occurrences | 264 (590 total, 326 CLI-UX exempt) |
| hotpath console.error/warn files | 81 |
| files with createLogger | 65/765 |
| subdomains with zero createLogger | 15 (api, bin, channels, cliproxy, cliproxy/accounts, cliproxy/ai-providers, cliproxy/binary, cliproxy/config, cliproxy/management, cliproxy/sync, cliproxy/types, config, dispatcher, shared, types) |
| files > 400 LOC | 93 |
| files > 600 LOC | 42 |

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
| `src/web-server/usage/native-quota-collector.ts` | 1758 |
| `src/web-server/routes/cliproxy-auth-routes.ts` | 1531 |
| `src/cliproxy/auth/oauth-handler.ts` | 1510 |
| `src/cursor/cursor-executor.ts` | 1234 |
| `src/web-server/model-pricing.ts` | 1127 |
| `src/cliproxy/config/generator.ts` | 1109 |
| `src/cliproxy/auth/oauth-process.ts` | 1048 |
| `src/cliproxy/config/env-builder.ts` | 1045 |
| `src/web-server/routes/settings-routes.ts` | 1042 |
| `src/cliproxy/proxy/tool-sanitization-proxy.ts` | 1020 |
| `src/commands/cliproxy/variant-subcommand.ts` | 997 |
| `src/cliproxy/quota/quota-manager.ts` | 954 |
| `src/web-server/services/codex-dashboard-service.ts` | 940 |
| `src/glmt/glmt-proxy.ts` | 939 |
| `src/cliproxy/accounts/registry.ts` | 871 |

