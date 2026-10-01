# CLIProxy client-key attribution

CLIProxy's usage queue supplies the inbound client credential in `api_key`.
The compatibility transformer hashes it with SHA-256 at ingestion and retains
only `client_key_id`. Normalized history persists this as `clientKeyId`.
This is distinct from `accountId`, which identifies the upstream OAuth account.
Request merging includes the client fingerprint so otherwise identical requests
from separate keys are not collapsed.

The fingerprint supports grouping request counts, token counts, and estimated
costs from persisted history. Operators can map the SHA-256 digest of their own
high-entropy client keys to owner labels privately; raw keys must never be put
in analytics, screenshots, issues, or log output. Fingerprints are pseudonymous,
not anonymous, and hashing does not protect weak keys against guessing.

Old records without a client fingerprint remain unattributed. Key rotation
produces a new fingerprint; this patch does not infer a shared owner. It also
does not add a dashboard grouping control, change cost calculation, or
change the existing treatment of failed requests with no reported usage.

## Populated legacy snapshots

The populated `/usage` path is handled before the destructive queue. Legacy
backends can group `usage.apis` by caller credential rather than provider. The
adapter matches labels to `/api-keys` and emits only SHA-256 fingerprints.
Recognized provider aliases retain their existing names. A registered caller
key identical to a recognized provider label is ambiguous: collection returns
unavailable with an actionable warning rather than assigning or duplicating
usage. Rotate such keys to high-entropy values and establish a clean cutoff.
Arbitrary labels (including unsupported custom provider
names) become `unknown`, never persisted verbatim as provider names.

Credential/unknown-bucket details additionally carry `usageBucketId`, a stable SHA-256 hash
of its bucket label. This is an opaque deduplication identity, **not** proof of
client ownership. History identity does not depend on whether key metadata is
available. Metadata recovery enriches the existing record; subsequent outages
or removal of that key do not erase verified attribution or count it again.
Multiplicity is preserved for otherwise identical requests within a bucket.
Fresh-process reload retains both fields. A retired key first observed after
its removal remains unattributed; it is not guessed from another key.

History predating this stable identity cannot be reliably reattributed. Do not
infer lossless migration of overlapping legacy snapshots without a stable
identity.

An ordinary CCS upgrade does not change the identity of recognized provider
snapshots: those retain the previous provider-based merge signature. For an
old credential/unknown-bucket record that overlaps a newly identified snapshot,
the merge stops with a `ConfigError` instead of guessing ownership or appending
duplicates. Existing history is preserved; legacy collection cannot resume
until the overlap is removed from incoming data. This conservative guard can
also stop on indistinguishable legitimate requests; it prefers an explicit
migration requirement over silent miscounting.

For that migration, keep the old collector available, checkpoint it, back up CCS
history, and schedule a maintenance cutoff. Confirm the legacy proxy can start
with fresh usage counters without importing old records; preserve its accounts
and credentials. Only proceed once incoming records are after the cutoff, then
verify the first collection against a known request. If resetting usage state
cannot be verified safely, retain the previous collector and seek an explicit
migration plan. Do not delete CCS history or automatically restart a gateway.

Exact request IDs match tokenless local-log supplements across bucket labels;
complete usage records are not deduplicated by that cross-label rule. Without
an exact request ID, differently labeled snapshots/logs remain ambiguous.

### Upgrade/rollback boundary

Changing provider accounts, models, or caller keys does not switch accounting
backends. A proxy upgrade or rollback can change whether CCS receives legacy
snapshots or queue events. This is a version-transition concern, not an ordinary
account operation.

The focused transition regression test retains pre-patch history, collects new
legacy details, reloads persisted history, then collects only new queue events.
It checks exact request/token totals, repeated collection, preserved attribution,
and old records remaining unattributed. This is a local fixture test of the
history transition, not proof that every proxy release resets its usage state.

Supported boundary: retained CCS history and incoming data do not overlap across
the backend change. Before a planned change, checkpoint with the existing sole
collector, retain a recoverable history backup, record the cutoff, and verify
the target backend supplies only new events. Do not start a competing queue
reader, delete history, or assume a restart proves that there is no replay.
If the target imports/replays pre-cutover requests, pause that migration and
validate it separately: cross-backend overlap deduplication is not guaranteed.
Uncollected events can also be lost during a restart; this patch is not a
lossless migration mechanism.

`totalTokens` preserves the backend-reported total when available. Old history
without it remains readable. Input, output and cache token semantics differ by
provider; this is not a change to upstream billing or the existing cost formula.

This change does not solve collector durability: `/usage-queue` consumes records,
the upstream queue has bounded retention, and competing consumers can split the
stream. Do not deploy an additional queue consumer to generate reports beside
CCS. The `/api-key-usage` management endpoint concerns upstream provider API-key
auths and is not a substitute for inbound client attribution.
