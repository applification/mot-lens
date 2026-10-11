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

## Development environment enforcement — 10 October 2026

Environment review baseline: `01b2ece` (clean checkout). These are new enforcement gaps
in explicit `AGENTS.md` invariants, rather than claims of recurring implementation errors.
Application modules and HTML entry points are preserved. No runtime correction was made.
The recorded runtime findings above already have retained domain/protocol/browser checks.

| Demonstrated gap and source | Environment change / owner | Enforcing command | Bad-case result | Valid-case result | Remaining coverage |
| --- | --- | --- | --- | --- | --- |
| `AGENTS.md` requires strict TypeScript; root `tsconfig.json` omitted `tests/`. A disposable browser-test file assigning `123` to `string` passed the original check (exit 0). | Root TypeScript configuration includes browser tests. | `bun run check` (also in `bun run verify` and GitHub CI) | Same disposable contribution rejected with TS2322 (exit 2). | Valid Playwright neighbor and the existing browser tests pass (exit 0). | Compilation does not establish runtime behavior; packaged-resource journeys remain required. |
| `AGENTS.md` keeps secrets/API requests on the server and the preview host out of the shipped widget; the Vite build had no boundary guard. Disposable network/environment access, aliased transitive UI-to-server imports and preview imports all built successfully without a guard. | `scripts/widget-boundary.ts`, attached to production Vite builds before transpilation; checks reached project modules and static import specifiers. | `bun run build`; negative/positive fixtures in `bun run test scripts/widget-boundary.test.ts` (both in local verification and CI) | Rejects six browser network API forms, four server environment forms, an aliased transitive server import, three preview import forms, four server-only import forms and a computed import path; diagnostics identify the rejected module or file/line and the supported server/bridge alternative. | Shared UI/domain modules, App bridge method names, built-in Vite flags, recorded text, erased types and unreached preview/server files pass. The unchanged application builds. | First-party syntactic enforcement, not third-party dependency auditing or arbitrary data-flow analysis. Obfuscated/computed property access and secrets embedded as ordinary literal data are not covered. |
| `AGENTS.md` requires only `widget.html` in the production resource. Disposable `index.html` and multi-entry builds succeeded with the original build setup. | The same Vite guard requires the sole production input to resolve to `apps/mcp-ui/widget.html`. | `bun run build`; the same fixture suite | Preview-only and widget-plus-preview inputs are rejected before bundling. | The production widget input passes; Vite development remains available to the browser journeys. | Exact MCP embedding and host behavior still require protocol/browser proof. |

The fixture suite runs real Vite builds in temporary directories, with no remote requests
and no production-source mutation. It contains **22** checks: 21 rejected bad cases and
one valid neighboring contribution. For the network/environment, transitive server,
preview-import and input cases, each fixture also builds successfully with the guard
disabled, demonstrating the original enforcement gap. Only the fixture uses that switch;
the project build always installs the guard. Built-in/SDK imports are rejected before
resolution and have no unguarded-build claim.

The guard is included in Turbo's global cache inputs, following the earlier shared-source
cache correction. A disposable guard edit changes every build task's cache key; restoring
the original guard restores the original keys. GitHub CI already runs `bun run verify`, so
both production enforcement and guard regressions execute there without a separate
workflow or deployment step.

Validation environment: macOS, Bun **1.4.0**, Node **24.21.0**, frozen committed lockfile.
Observed results: `bun run verify` passes strict checking, the production build, **54**
Vitest checks (32 existing domain/adapter/protocol plus 22 environment guards), and all
**eight** local packaged-resource browser journeys. Application-source and HTML checksums
match the baseline. These results do not establish hosted protocol, live DVSA, or installed
ChatGPT behavior; the historical hosted evidence above remains separate.
