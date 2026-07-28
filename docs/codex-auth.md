# Codex Auth Developer Contract

The canonical [Codex Adapter guide](https://docs.ccs.kaitran.ca/features/workflow/codex-adapter)
owns user setup. This local contract documents active `ccsx auth` invariants
that contributors and operators must preserve.

## Command Surface

`ccsx auth` owns `create`, `login`, `switch`, `use`, `show`, `remove`, and
`import-default`. Keep syntax and option changes sourced from
[`src/codex-auth/codex-auth-help.ts`](../src/codex-auth/codex-auth-help.ts)
rather than copying a long command reference here.

- `create <name>` is idempotent and starts native `codex login` for new
  profiles. `--force` repairs shared resources without replacing `auth.json`.
- `switch <name>` changes the persistent registry default.
- `use <name>` emits only shell-evaluable `CODEX_HOME` and
  `CCS_CODEX_PROFILE` assignments to stdout. It affects the current shell after
  `eval`/`source`; diagnostics stay on stderr.
- `ccsx <name>` launches a named profile directly without changing the
  persistent default.

## Import Safety

`import-default <name>` imports native `~/.codex/auth.json` without deleting the
source. The implementation in
[`import-default-command.ts`](../src/codex-auth/commands/import-default-command.ts)
must continue to:

- refuse import while a current-user Codex process may be refreshing tokens,
  unless the operator explicitly accepts the race with
  `--force-while-running`;
- retry and validate JSON/JWT shape, reject CLIProxy auth-file formats, and fail
  without registering a profile when a torn write persists;
- write the destination atomically with private permissions;
- omit history and sessions unless `--with-history` is requested;
- refuse an existing profile unless `--force` is used, and preserve its current
  `auth.json` as `auth.json.bak-<timestamp>` before overwrite.

## Storage And Cross-Platform Fallback

```text
~/.ccs/
├── codex-profiles.yaml
└── codex-instances/<name>/
    ├── auth.json, history.jsonl, sessions/   # profile-local
    ├── config.toml -> ~/.codex/config.toml
    ├── agents/ -> ~/.codex/agents/
    ├── skills/ -> ~/.codex/skills/
    └── plugins/
        └── cache/ -> ~/.codex/plugins/cache/
```

The `plugins/` parent stays profile-local. Shared config, resources, and plugin
cache repair must preserve existing profile-local content. On Windows or other
systems where symlinks are unavailable, CCS copies missing shared content into
the profile and warns that later upstream edits will not propagate
automatically. See
[`codex-config-symlink.ts`](../src/codex-auth/codex-config-symlink.ts),
[`codex-profile-resources.ts`](../src/codex-auth/codex-profile-resources.ts),
and
[`codex-profile-plugin-cache.ts`](../src/codex-auth/codex-profile-plugin-cache.ts).

## `ccsx` And `ccsxp` Isolation

`ccsx auth` applies only to native Codex profiles. `ccsxp` ignores
`CCS_CODEX_PROFILE`, uses native `~/.codex` history by default, and routes
through its separate CLIProxy Codex pool. `CCSXP_CODEX_HOME` is its explicit
home override. Never make a `ccsx auth switch` silently redirect `ccsxp`, merge
their auth stores, or consume `ccsx` import backups as pool credentials.

Behavior locks live under `tests/unit/codex-auth/` and
`tests/integration/codex-auth/`.
