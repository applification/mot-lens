# Features and controls

| Feature | Stable control | Observed state / verification |
| --- | --- | --- |
| Deployment identity | `bun run control doctor` | Health mode/build + MCP initialization/tool discovery |
| Headless lookup | `bun run control lookup "AB12 CDE"` | Typed report or explicit error; no sample substitution |
| Fictional report | `bun run control sample` | `provenance.kind=sample`, nine records, original wording |
| Packaged app | `bun run control resource` | UI MIME, inline HTML byte count, CSP metadata |
| Compact/expanded report | Expand button through host bridge | `tests/report.spec.ts`, display-mode request + inline fallback |
| Test selection | Chart marker / timeline button, Enter/Space | Selected detail + ordered `ui/update-model-context` |
| Explain selected test | Explain this test button | `ui/message` user prompt includes selected record, no model API |
| Readable mileage | Chart table disclosure | Every original reading/unit/reason including undated records |
| Pattern evidence | Observation-linked test buttons | IDs link original records; deterministic explanatory basis |
| Another vehicle | Host conversation calls `show_vehicle_report` | New input clears selection, then replaces report |
| Empty/error/theme/mobile | Development fixture/host controls | Packaged-resource Playwright journeys |

The development host is inspectable, not a consumer website or a simulated ChatGPT model.
