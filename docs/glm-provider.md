# GLM Provider (Z.AI)

GLM is a direct, Anthropic-compatible profile backed by Z.AI. CCS launches it
through the normal settings-profile flow — no local proxy required.

- Endpoint: `https://api.z.ai/api/anthropic`
- Default model: `glm-5.2` (flagship: 1M context, reasoning Max)

## Setup

New users — the preset catalog defaults to `glm-5.2`:

```bash
ccs setup glm     # create the profile (defaults to glm-5.2)
ccs glm           # run Claude Code through GLM
```

## Tier mapping

CCS maps Claude tiers to GLM models. GLM has two main variants, so Opus and
Sonnet share the flagship to avoid regressions; Haiku uses the faster variant.

| Claude tier | GLM model | Why |
|-------------|-----------|-----|
| Opus | `glm-5.2` | Flagship — 1M context, reasoning Max |
| Sonnet | `glm-5.2` | Parity with Opus (only 2 main variants) |
| Haiku | `glm-5.1` | Lower latency (~15% faster) |
| Default (`ANTHROPIC_MODEL`) | `glm-5.2` | |

## Existing users — config drift (important)

The preset catalog only governs **new** profiles. A profile you created earlier
keeps its old model forever and does **not** follow code changes. If you set up
GLM before `glm-5.2` became the default, migrate manually:

```bash
ccs config set glm model glm-5.2
```

Or edit `~/.ccs/glm.settings.json` directly and set `ANTHROPIC_MODEL` (and the
tier vars) to the values above.

Run `ccs doctor` to detect drift — it warns when your GLM profile lags the
recommended default.

## Pricing

GLM 5.x is priced at **$0** in the CCS dashboard. Z.AI has not published
standalone API pricing (only the Coding Plan at ~$18/month), so cost is reported
as $0 even though token usage is counted accurately. Update `model-pricing.ts`
when Z.AI publishes standalone rates.

## Known limitation: usage stats

`/api/cliproxy/stats` reports **zero** for GLM. GLM is a settings-based profile,
not a CLIProxy-managed provider, so the CLIProxy stats endpoint has no data for
it. Real usage is still captured at Layer 3 (the dashboard reads
`~/.claude/projects/` JSONL) — use the dashboard for accurate GLM usage.
