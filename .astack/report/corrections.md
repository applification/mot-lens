# Code review and correction evidence — 10 October 2026

Baseline: `036776626ad9433105f7beb7bb3d02877f6a31a3`. Independent read-only
runtime and packaged-widget reviews reproduced the findings before implementation.

The confirmed recurring mechanism is pending widget work without report/selection
ownership: sample completion, context status, explanation and teardown all reproduced
stale publication despite the earlier sequential reset corrections. The upstream body
limit is a new finding: incoming bodies already had a working bound. It prompted one
shared interface for both boundaries, rather than a claim of repeated agent error.
Origin trust, OAuth pacing, invalid date normalization and lost supplied units are
also new findings, not invented repeat classes.

## Ownership decisions

- One server byte reader owns declared and actual size limits, stream cancellation
  and bounded allocation, for incoming MCP and upstream JSON bodies. Transport adapters
  translate its limit error to their existing outcomes.
- One widget session owns context serialization and generation. Replacing a report,
  selection or reset invalidates pending actions; teardown closes the session. An
  in-flight host context update cannot be recalled, so the current replacement follows
  it in order. Only current work may publish completion status or accept a sample.
- Origin trust uses the explicit ChatGPT and loopback browser allowlist, independent
  of the incoming Host header. SDK requests without Origin remain supported.
- The DVSA queue paces actual vehicle fetch starts after token acquisition.
- The domain date parser validates the supplied calendar before formatting, and
  mileage labels preserve supplied unfamiliar units without converting them.

## Enforcement results

| Mistake and source | Mechanism / owner | Enforcement command | Observed baseline rejection | Corrected result | Limit |
| --- | --- | --- | --- | --- | --- |
| Recurring stale widget publication; independent packaged-widget fixtures at baseline | `ReportSession` owns serialized context and generation; every report/selection/reset closes prior work | `bun run test:e2e tests/lifecycle.spec.ts` | All four cases fail: old sample replaces Second; A acknowledgement confirms B; A explanation is sent after replacement and after teardown | Four pass, including current sample and B explanation controls | Already-sent host requests cannot be recalled; current context follows an in-flight obsolete update in order |
| New oversized upstream JSON finding; 2MB chunked fixture fully consumed without cancellation | `readBoundedBody` owns byte limits/cancellation for request and response adapters | `bun run test` | ASCII and multibyte overflow cases return an error only after consuming the response; cancellation assertion fails | Both stop within the cap plus one fixture chunk; valid split UTF-8 JSON remains `Café €` | Fetch/stream implementations can prefetch a chunk; this is bounded buffering, not a zero-allocation guarantee |
| New Host-derived origin trust; actual Node loopback server | Explicit browser origin allowlist in HTTP adapter | `bun run test` | Untrusted matching Host/Origin returns 200/report and attacker CORS | 403, zero lookup; loopback, ChatGPT and no-Origin SDK requests return the expected report | Reproduces server behavior, not full browser DNS rebinding |
| New slow OAuth pacing finding; fake progressing clock | DVSA coordinator paces vehicle fetch starts after token acquisition | `bun run test` | Vehicle starts `[1000, 1000]` | `[1000, 1350]`, both reports returned | Proves the app's 350ms promise, not an official quota violation by the original two-request burst |
| New impossible date rollover; accepted upstream expiry `2026-02-31` | Domain calendar parser, shared by chronology and display | `bun run test` | Invalid calendar is accepted as 3 Mar 2026 | Invalid raw date remains `Unrecognised date: 2026-02-31`; leap day/offset/legacy neighbors pass | Raw records remain supplied values; malformed optional fields do not discard the whole report |
| New unfamiliar unit erasure; accepted upstream `UNKNOWN` unit | Domain mileage label preserves supplied unit; conversion stays MI/KM-only | `bun run test` | `1,234 (unit not recorded)` | `1,234 UNKNOWN`; absent and MI/KM neighbors pass | Fixture is supported by the accepted schema; actual DVSA occurrence was not verified |

The final baseline-widget check rebuilds the archived baseline with its own domain/UI
source, serves it through a disposable local MCP fixture and runs the unchanged retained
lifecycle spec with `MOT_LENS_BROWSER_ENDPOINT=http://127.0.0.1:9797/mcp`. Only the fixture
dependency aliases and serving port differ. The UTF-8 fixture host is included in both runs.
Initial unit rejection: **6 failed, 26 passed**. Corrected suite: **32 passed**.

`bun run verify` (the same command in GitHub CI) passes the production build, strict
TypeScript, all 32 domain/adapter/protocol tests and all eight packaged-resource browser
journeys. Worker bundling passes `bunx wrangler deploy --dry-run`; no deployment was made.
Independent read-only reviewers replayed the original server cases and the four lifecycle
cases and found no remaining material finding in the correction scope.

The cache documentation and `/privacy` now distinguish 15-minute freshness from memory
retention until replacement/eviction/process loss. This is a clarification, not a new purge
guarantee. The original no-database/no-background-job scope is preserved.

Live DVSA credentials and actual installed ChatGPT remain unavailable. The public Worker
still runs the 9 October deployment; these fixes are review-branch changes, not hosted proof.
