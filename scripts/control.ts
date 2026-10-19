import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { PRODUCT, outcomeSchema, reportSummary, selectedContext } from '@mot-lens/domain';

const [command = 'doctor', argument] = process.argv.slice(2);
const endpoint = new URL(process.env.MOT_LENS_ENDPOINT ?? 'http://127.0.0.1:8787/mcp');
if (!['doctor', 'tools', 'sample', 'lookup', 'resource'].includes(command)) throw new Error('Usage: bun run control doctor|tools|sample|lookup REGISTRATION|resource');
const client = new Client({ name: 'mot-lens-control', version: PRODUCT.version });
try {
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  if (command === 'doctor') {
    const response = await fetch(new URL('/health', endpoint));
    const identity = z.object({ app: z.literal('mot-lens'), status: z.literal('ok'), mode: z.enum(['sample', 'live']), build: z.string() }).parse(await response.json());
    process.stdout.write(`${JSON.stringify({ endpoint: endpoint.href, ...identity, tools: (await client.listTools()).tools.map(tool => tool.name) }, null, 2)}\n`);
  } else if (command === 'tools') process.stdout.write(`${JSON.stringify((await client.listTools()).tools, null, 2)}\n`);
  else if (command === 'resource') {
    const result = await client.readResource({ uri: 'ui://mot-lens/report-v1.html' }); const resource = result.contents[0];
    if (!resource || !('text' in resource) || resource.mimeType !== 'text/html;profile=mcp-app' || !resource.text.includes('<!doctype html>')) throw new Error('Invalid MCP App resource');
    process.stdout.write(`${JSON.stringify({ uri: resource.uri, mimeType: resource.mimeType, bytes: Buffer.byteLength(resource.text), metadata: resource._meta })}\n`);
  } else {
    if (command === 'lookup' && !argument) throw new Error('Supply a registration: bun run control lookup "AB12 CDE"');
    const result = await client.callTool({ name: command === 'sample' ? 'show_vehicle_report' : 'get_vehicle_history', arguments: command === 'sample' ? { sample: true } : { registration: argument } });
    const outcome = outcomeSchema.parse(result.structuredContent);
    process.stdout.write(`${outcome.kind === 'report' ? reportSummary(outcome.report) : `${outcome.code}: ${outcome.message}`}\n`);
    if (outcome.kind === 'report') process.stdout.write(`${JSON.stringify({ provenance: outcome.report.provenance, testIds: outcome.report.tests.map(test => test.id), context: selectedContext(outcome.report, undefined) })}\n`);
    else process.exitCode = 2;
  }
} finally { await client.close(); }
