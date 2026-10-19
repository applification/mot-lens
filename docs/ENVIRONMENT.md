# Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `DVSA_API_KEY` | Server secret | Issued API key, sent as X-API-Key |
| `DVSA_CLIENT_ID` | Server secret | Issued OAuth client ID |
| `DVSA_CLIENT_SECRET` | Server secret | Issued OAuth client secret |
| `DVSA_TOKEN_URL` | Server configuration/secret | Exact issued tenant-specific HTTPS Microsoft Entra token URL |
| `DVSA_SCOPE` | Server configuration/secret | Exact DVSA-issued OAuth scope |
| `PORT` | Node only | Default 8787; preview expects 8787 |
| `BUILD_ID` | Worker variable injected by release CLI | Full 40-character source SHA; local/default builds report `development` |
| `WIDGET_DOMAIN` | Worker variable | Unique HTTPS UI origin for host isolation/public review |
| `PUBLIC_ENDPOINT` | Worker variable | Validated public `/mcp` URL for health and setup links |
| `DATA_MODE` | Worker variable | Production `live` permits configured DVSA access; staging `sample` always disables it |
| `OPENAI_VERIFICATION_TOKEN` | Worker secret, optional | Exact portal-issued plaintext domain challenge |
| `MOT_LENS_ENDPOINT` | Control CLI only | Explicit target, default local `/mcp` |

All five DVSA fields and a live-enabled target are required to enable live mode.
Staging ignores these credentials and suppresses `OPENAI_VERIFICATION_TOKEN`.
Missing or invalid DVSA configuration keeps
real lookup unavailable and reports sample mode. The token URL is restricted to HTTPS
`login.microsoftonline.com`, preventing credential POSTs to arbitrary endpoints.

Node reads ignored `.env`; Wrangler local development reads ignored `.dev.vars`.
Hosted values are managed with Wrangler secrets. `.env.example` contains no credentials.
No secret uses the `VITE_` prefix or enters the UI bundle, tool result or source logs.
The public endpoint has no end-user authentication because it reads public records;
DVSA OAuth authenticates only the server's developer account.
