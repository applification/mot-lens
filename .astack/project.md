# Project operating profile

MOT Lens 0.1.0: free MIT one-vehicle MOT report, by Applification.
Runtime: Bun 1.4.0 package manager, Turbo tasks, Node 24+ local MCP, React/Vite UI,
Cloudflare Worker production. Zod owns external boundaries. No application database.
Cloudflare's singleton Durable Object uses memory only for the DVSA queue/cache.

Install/build: `bun install --frozen-lockfile && bun run build`.
Start: `bun run dev` (MCP 127.0.0.1:8787; development host 127.0.0.1:5173).
Control: `bun run control doctor`, `tools`, `sample`, `lookup REGISTRATION`, `resource`.
Set `MOT_LENS_ENDPOINT` to target a hosted deployment explicitly.
Verification: `bun run verify`; browser installation: `bunx playwright install chromium`.
Browser tests default to the exact production resource returned by MCP.
Source HMR preview is opt-in at `http://127.0.0.1:5173/?source=dev`.

Design: `.astack/report/mot-lens.pen`, captured before UI implementation.
Evidence: `.astack/report/evidence/`, final release report `.astack/report/verification.md`.
Contract: `.astack/report/contract.md`. Hosting plan: `.astack/cloud/transition.md`.
Feature/control map: `docs/FEATURES.md`. Domain glossary: `docs/GLOSSARY.md`.

Two focused read-only tools and one MCP App resource; no internal LLM.
Storybook omitted for this small single report: real MCP resource/host bridge journeys
cover sample, errors, missing fields, mixed units, themes, keyboard and mobile.
Deterministic Playwright assertions run the full bridge; model-driven browser tooling
would add cost without improving the required record/context assertions here.
No GitHub deployment workflow or cloud credentials stored in the repository.
