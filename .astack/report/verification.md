# MOT Lens delivery evidence

Verified 9 October 2026 on macOS, Node 24.21.0, Bun 1.4.0, Chromium/Playwright 1.64.0.
Source implementation: `f7d58fa9306286319e67cf636d95b6e2e99e6e1f`; subsequent documentation,
plugin packaging and unique UI-domain configuration are included in the delivery branch.

| Surface | Observed proof | Limits |
| --- | --- | --- |
| TypeScript / build | Strict check, Vite single-file UI and Worker dry-run pass | Runtime/host behavior tested separately |
| Domain + adapter + MCP | 25 Vitest checks pass | DVSA/OAuth are explicit fixtures, not live credentials |
| Local packaged UI | Four Playwright journeys pass against actual MCP resource | Standard development host, no ChatGPT model |
| Hosted packaged UI | Same four journeys pass using public HTTPS MCP endpoint/resource | Development host, not installed ChatGPT |
| Public endpoint | Health/build, initialization, two tools, nine-test/two-observation sample, resource MIME/HTML; foreign-origin 403 | Initial deployment in sample mode |
| Submission package | Both manifests validate against published Agent Plugins 1.0.0 schemas; ZIP root/assets inspected | Draft only; video, publisher verification and review outstanding |
| Actual ChatGPT | Browser connection page checked; session signed out | Installation, model tool selection, iframe behavior and explanation output not verified |
| Live DVSA | Credentials unavailable; real request returns NOT_CONFIGURED | Issued authentication, known real vehicle, API coverage/error/cache comparison outstanding |

The browser journeys verify expansion/display-mode request, original failed-test wording,
selected context, selected-record user message, history filtering, linked observations,
chart keyboard selection, readable table, theme change, mobile/no overflow, no-test/first-due,
mixed/missing data, new lookup selection reset, remount, cancellation and malformed recovery.
Representative edge fixtures are clearly sample-tagged; no test labels them as official data.
The final verification command builds the generated resource before type-checking on fresh
checkouts. Turbo includes shared domain/UI sources and the embedding script in its cache key;
unchanged embedding output does not restart the development watcher during browser checks.

Domain/adapter cases include out-of-order cross-source dates, same-day/identical timestamps,
undated records, latest result vs supplied passing-test expiry, no synthesized expiry, MI/KM
conversion including floating-point equality, zero/missing/unreadable readings, exact repeated
wording/deduplication, safe input normalization, token headers/reuse/expiry/403 renewal,
cache TTL/single-flight, 400/404/403/429, bounded transient retries, token outages/rate limits,
legacy/empty/malformed response rejection, and explicit non-substitution when unconfigured.

Independent read-only review reproduced tied chronology/mileage, malformed payloads, context
reset, dangerous-type display, token errors and rounding issues. Those supported findings were
fixed and regressed. No persistent cooldown storage was added: the user's no-database scope
means coordinator eviction loses memory. This limit is documented in DVSA/hosting guides.

Initial public version: `f3dc8c09-ae92-4d45-a68f-e838fd2ff268` at
`https://mot-lens.web3-blog.workers.dev/mcp`; initial build identifies the source commit above.
Final hosted JSON evidence records the deployed source build and identical resource SHA-256.
Final deployment version is recorded with the release command output in delivery/PR notes.
Delivery deployment: `6564cd42-9ea8-42ae-af22-68f986ccd647`, source build
`aec56c5b6acbe7e4da2444b4536dc858d0326700`, with the dedicated UI origin metadata.
No paid plan upgrade, model API, real-vehicle import, account, analytics or scheduled work.

Evidence PNGs under `evidence/` are real captures of the built MCP UI: compact light,
expanded original failure, dark with table/keyboard selection and mobile. `design/mF32N.png`
exports the pre-implementation Pen direction. These are not ChatGPT screenshots.

Reproduce local: `bun run verify`. Reproduce hosted protocol after building:
`bun run verify:hosted https://mot-lens.web3-blog.workers.dev/mcp`.
Reproduce hosted UI: set `MOT_LENS_BROWSER_ENDPOINT` to that endpoint, then `bun run test:e2e`.
