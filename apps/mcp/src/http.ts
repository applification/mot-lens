import { Hono } from 'hono';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import { createMotServer } from './server';
import type { VehicleService } from './dvsa';

export function createHttpApp({ service, html, mode, requestPermit, widgetDomain, verificationToken, build = 'development' }: {
  service: Pick<VehicleService, 'lookup'>; html: string; mode: 'sample' | 'live'; widgetDomain?: string; build?: string; verificationToken?: string;
  requestPermit?: (request: Request) => Promise<boolean>;
}) {
  const app = new Hono();
  app.get('/', c => c.json({ name: 'MOT Lens', description: 'A free, open-source MCP App by Applification.', mcp: '/mcp', mode, source: 'https://github.com/rufushudson/mot-lens' }));
  app.get('/health', c => c.json({ status: 'ok', app: 'mot-lens', version: '0.1.0', mode, build }));
  app.get('/.well-known/openai-apps-challenge', c => verificationToken ? c.text(verificationToken) : c.notFound());
  app.get('/privacy', c => c.text('MOT Lens by Applification. No user accounts, payments, analytics or model API calls. Real registrations are sent to DVSA to retrieve public MOT history. Vehicle responses and OAuth tokens are cached in server memory (responses up to 15 minutes, bounded to 256 entries). IP addresses are used for rate limiting; infrastructure providers may retain security/access logs. Registration, token and vehicle payloads are not deliberately logged by this app. ChatGPT processes conversation data under its own policies. Fictional sample lookups do not contact DVSA. Source: https://github.com/rufushudson/mot-lens. Privacy contact: dave@applification.net.'));
  app.get('/terms', c => c.text('MOT Lens is a free open-source record viewer by Applification. Official data source: DVSA MOT History API. Contains public sector information licensed under the Open Government Licence v3.0. Records have coverage limits and may contain errors; retrieval/cache age is shown. MOT results describe a recorded test, not current roadworthiness, a mechanical diagnosis or a buying recommendation. Sample data is fictional. No endorsement by DVSA or OpenAI is implied. Code is MIT licensed: https://github.com/rufushudson/mot-lens.'));
  app.all('/mcp', async c => {
    const origin = c.req.header('origin');
    if (origin) {
      let allowed = false;
      try { const u = new URL(origin); allowed = ['https://chatgpt.com', 'https://chat.openai.com'].includes(u.origin) || ['127.0.0.1', 'localhost'].includes(u.hostname) || u.origin === new URL(c.req.url).origin; } catch { /* rejected below */ }
      if (!allowed) return c.json({ error: 'Origin not permitted' }, 403);
      c.header('Access-Control-Allow-Origin', origin); c.header('Vary', 'Origin');
      c.header('Access-Control-Allow-Headers', c.req.header('access-control-request-headers') ?? 'Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name');
      c.header('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
      c.header('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    }
    if (c.req.method === 'OPTIONS') return c.body(null, 204);
    if (c.req.method !== 'POST') return c.json({ error: 'Stateless MCP endpoint accepts POST only.' }, 405);
    if (requestPermit && !await requestPermit(c.req.raw)) { c.header('Retry-After', '60'); return c.json({ error: 'Too many requests. Try again in a minute.' }, 429); }
    const declaredSize = Number(c.req.header('content-length'));
    if (declaredSize > 32768) return c.json({ error: 'Request too large' }, 413);
    // Limit the actual bytes too; content-length is not a trust boundary.
    const reader = c.req.raw.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    if (reader) {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 32768) { await reader.cancel(); return c.json({ error: 'Request too large' }, 413); }
        chunks.push(chunk.value);
      }
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const request = new Request(c.req.raw, { body: bytes });
    const server = createMotServer({ service, html, widgetDomain });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 32768 });
    await server.connect(transport);
    try {
      const response = await transport.handleRequest(request);
      if (origin) { response.headers.set('Access-Control-Allow-Origin', origin); response.headers.set('Vary', 'Origin'); response.headers.set('Access-Control-Expose-Headers', 'Mcp-Session-Id'); }
      return response;
    }
    finally { await transport.close(); await server.close(); }
  });
  app.onError((_error, c) => c.json({ error: 'The service is temporarily unavailable.' }, 500));
  return app;
}
