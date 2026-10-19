import { serve } from '@hono/node-server';
import html from '../generated/widget';
import { credentialsFromEnv, DvsaClient, VehicleService } from './dvsa';
import { createHttpApp } from './http';
const credentials = credentialsFromEnv(process.env);
const service = new VehicleService({ client: credentials ? new DvsaClient({ credentials }) : null });
const buckets = new Map<string, { count: number; reset: number }>();
const app = createHttpApp({ service, html, mode: credentials ? 'live' : 'sample', publicEndpoint: `http://127.0.0.1:${process.env.PORT ?? 8787}/mcp`, requestPermit: async () => {
  const key = 'local'; const now = Date.now(); const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) { buckets.set(key, { count: 1, reset: now + 60_000 }); return true; }
  return ++bucket.count <= 300;
} });
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: Number(process.env.PORT ?? 8787) });
process.stdout.write(`MOT Lens MCP: http://127.0.0.1:${process.env.PORT ?? 8787}/mcp (${credentials ? 'live' : 'sample'} mode)\n`);
