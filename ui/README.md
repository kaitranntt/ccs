# CCS Dashboard UI

React, TypeScript, and Vite frontend for the local dashboard served by the CCS
web server through:

```bash
ccs config
```

## Development

From the repository root, build the server and open the integrated dashboard:

```bash
bun run dev
```

Pass a host explicitly when testing network access:

```bash
bun run dev -- --host 0.0.0.0
bun run dev -- --host 127.0.0.1
```

For the frontend-only Vite server:

```bash
cd ui
bun run dev
```

Root and UI scripts are defined in
[`../package.json`](../package.json) and [`package.json`](./package.json).

## Source Ownership

| Area | Path |
| --- | --- |
| Route-level pages | [`src/pages/`](./src/pages/) |
| Domain and shared components | [`src/components/`](./src/components/) |
| Server-state hooks | [`src/hooks/`](./src/hooks/) |
| Cross-page context/providers | [`src/contexts/`](./src/contexts/) and [`src/providers/`](./src/providers/) |
| API, localization, catalogs, helpers | [`src/lib/`](./src/lib/) |
| UI tests | [`tests/`](./tests/) and colocated tests |

Follow the owning domain's existing import pattern. Barrel exports are optional,
not required at every directory level.

## Quality Commands

```bash
cd ui
bun run format
bun run typecheck
bun run lint
bun run validate
bun run test:run
```

`bun run validate` currently runs typecheck, lint with fixes, and the format
check. UI tests run with Vitest; use `test`, `test:run`, `test:coverage`, or
`test:ui` as defined in [`package.json`](./package.json).

## Localization

Dashboard localization uses `react-i18next`.

| Concern | Source |
| --- | --- |
| Supported locales, normalization, fallback, persistence | [`src/lib/locales.ts`](./src/lib/locales.ts) |
| i18next setup and translation resources | [`src/lib/i18n.ts`](./src/lib/i18n.ts) |
| Language switcher | [`src/components/layout/language-switcher.tsx`](./src/components/layout/language-switcher.tsx) |

English is the fallback. The selected locale is stored in browser local storage
under `ccs-ui-locale`. Treat `src/lib/locales.ts` as the complete source of
truth for supported locale codes. When adding or removing a locale, update the
translation resources, switcher, tests, and
[dashboard i18n guide](../docs/i18n-dashboard.md) in the same change.
