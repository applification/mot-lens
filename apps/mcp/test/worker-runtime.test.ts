import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { describe, expect, it } from 'vitest';
import { outcomeSchema } from '@mot-lens/domain';

const script = execFileSync('bun', ['build', fileURLToPath(new URL('./fixtures/dvsa-worker.ts', import.meta.url)), '--target=browser'], { encoding: 'utf8' });
const tokenUrl = 'https://login.microsoftonline.com/fixture/oauth2/v2.0/token';
const vehicleUrl = 'https://history.mot.api.gov.uk/v1/trade/vehicles/registration/AB12CDE';

describe('DVSA requests in the Cloudflare runtime', () => {
  it.each(['none', 'token', 'vehicle'] as const)('handles %s redirects without sending credentials to another origin', async redirectAt => {
    const requests: { url: string; authorization: string | null; apiKey: string | null; body: string }[] = [];
    const runtime = new Miniflare(convertV4MiniflareOptions({
      modules: true, script, compatibilityDate: '2026-10-09', compatibilityFlags: ['nodejs_compat'],
      outboundService: async request => {
        requests.push({ url: request.url, authorization: request.headers.get('authorization'), apiKey: request.headers.get('x-api-key'), body: await request.text() });
        if (request.url === tokenUrl) {
          if (redirectAt === 'token') return new Response(null, { status: 302, headers: { location: 'https://redirect.invalid/token' } });
          return Response.json({ access_token: 'fixture-token', expires_in: 3600 });
        }
        if (request.url === vehicleUrl) {
          if (redirectAt === 'vehicle') return new Response(null, { status: 302, headers: { location: 'https://redirect.invalid/vehicle' } });
          return Response.json({ registration: 'AB12CDE', make: 'FIXTURE', hasOutstandingRecall: 'No', motTests: [] });
        }
        return new Response('Unexpected redirected request', { status: 500 });
      },
    }));
    try {
      const outcome = outcomeSchema.parse(await (await runtime.dispatchFetch('http://localhost/')).json());
      if (redirectAt === 'none') {
        expect(outcome.kind).toBe('report');
        if (outcome.kind !== 'report') throw new Error(outcome.code);
        expect(outcome.report.vehicle.registration).toBe('AB12CDE');
        expect(outcome.report.provenance.kind).toBe('dvsa');
        expect(requests.map(request => request.url)).toEqual([tokenUrl, vehicleUrl]);
        expect(new URLSearchParams(requests[0]?.body).get('client_secret')).toBe('fixture-secret');
        expect(requests[1]?.authorization).toBe('Bearer fixture-token');
        expect(requests[1]?.apiKey).toBe('fixture-api-key');
      } else {
        expect(outcome.kind === 'error' ? outcome.code : null).toBe(redirectAt === 'token' ? 'UPSTREAM_AUTH' : 'UPSTREAM_UNAVAILABLE');
        expect(requests.length).toBe(redirectAt === 'token' ? 1 : 4);
        expect(requests.every(request => request.url === tokenUrl || request.url === vehicleUrl)).toBe(true);
      }
    } finally { await runtime.dispose(); }
  });
});
