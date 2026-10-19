import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { outcomeSchema } from '@mot-lens/domain';

const argument = process.argv[2];
if (!argument) throw new Error('Specify the HTTPS target: bun run verify:hosted https://YOUR-HOST/mcp');
const endpoint = new URL(argument); assert.equal(endpoint.protocol, 'https:'); assert.equal(endpoint.pathname, '/mcp');
const identityResponse = await fetch(new URL('/health', endpoint)); assert.equal(identityResponse.status, 200);
const identity = z.object({ app: z.literal('mot-lens'), status: z.literal('ok'), mode: z.enum(['live', 'sample']), build: z.string() }).parse(await identityResponse.json());
const client = new Client({ name: 'mot-lens-hosted-verification', version: '0.1.0' });
await client.connect(new StreamableHTTPClientTransport(endpoint));
try {
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map(tool => tool.name), ['get_vehicle_history', 'show_vehicle_report']);
  for (const tool of tools) { assert.equal(tool.annotations?.readOnlyHint, true); assert.equal(tool.annotations?.destructiveHint, false); }
  const sample = outcomeSchema.parse((await client.callTool({ name: 'show_vehicle_report', arguments: { sample: true } })).structuredContent);
  assert.equal(sample.kind, 'report');
  if (sample.kind !== 'report') throw new Error('Sample unavailable');
  assert.equal(sample.report.provenance.kind, 'sample'); assert.equal(sample.report.tests.length, 9); assert.equal(sample.report.observations.length, 2);
  const invalid = outcomeSchema.parse((await client.callTool({ name: 'get_vehicle_history', arguments: { registration: '../bad' } })).structuredContent);
  assert.equal(invalid.kind === 'error' ? invalid.code : null, 'INVALID_REGISTRATION');
  if (identity.mode === 'sample') {
    const unavailable = outcomeSchema.parse((await client.callTool({ name: 'get_vehicle_history', arguments: { registration: 'AB12CDE' } })).structuredContent);
    assert.equal(unavailable.kind === 'error' ? unavailable.code : null, 'NOT_CONFIGURED');
  }
  const resource = (await client.readResource({ uri: 'ui://mot-lens/report-v1.html' })).contents[0];
  assert.ok(resource && 'text' in resource); assert.equal(resource.mimeType, 'text/html;profile=mcp-app');
  const ui = z.object({ ui: z.object({ domain: z.url(), csp: z.object({ connectDomains: z.array(z.string()), resourceDomains: z.array(z.string()) }) }) }).parse(resource._meta);
  assert.deepEqual(ui.ui.csp, { connectDomains: [], resourceDomains: [] });
  const local = await readFile(new URL('../apps/mcp-ui/dist/widget.html', import.meta.url), 'utf8');
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  assert.equal(digest(resource.text), digest(local), 'Hosted UI must equal the verified local build');
  const foreign = await fetch(endpoint, { method: 'POST', headers: { origin: 'https://example.invalid', 'content-type': 'application/json' }, body: '{}' }); assert.equal(foreign.status, 403);
  const oversized = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ' '.repeat(32769) }); assert.equal(oversized.status, 413);
  for (const path of ['/privacy', '/terms']) assert.equal((await fetch(new URL(path, endpoint))).status, 200);
  const setup = await fetch(new URL('/', endpoint)); assert.equal(setup.status, 200);
  assert.ok(setup.headers.get('content-type')?.includes('text/html'));
  const setupHtml = await setup.text();
  assert.ok(setupHtml.includes('https://mot-lens.applification.net/mcp'));
  assert.ok(setupHtml.includes('Official ChatGPT connection guide') && setupHtml.includes('Official Claude connector guide'));
  const evidence = { checkedAt: new Date().toISOString(), endpoint: endpoint.href, ...identity,
    tools: tools.map(tool => tool.name), sampleTests: sample.report.tests.length, sampleObservations: sample.report.observations.length,
    resource: { mimeType: resource.mimeType, bytes: Buffer.byteLength(resource.text), sha256: digest(resource.text), ...ui.ui },
    foreignOriginStatus: foreign.status, oversizedBodyStatus: oversized.status,
    verified: 'Hosted protocol and identical packaged UI; no live DVSA or installed ChatGPT verification.' };
  await writeFile(new URL('../.astack/report/evidence/hosted.json', import.meta.url), `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally { await client.close(); }
