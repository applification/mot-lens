import { describe, expect, it } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createHttpApp } from '../src/http';
import { VehicleService } from '../src/dvsa';
import { outcomeSchema } from '@mot-lens/domain';
import { RESOURCE_URI } from '../src/server';

describe('real MCP contract', () => {
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
