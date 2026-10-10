import { describe, expect, it } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createHttpApp } from '../src/http';
import { VehicleService } from '../src/dvsa';
import { outcomeSchema } from '@mot-lens/domain';
import { RESOURCE_URI } from '../src/server';
import { serve } from '@hono/node-server';
import { request } from 'node:http';

describe('real MCP contract', () => {
  it('rejects an attacker-controlled matched Host/Origin on the real loopback server', async () => {
    let lookups = 0;
    const app = createHttpApp({ service: new VehicleService({ client: { lookup: async registration => { lookups++; return { registration, make: 'EXAMPLE' }; } } }), html: '', mode: 'live' });
    const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
    await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture port');
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_vehicle_history', arguments: { registration: 'AB12CDE' } } });
    const call = (origin?: string, host = `127.0.0.1:${address.port}`) => new Promise<{ status: number | undefined; cors: string | undefined; body: string }>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port: address.port, path: '/mcp', method: 'POST', headers: {
        host, ...(origin ? { origin } : {}), 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'content-length': Buffer.byteLength(body),
      } }, res => { let text = ''; res.on('data', chunk => { text += chunk; }); res.on('end', () => resolve({ status: res.statusCode, cors: res.headers['access-control-allow-origin'] as string | undefined, body: text })); });
      req.on('error', reject); req.end(body);
    });
    try {
      const attacker = await call(`http://rebind.example:${address.port}`, `rebind.example:${address.port}`);
      expect(attacker).toEqual({ status: 403, cors: undefined, body: '{"error":"Origin not permitted"}' }); expect(lookups).toBe(0);
      for (const origin of ['http://127.0.0.1:5173', 'http://localhost:5173', 'https://chatgpt.com', undefined]) {
        const valid = await call(origin); expect(valid.status).toBe(200); expect(valid.cors).toBe(origin);
        expect(JSON.parse(valid.body).result.structuredContent.report.vehicle.registration).toBe('AB12CDE');
      }
      expect(lookups).toBe(1);
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
  it('initializes, discovers focused tools, retrieves real domain records, reads the HTML resource and handles bad arguments', async () => {
    const service = new VehicleService({ client: { lookup: async registration => ({ registration, make: 'EXAMPLE', motTests: [] }) } });
    const app = createHttpApp({ service, html: '<!doctype html><title>MOT Lens test</title>', mode: 'live' });
    const client = new Client({ name: 'contract-test', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), { fetch: async (input, init) => app.fetch(new Request(input, init)) }));
    try {
      const tools = await client.listTools(); expect(tools.tools.map(tool => tool.name)).toEqual(['get_vehicle_history', 'show_vehicle_report']);
      const resource = await client.readResource({ uri: RESOURCE_URI }); expect(resource.contents[0]?.mimeType).toBe('text/html;profile=mcp-app');
      expect(resource.contents[0] && 'text' in resource.contents[0] ? resource.contents[0].text : null).toContain('MOT Lens test');
      const lookup = outcomeSchema.parse((await client.callTool({ name: 'get_vehicle_history', arguments: { registration: 'ab12 cde' } })).structuredContent);
      expect(lookup.kind === 'report' ? lookup.report.vehicle.registration : null).toBe('AB12CDE');
      const sample = outcomeSchema.parse((await client.callTool({ name: 'show_vehicle_report', arguments: { sample: true } })).structuredContent);
      expect(sample.kind === 'report' ? sample.report.provenance.kind : null).toBe('sample');
      const invalid = await client.callTool({ name: 'get_vehicle_history', arguments: {} }); expect(invalid.isError).toBe(true);
      const conflict = outcomeSchema.parse((await client.callTool({ name: 'show_vehicle_report', arguments: { registration: 'AB12CDE', sample: true } })).structuredContent);
      expect(conflict.kind === 'error' ? conflict.code : null).toBe('INVALID_REGISTRATION');
    } finally { await client.close(); }
  });
  it('rejects foreign origins, applies request limits and enforces actual body size', async () => {
    const app = createHttpApp({ service: new VehicleService({ client: null }), html: '', mode: 'sample' });
    expect((await app.request('/mcp', { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' })).status).toBe(403);
    expect((await app.request('/mcp', { method: 'POST', body: ' '.repeat(33000) })).status).toBe(413);
    const limited = createHttpApp({ service: new VehicleService({ client: null }), html: '', mode: 'sample', requestPermit: async () => false });
    expect((await limited.request('/mcp', { method: 'POST', body: '{}' })).status).toBe(429);
    const cors = await app.request('/mcp', { method: 'POST', headers: { origin: 'http://127.0.0.1:5173', 'content-type': 'application/json', accept: 'application/json,text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }) });
    expect(cors.status).toBe(200); expect(cors.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173');
  });
});
