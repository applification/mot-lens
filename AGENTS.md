# MOT Lens

Read `.astack/project.md` for runtime, control and verification commands.
Keep this a one-vehicle MCP App; the browser host in `apps/mcp-ui/src/preview.tsx`
is development-only. Ship only `widget.html` through the MCP resource.

DVSA data is authoritative. Preserve original defect wording, units and dates.
Do not invent repairs, retest order, condition scores, diagnoses or buying verdicts.
Parse external data with Zod. Keep secrets, token requests and API calls on the server.
Do not introduce accounts, an application database, paid model calls or background jobs.

Use Bun 1.4.0 and Node 24+, the committed lockfile and strict TypeScript.
Run the affected domain/protocol checks and the packaged-resource browser journeys.
Distinguish fixtures, hosted protocol proof and actual ChatGPT verification.
One implementation writer; independent read-only reviews may run in parallel.
