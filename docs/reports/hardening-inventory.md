# Hardening Inventory Report

Scope: `src/**/*.{ts,tsx,js,jsx,mjs,cjs}`

## Summary

| Metric | Value |
|---|---:|
| Sync fs occurrences (all) | 2304 |
| Sync fs files affected (all) | 243 |
| Sync fs occurrences (runtime hotpaths) | 1949 |
| Sync fs files affected (runtime hotpaths) | 193 |
| Legacy shim markers | 424 |
| Legacy shim files affected | 163 |

## Top Runtime Hotpath Sync fs Files

| File | Sync Calls | API Names |
|---|---:|---|
| `src/cliproxy/__tests__/pool-routing-phase3.test.ts` | 96 | existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync |
| `src/cliproxy/config/__tests__/config-generator.test.js` | 88 | existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync |
| `src/management/shared-manager.ts` | 86 | copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync |
| `src/cliproxy/config/__tests__/claude-model-neutral.test.ts` | 63 | existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync |
| `src/cliproxy/accounts/__tests__/account-safety-quota-exhaustion.test.ts` | 48 | existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync |
| `src/cliproxy/accounts/__tests__/account-registry-integrity.test.ts` | 45 | existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync |
| `src/cliproxy/executor/__tests__/variant-port-integration.test.js` | 36 | existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync |
| `src/cliproxy/executor/__tests__/composite-variant-service.test.ts` | 33 | existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync |
| `src/cliproxy/executor/__tests__/variant-port-edge-cases.test.js` | 33 | existsSync, mkdirSync, readdirSync, rmSync, unlinkSync, writeFileSync |
| `src/utils/browser/mcp-installer.ts` | 32 | chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync |

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
| typed-error adoption (typed/total throws) | 0.9% (4/431) |
| typed-error adoption (P4 locked subdomains) | 0.0% (0/23), target 40% |
| hotpath console.error/warn occurrences | 931 (1091 total, 160 CLI-UX exempt) |
| hotpath console.error/warn files | 134 |
| files with createLogger | 35/685 |
| subdomains with zero createLogger | 20 (api, bin, channels, cliproxy, cliproxy/accounts, cliproxy/ai-providers, cliproxy/binary, cliproxy/config, cliproxy/executor, cliproxy/management, cliproxy/quota, cliproxy/routing, cliproxy/sync, cliproxy/types, config, delegation, dispatcher, docker, shared, types) |
| files > 400 LOC | 95 |
| files > 600 LOC | 45 |

### Top Hotpath console.error/warn Files

| File | console.error/warn |
|---|---:|
| `src/utils/error-manager.ts` | 142 |
| `src/cliproxy/accounts/account-safety.ts` | 56 |
| `src/cliproxy/config/model-config.ts` | 32 |
| `src/cliproxy/executor/arg-parser.ts` | 26 |
| `src/dispatcher/flows/settings-flow.ts` | 26 |
| `src/copilot/copilot-executor.ts` | 24 |
| `src/delegation/delegation-handler.ts` | 23 |
| `src/dispatcher/cli-argument-parser.ts` | 22 |
| `src/web-server/routes/cliproxy-stats-routes.ts` | 22 |
| `src/cliproxy/executor/lifecycle-manager.ts` | 16 |
| `src/cursor/cursor-profile-executor.ts` | 16 |
| `src/dispatcher/profile-resolver.ts` | 16 |
| `src/cliproxy/auth/antigravity-responsibility.ts` | 15 |
| `src/cliproxy/executor/auth-coordinator.ts` | 14 |
| `src/cliproxy/executor/model-warnings.ts` | 13 |

### Files > 400 LOC (top 15)

| File | LOC |
|---|---:|
| `src/management/shared-manager.ts` | 1631 |
| `src/web-server/routes/cliproxy-auth-routes.ts` | 1502 |
| `src/cliproxy/auth/oauth-handler.ts` | 1453 |
| `src/cursor/cursor-executor.ts` | 1234 |
| `src/cliproxy/quota/quota-fetcher-gemini-cli.ts` | 1130 |
| `src/commands/cliproxy/quota-subcommand.ts` | 1130 |
| `src/web-server/routes/cliproxy-stats-routes.ts` | 1103 |
| `src/cliproxy/quota/quota-fetcher.ts` | 1087 |
| `src/commands/persist-command.ts` | 1071 |
| `src/web-server/model-pricing.ts` | 1070 |
| `src/web-server/routes/settings-routes.ts` | 1040 |
| `src/cliproxy/proxy/tool-sanitization-proxy.ts` | 1039 |
| `src/cliproxy/config/env-builder.ts` | 1037 |
| `src/cliproxy/auth/oauth-process.ts` | 1018 |
| `src/cliproxy/config/generator.ts` | 1012 |

