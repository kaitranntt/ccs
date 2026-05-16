# CCS Dashboard UI

React + TypeScript + Vite frontend for the CCS local dashboard.

This UI is served by the CCS web server and is accessed via:

```bash
ccs config
```

---

## Development

From project root:

```bash
bun run dev
```

This starts the CCS server, opens a local browser URL, and binds the dashboard to the default IPv4 wildcard host (`0.0.0.0`).
If the runtime bind is reachable beyond loopback, CCS also prints an auth reminder.

For remote device access during development, run:

```bash
bun run dev -- --host 0.0.0.0
```

For local-only development, run:

```bash
bun run dev -- --host 127.0.0.1
```

From `ui/` only (frontend dev server):

```bash
cd ui
bun run dev
```

---

## Quality Commands

```bash
cd ui
bun run typecheck
bun run lint
bun run validate
bun run test:run
```

---

## i18n

Dashboard localization uses `react-i18next`.

- Main setup: `ui/src/lib/i18n.ts`
- Locale helpers: `ui/src/lib/locales.ts`
- Language switcher: `ui/src/components/layout/language-switcher.tsx`

For full architecture, conventions, and locale onboarding, see:

- [`../docs/i18n-dashboard.md`](../docs/i18n-dashboard.md)

---

## Notes

- UI locale persistence uses browser localStorage key `ccs-ui-locale`.
- Current supported locales are managed in `ui/src/lib/locales.ts`.
- Current locales: `en`, `zh-CN`, `vi`.
- Fallback locale is English (`en`).
