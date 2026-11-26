# Hardening Inventory Report

Scope: `src/**/*.{ts,tsx,js,jsx,mjs,cjs}`

## Summary

| Metric | Value |
|---|---:|
| Sync fs occurrences (all) | 2648 |
| Sync fs files affected (all) | 290 |
| Sync fs occurrences (runtime hotpaths) | 1138 |
| Sync fs files affected (runtime hotpaths) | 169 |
| Legacy shim markers | 469 |
| Legacy shim files affected | 188 |

## Top Runtime Hotpath Sync fs Files

| File | Sync Calls | API Names |
|---|---:|---|
| `src/management/shared-manager/diverged-file-adopter.ts` | 32 | chmodSync, closeSync, fsyncSync, linkSync, lstatSync, openSync, readdirSync, readFileSync, readlinkSync, renameSync, statSync, unlinkSync, writeFileSync |
| `src/management/shared-manager/migrations.ts` | 29 | chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, unlinkSync, writeFileSync |
| `src/utils/claude-symlink-manager.ts` | 27 | copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync |
| `src/cliproxy/services/variant-settings.ts` | 23 | existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync |
| `src/management/recovery-manager.ts` | 23 | copyFileSync, existsSync, lstatSync, mkdirSync, renameSync, statSync, unlinkSync, writeFileSync |
| `src/utils/shell-completion.ts` | 23 | appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, statSync |
| `src/utils/claude-dir-installer.ts` | 21 | copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync |
| `src/cliproxy/binary/version-cache.ts` | 20 | existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync |
| `src/cliproxy/services/startup-lock.ts` | 20 | existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync |
| `src/commands/bar/install-subcommand.ts` | 20 | existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync |

## Top Legacy Shim Marker Files

| File | Marker Count |
|---|---:|
| `src/auth/profile-detector.ts` | 18 |
| `src/cliproxy/__tests__/pool-onboarding-phase5.test.ts` | 12 |
| `src/cliproxy/executor/__tests__/variant-port-allocation.test.js` | 12 |
| `src/utils/config-manager.ts` | 11 |
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
- `src/cliproxy/services/usage-compatibility-transformer.ts`
- `src/cliproxy/types/__tests__/types-backward-compat.test.ts`
- `src/utils/profile-compat.ts`
- `src/web-server/services/compatible-cli-docs-registry.ts`
## Maintainability Metrics

| Metric | Value |
|---|---:|
| typed-error adoption (typed/total throws) | 66.3% (325/490) |
| typed-error adoption (P4 locked subdomains) | 93.3% (28/30), target 40% |
| hotpath console.error/warn occurrences | 268 (594 total, 326 CLI-UX exempt) |
| hotpath console.error/warn files | 83 |
| files with createLogger | 71/846 |
| subdomains with zero createLogger | 14 (api, bin, channels, cliproxy, cliproxy/accounts, cliproxy/binary, cliproxy/config, cliproxy/management, cliproxy/model-catalog-data, cliproxy/types, config, dispatcher, shared, types) |
| files > 400 LOC | 87 |
| files > 600 LOC | 33 |

### Top Hotpath console.error/warn Files

| File | console.error/warn |
|---|---:|
| `src/errors/error-handler.ts` | 11 |
| `src/utils/prompt.ts` | 11 |
| `src/utils/websearch/profile-hook-injector.ts` | 10 |
| `src/cliproxy/accounts/account-safety-cross-lane.ts` | 9 |
| `src/cliproxy/executor/account-resolution.ts` | 9 |
| `src/utils/hooks/image-analyzer-profile-hook-injector.ts` | 9 |
| `src/utils/websearch/hook-installer.ts` | 8 |
| `src/cliproxy/auth/token-manager.ts` | 7 |
| `src/cliproxy/binary/downloader.ts` | 7 |
| `src/config/unified-config-loader.ts` | 7 |
| `src/targets/claude-adapter.ts` | 7 |
| `src/utils/shell-executor.ts` | 7 |
| `src/utils/websearch/hook-config.ts` | 7 |
| `src/targets/droid-detector.ts` | 6 |
| `src/utils/hooks/image-analyzer-hook-installer.ts` | 6 |

### Files > 400 LOC (top 15)

| File | LOC |
|---|---:|
| `src/web-server/services/codex-dashboard-service.ts` | 940 |
| `src/glmt/glmt-proxy.ts` | 925 |
| `src/cliproxy/accounts/registry.ts` | 898 |
| `src/channels/official-channels-runtime.ts` | 867 |
| `src/cliproxy/ai-providers/codex-reasoning-proxy.ts` | 865 |
| `src/web-server/usage/handlers.ts` | 861 |
| `src/cliproxy/accounts/drain-order.ts` | 856 |
| `src/web-server/usage/aggregator.ts` | 842 |
| `src/cliproxy/quota/quota-fetcher-codex.ts` | 840 |
| `src/proxy/transformers/request-transformer.ts` | 811 |
| `src/web-server/routes/config-routes.ts` | 781 |
| `src/commands/bar/install-subcommand.ts` | 777 |
| `src/web-server/routes/account-routes.ts` | 770 |
| `src/auth/profile-detector.ts` | 767 |
| `src/delegation/headless-executor.ts` | 767 |

