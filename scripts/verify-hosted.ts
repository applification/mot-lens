import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { PRODUCT, outcomeSchema } from '@mot-lens/domain';
import { digestSchema, endpointSchema, sha256, sourceShaSchema, versionSchema } from './release-model';

const healthSchema = z.object({ app: z.literal('mot-lens'), status: z.literal('ok'), version: versionSchema, mode: z.enum(['live', 'sample']), build: z.union([sourceShaSchema, z.literal('development')]), endpoint: endpointSchema });
export const expectationSchema = z.object({ endpoint: endpointSchema, version: versionSchema, sourceSha: sourceShaSchema, widgetSha256: digestSchema, uiOrigin: z.url(), mode: z.enum(['live', 'sample']) });
export type DeploymentExpectation = z.infer<typeof expectationSchema>;
export type DeploymentObservation = Awaited<ReturnType<typeof observe>>;
const timedFetch: typeof fetch = (input, init) => fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) });

export async function observe(endpoint: string, request: typeof fetch = timedFetch) {
  endpointSchema.parse(endpoint);
  const identityResponse = await request(new URL('/health', endpoint)); assert.equal(identityResponse.status, 200);
  const health = healthSchema.parse(await identityResponse.json());
  const client = new Client({ name: `${PRODUCT.name}-hosted-verification`, version: PRODUCT.version });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), { fetch: request }));
    const server = z.object({ name: z.literal('mot-lens'), version: versionSchema }).parse(client.getServerVersion());
    const tools = (await client.listTools()).tools;
    assert.deepEqual(tools.map(tool => tool.name), ['get_vehicle_history', 'show_vehicle_report']);
    for (const tool of tools) { assert.equal(tool.annotations?.readOnlyHint, true); assert.equal(tool.annotations?.destructiveHint, false); }
    const sample = outcomeSchema.parse((await client.callTool({ name: 'show_vehicle_report', arguments: { sample: true } })).structuredContent);
    assert.equal(sample.kind, 'report');
    if (sample.kind !== 'report') throw new Error('Sample unavailable');
    assert.equal(sample.report.provenance.kind, 'sample'); assert.equal(sample.report.tests.length, 9); assert.equal(sample.report.observations.length, 2);
    const invalid = outcomeSchema.parse((await client.callTool({ name: 'get_vehicle_history', arguments: { registration: '../bad' } })).structuredContent);
    assert.equal(invalid.kind === 'error' ? invalid.code : null, 'INVALID_REGISTRATION');
    if (health.mode === 'sample') {
      const unavailable = outcomeSchema.parse((await client.callTool({ name: 'get_vehicle_history', arguments: { registration: 'AB12CDE' } })).structuredContent);
      assert.equal(unavailable.kind === 'error' ? unavailable.code : null, 'NOT_CONFIGURED');
    }
    const resource = (await client.readResource({ uri: 'ui://mot-lens/report-v1.html' })).contents[0];
    assert.ok(resource && 'text' in resource); assert.equal(resource.mimeType, 'text/html;profile=mcp-app');
    assert.ok(resource.text.startsWith('<!doctype html>'));
    const ui = z.object({ ui: z.object({ domain: z.url(), csp: z.object({ connectDomains: z.array(z.string()), resourceDomains: z.array(z.string()) }) }) }).parse(resource._meta).ui;
    assert.deepEqual(ui.csp, { connectDomains: [], resourceDomains: [] });
    const widgetVersion = versionSchema.parse(resource.text.match(/<meta name="mot-lens-version" content="([^"]+)"/)?.[1]);
    const foreign = await request(new URL(endpoint), { method: 'POST', headers: { origin: 'https://example.invalid', 'content-type': 'application/json' }, body: '{}' }); assert.equal(foreign.status, 403);
    const oversized = await request(new URL(endpoint), { method: 'POST', headers: { 'content-type': 'application/json' }, body: ' '.repeat(32769) }); assert.equal(oversized.status, 413);
    for (const path of ['/privacy', '/terms']) assert.equal((await request(new URL(path, endpoint))).status, 200);
    const setup = await request(new URL('/', endpoint)); assert.equal(setup.status, 200);
    assert.ok(setup.headers.get('content-type')?.includes('text/html'));
    const setupHtml = await setup.text();
    assert.ok(setupHtml.includes(`value="${health.endpoint}"`));
    assert.ok(setupHtml.includes('Official ChatGPT connection guide') && setupHtml.includes('Official Claude connector guide'));
    return { checkedAt: new Date().toISOString(), endpoint, health, server, widgetVersion,
      tools: tools.map(tool => tool.name), sampleTests: sample.report.tests.length, sampleObservations: sample.report.observations.length,
      resource: { mimeType: resource.mimeType, bytes: Buffer.byteLength(resource.text), sha256: sha256(resource.text), ...ui },
      foreignOriginStatus: foreign.status, oversizedBodyStatus: oversized.status,
      verified: 'Protocol and packaged UI only. This verifier does not test a live vehicle or installed ChatGPT.' };
  } finally { await client.close(); }
}

export function compareObservation(observed: DeploymentObservation, expected: DeploymentExpectation) {
  const values = {
    endpoint: [observed.endpoint, expected.endpoint], publicEndpoint: [observed.health.endpoint, expected.endpoint],
    version: [observed.health.version, expected.version], serverVersion: [observed.server.version, expected.version], widgetVersion: [observed.widgetVersion, expected.version],
    sourceSha: [observed.health.build, expected.sourceSha], widgetSha256: [observed.resource.sha256, expected.widgetSha256],
    uiOrigin: [observed.resource.domain, expected.uiOrigin], mode: [observed.health.mode, expected.mode],
  };
  return Object.entries(values).flatMap(([name, [actual, wanted]]) => actual === wanted ? [] : [`${name}: expected ${wanted}, observed ${actual}`]);
}
