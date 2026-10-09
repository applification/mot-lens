# Hosted delivery contract

Source: local Node MCP 127.0.0.1:8787 and packaged React MCP App resource.
Target: new Cloudflare Worker `mot-lens` in the authenticated Applification account.
User authority: requested hosted free open-source MCP App; no paid upgrade requested or made.
No existing Worker with this name was present. No user accounts/data migration required.

Public HTTPS stateless Streamable HTTP MCP; embedded single-file UI, no consumer site.
One named DvsaGate coordinator uses ephemeral memory only. Cloudflare requires the
SQLite-capable class migration for Free-plan Durable Objects; the app never accesses
storage/SQL or creates tables, records, alarms or background jobs.
Secrets: five server DVSA variables, initially absent => explicit sample mode.
No cloud keys in Git/CI. CLI authentication is the user's existing local credential store.
Local .env/127.0.0.1 and deployment config remain separate.

Acceptance: actual hosted health/build, MCP initialize/list-tools, sample/error results,
resource MIME/content/CSP and non-permitted origin/body-size rejection.
Actual ChatGPT installation and live DVSA require separately available access.
Recovery: first deploy creates a new service; for later releases use Wrangler rollback
to a recorded previous version. Code-only rollback needs no data restoration. To disable
live access remove server DVSA secrets and redeploy/restart; fictional sample still works.
