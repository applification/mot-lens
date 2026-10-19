import { PRODUCT } from '@mot-lens/domain';
import { z } from 'zod';
import { Hono } from 'hono';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import { createMotServer } from './server';
import type { VehicleService } from './dvsa';
import { BodyTooLarge, readBoundedBody } from './body';
import { setupPage } from './setup-page';

export function createHttpApp({ service, html, mode, requestPermit, widgetDomain, publicEndpoint = 'http://127.0.0.1:8787/mcp', verificationToken, build = 'development' }: {
  service: Pick<VehicleService, 'lookup'>; html: string; mode: 'sample' | 'live'; widgetDomain?: string; publicEndpoint?: string; build?: string; verificationToken?: string;
  requestPermit?: (request: Request) => Promise<boolean>;
}) {
  const endpoint = z.url().refine(value => { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && u.pathname === '/mcp' && !u.search && !u.hash && !u.username && !u.password; }, 'Expected an HTTP MCP endpoint').parse(publicEndpoint);
  if (widgetDomain) z.url().refine(value => new URL(value).origin === value, 'Expected a UI origin').parse(widgetDomain);
  const app = new Hono();
  app.get('/', c => c.html(setupPage(endpoint)));
  app.get('/health', c => c.json({ status: 'ok', app: 'mot-lens', version: PRODUCT.version, mode, build, endpoint }));
  app.get('/.well-known/openai-apps-challenge', c => verificationToken ? c.text(verificationToken) : c.notFound());
  app.get('/privacy', c => c.text(`MOT Lens by Applification. No user accounts, payments, analytics or model API calls. Real registrations are sent to DVSA to retrieve public MOT history. Vehicle responses and OAuth tokens are cached in server memory. Responses may be reused for 15 minutes, with at most 256 entries; expired entries can remain in memory until replacement, capacity eviction or process loss. IP addresses are used for rate limiting; infrastructure providers may retain security/access logs. Registration, token and vehicle payloads are not deliberately logged by this app. Your AI host, such as ChatGPT or Claude, processes conversation data under its own policies. Fictional sample lookups do not contact DVSA. Source: ${PRODUCT.repository}. Privacy contact: dave@applification.net.`));
  app.get('/terms', c => c.text(`MOT Lens is a free open-source record viewer by Applification. Official data source: DVSA MOT History API. Contains public sector information licensed under the Open Government Licence v3.0. Records have coverage limits and may contain errors; retrieval/cache age is shown. MOT results describe a recorded test, not current roadworthiness, a mechanical diagnosis or a buying recommendation. Sample data is fictional. No endorsement by DVSA, OpenAI or Anthropic is implied. Code is MIT licensed: ${PRODUCT.repository}.`));
  app.all('/mcp', async c => {
    const origin = c.req.header('origin');
    if (origin) {
      let allowed = false;
      // Incoming Host/URL is caller-controlled, so it cannot confer origin trust.
      try { const u = new URL(origin); allowed = origin === u.origin && (['https://chatgpt.com', 'https://chat.openai.com', 'https://claude.ai'].includes(origin) || (['http:', 'https:'].includes(u.protocol) && ['127.0.0.1', 'localhost'].includes(u.hostname))); } catch { /* rejected below */ }
      if (!allowed) return c.json({ error: 'Origin not permitted' }, 403);
      c.header('Access-Control-Allow-Origin', origin); c.header('Vary', 'Origin');
      c.header('Access-Control-Allow-Headers', c.req.header('access-control-request-headers') ?? 'Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name');
      c.header('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
      c.header('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    }
    if (c.req.method === 'OPTIONS') return c.body(null, 204);
    if (c.req.method !== 'POST') return c.json({ error: 'Stateless MCP endpoint accepts POST only.' }, 405);
    if (requestPermit && !await requestPermit(c.req.raw)) { c.header('Retry-After', '60'); return c.json({ error: 'Too many requests. Try again in a minute.' }, 429); }
    let bytes: Uint8Array<ArrayBuffer>;
    try { bytes = await readBoundedBody(c.req.raw, 32768); }
    catch (error) { if (error instanceof BodyTooLarge) return c.json({ error: 'Request too large' }, 413); throw error; }
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
