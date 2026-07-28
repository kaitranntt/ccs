# CCS Test Suite

Root TypeScript and JavaScript tests run with Bun's test runner. Native shell,
PowerShell, Docker, and standalone probes cover contracts that need a real
platform or process boundary.

## Ownership

| Area | Path | Use for |
| --- | --- | --- |
| Unit | [`unit/`](./unit/) | Focused module and command behavior |
| Integration | [`integration/`](./integration/) | Cross-module, process, proxy, auth, and web-server behavior |
| End to end | [`e2e/`](./e2e/) | Packaged CLI workflows |
| npm package | [`npm/`](./npm/) | Installation, exports, and package behavior |
| Native | [`native/`](./native/) | Unix and Windows shell behavior |
| Docker | [`docker/`](./docker/) | Compose and stable network/service contracts |
| Documentation | [`docs/`](./docs/) | Repository documentation invariants |
| Shared support | [`shared/`](./shared/) | Fixtures and helpers reused by suites |
| Mocks | [`mocks/`](./mocks/) | Bounded test doubles and fixtures |

Some source domains also keep focused tests in `src/**/__tests__/`. Follow the
nearest established pattern and avoid moving tests solely for taxonomy.

## Commands

Commands are defined in [`../package.json`](../package.json). Bucket membership
and execution live in
[`../scripts/run-test-bucket.js`](../scripts/run-test-bucket.js).

```bash
bun run test:fast      # Fast Bun test bucket
bun run test:slow      # Slow Bun test bucket
bun run test:all       # All root non-e2e Bun test buckets
bun run test:unit      # tests/unit
bun run test:npm       # tests/npm
bun run test:native    # Native Unix edge-case script
bun run test:e2e       # tests/e2e with fail-fast and extended timeout
bun run test           # Build, then test:all
```

For the normal contributor gate:

```bash
bun run format
bun run lint:fix
bun run validate
```

For the closest local equivalent to PR CI:

```bash
bun run validate:ci-parity
```

Dashboard tests use Vitest and are documented in
[`../ui/README.md`](../ui/README.md).

## Test Isolation

- Set `CCS_HOME` to a temporary directory.
- Never read or modify a contributor's real `~/.ccs/` or `~/.claude/`.
- Use `getCcsDir()` from
  [`../src/utils/config-manager.ts`](../src/utils/config-manager.ts) for CCS
  paths.
- Keep fixtures deterministic and free of credentials or private account data.
- Use real behavior at the boundary under test; do not weaken assertions to
  hide regressions.

## Adding Coverage

- Add a focused unit test for isolated logic.
- Add integration coverage when behavior crosses modules, processes, HTTP, or
  persistence boundaries.
- Add e2e coverage when command routing or packaged CLI behavior is the
  contract.
- Add native or Docker coverage only when platform/runtime behavior cannot be
  represented faithfully in Bun tests.
- Run the smallest relevant command first, then broaden to the contributor or
  CI-parity gate when shared contracts changed.
