# Claude Pool Quota Priority

The optional Claude quota-order policy groups accounts by general quota shape: five-hour only, five-hour plus weekly, weekly only, then unknown. Model-specific windows, including Fable, never determine these groups. Quota percentages and nullable reset times do not change whether a window exists.

The policy uses round-robin for new independent conversations inside the highest eligible group. Session affinity remains inside that group; when a higher-priority credential becomes eligible, the next request can move an existing conversation. Running responses are not interrupted. A move can lose the previous credential's prompt cache. Existing model eligibility, cooldown, retries and explicit credential pins remain authoritative.

## Enable and Inspect

Enable pool routing first, keep a persistent CCS dashboard or the integrated Docker service running, then use `ccs cliproxy accounts order claude --by-quota`. `ccs cliproxy accounts order claude` prints the policy, controller state, per-account class, observation age, intended/effective priority and application state. The dashboard routing settings expose the same enable/disable control and status.

The proxy must explicitly advertise provider-affinity overrides, atomic credential-priority updates and its built-in local selector through authenticated management v8. Older binaries, remote targets, Home and plugin schedulers cannot activate this mode. The CLI does not start a new daemon; a detached proxy without a persistent CCS process cannot reconcile the policy.

`ccs cliproxy accounts order claude --no-quota` disables the policy and restores the preceding mode and owned priority values. An explicit `--set` selects manual mode instead; `--reset` selects file order. Those operations relinquish automatic ownership before applying their chosen order.

## Confirmation and Failure Behavior

Only a recognized complete usage payload can prove the presence or absence of a general quota. Invalid metrics, unknown formats and filtered stale windows never imply that an account has only one window. The normalizer carries optional general-window presence separately from numeric windows.

The last reliable classification is retained for at most six hours from the provider observation's `lastUpdated`. Reading a cache or returning stale data does not extend that age. A failed query does not erase a known classification immediately; after the six-hour boundary, the credential becomes unknown and remains a last-resort candidate. General quota absence is not an unlimited-quota assertion.

The controller runs initially and every 60 seconds. Docker bootstrap and dashboard instances share a cross-process controller lease with heartbeats, plus a separate mutation mutex; overlapping cycles cannot write simultaneously. Followers can take over after the owner exits. Closing the browser does not stop the server-side controller. Stopping the dashboard or bootstrap releases its lease after an in-flight operation finishes.

## Ownership and Recovery

The private versioned `cache/claude-pool-order.json` below `getCcsDir()` records the prior order, original priority values, confirmed classifications and pending write intents. It contains account identifiers and policy metadata, never OAuth tokens. Keep it outside source control. A corrupt journal blocks mutations rather than manufacturing a baseline.

Updates use an atomic compare-and-swap API: the expected runtime priority must still match inside the proxy's credential mutation gate. A conflict preserves the external edit and surfaces drift. Successful writes are checked against the runtime listing. Partial application remains pending or degraded; it is never reported as active. A lost response can be reconciled from the recorded intent without losing the original priority.

Disabling pool routing stops quota-policy writes and restores owned priority values. Unavailable credentials can leave restoration pending; it resumes when their runtime entry becomes available. External edits are preserved during restoration. Inspect status and choose an explicit manual order or disable/re-enable to accept a new baseline after resolving drift.

Before rolling back to a binary without this feature, disable the policy and complete restoration while the capable binary is still running. Retain the journal and current configuration, stop all credential writers before promoting copied state, and preserve the newest OAuth credentials. Never replace refreshed credentials with an older backup merely to restore priorities.

## Maintainer Validation

Regression tests cover optional-window combinations, stale observations and the exact six-hour boundary; lost API responses, conflicts and partial restoration; manual ownership; account separation; leadership and controller shutdown. Source checks and fixtures use isolated CCS/client directories. Live inference acceptance verifies the deployed binary and configuration without deliberately exhausting real credentials.

The public CLI/workflow documentation change must be coordinated with the public CCS documentation repository. This maintainer page does not publish or update that site.
