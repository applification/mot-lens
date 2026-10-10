# Hosting MOT Lens

Current MCP endpoint: **https://mot-lens.web3-blog.workers.dev/mcp**.
[Health](https://mot-lens.web3-blog.workers.dev/health), [privacy](https://mot-lens.web3-blog.workers.dev/privacy)
and [terms](https://mot-lens.web3-blog.workers.dev/terms) are public. `/` describes the service
as JSON; it is not a consumer website. The MCP resource contains the interactive UI.

The initial deployment is sample-only. The real adapter is present but no DVSA credentials
were available. Real lookups return `NOT_CONFIGURED`; only explicit sample requests show fiction.

## Deploy your own copy

Use an existing Cloudflare account, then check its identity and choose an unused Worker name.
Change `name`, unique rate-limit namespace ID and `WIDGET_DOMAIN` in `wrangler.jsonc` for your
copy. Do not reuse another deployment's bindings/verification challenge. No custom domain is
required for the developer endpoint. Do not change an account's shared workers.dev subdomain.

```sh
bun install --frozen-lockfile
bun run verify
bunx wrangler whoami
bunx wrangler deploy --dry-run
bunx wrangler deploy --var BUILD_ID:$(git rev-parse HEAD)
```

`DVSA_GATE` is one named memory-only coordinator across regions. The SQLite-capable class
declaration is required for Free-plan Durable Objects; the application never accesses its
storage, writes rows or uses SQL. There is no application database or scheduled job.

Memory is ephemeral: Cloudflare can hibernate an idle coordinator after about 10s and discard
tokens, cached vehicles and cooldowns. A cache hit reports the real age; no 15-minute hit is
guaranteed. Eviction may require another upstream request to re-establish an outstanding
cooldown. The singleton still serializes all active lookups with 350ms pacing; 429 is surfaced
without automatic retry. Use a dedicated DVSA credential set for this deployment.
The 15-minute TTL limits reuse, not timed erasure. Idle expired entries may remain in memory
until replacement, capacity eviction or process loss, with at most 256 vehicle entries.

The public binding allows 90 MCP requests/minute/IP per Cloudflare location. It is an
eventually consistent abuse control, not a global quota or billing cap. Actual bodies are
capped at 32KiB, origins restricted, upstream payloads bounded, cache 256 vehicles, queue eight.
Observability is disabled by default to avoid application request/record logging. The hosting
provider may keep infrastructure security/access information under its own policies.

## Enable official records

Register with DVSA and copy the five issued values into server secrets. Each command prompts
for the value; never put secrets in command arguments, Git, public variables or the UI bundle.

```sh
bunx wrangler secret put DVSA_API_KEY
bunx wrangler secret put DVSA_CLIENT_ID
bunx wrangler secret put DVSA_CLIENT_SECRET
bunx wrangler secret put DVSA_TOKEN_URL
bunx wrangler secret put DVSA_SCOPE
```

Secrets updates publish a new version. Check `/health` reports `live`, then validate an
owner-supplied known vehicle and compare original records with the official MOT service.
Complete the live/error/cache cases in the verification report. Refresh the ChatGPT connection
after tool/resource metadata changes. No credentials are required from end users.

## Cost and recovery

No paid plan upgrade was made. At modest traffic the design aims to fit Cloudflare's included
allowances. As checked 9 October 2026, Workers Free includes 100,000 requests/day and 10ms CPU
per invocation; Durable Objects Free includes 100,000 requests/day and 13,000 GB-s/day.
Limits are shared with other services in the account. A heavy runtime invocation or excess
traffic can hit Free-plan limits even below the request allowance. Existing paid accounts
use their plan's billing; public IP limiting is not a cost guarantee. Review usage before
increasing traffic. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
[lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/).

Record the returned version ID and source build on every release. `bunx wrangler deployments list`
lists versions; `bunx wrangler rollback VERSION_ID` restores a known prior deployment (follow
CLI confirmation). For the first release there is no prior production version. Re-deploy a
known source revision if needed. There is no application data to restore. Removing the five
DVSA secrets disables live lookup while retaining the sample. Local `.env` is independent.

## Verify the public target

```sh
MOT_LENS_ENDPOINT=https://mot-lens.web3-blog.workers.dev/mcp bun run control doctor
MOT_LENS_ENDPOINT=https://mot-lens.web3-blog.workers.dev/mcp bun run control sample
MOT_LENS_ENDPOINT=https://mot-lens.web3-blog.workers.dev/mcp bun run control resource
MOT_LENS_BROWSER_ENDPOINT=https://mot-lens.web3-blog.workers.dev/mcp bun run test:e2e
```

For manual browser verification, use the local development host with its explicit endpoint:
`http://127.0.0.1:5173/?endpoint=https%3A%2F%2Fmot-lens.web3-blog.workers.dev%2Fmcp`.
This loads the public server's built resource and tools through the standard bridge. It is
hosted MCP/UI proof in a development host, not installed ChatGPT proof.
