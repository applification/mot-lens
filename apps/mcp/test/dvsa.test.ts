import { describe, expect, it } from 'vitest';
import { DvsaClient, LookupFailure, VehicleService, type Credentials } from '../src/dvsa';
const credentials: Credentials = { DVSA_API_KEY: 'test-api-key', DVSA_CLIENT_ID: 'test-client', DVSA_CLIENT_SECRET: 'test-secret', DVSA_TOKEN_URL: 'https://login.microsoftonline.com/test/oauth2/v2.0/token', DVSA_SCOPE: 'https://tapi.dvsa.gov.uk/.default' };
const json = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const vehicle = { registration: 'AB12CDE', make: 'EXAMPLE', hasOutstandingRecall: 'No', motTests: [] };

describe('DVSA boundary', () => {
  it('spaces actual vehicle requests after slow token acquisition', async () => {
    let now = 0; const starts: number[] = [];
    const client = new DvsaClient({ credentials, now: () => now, sleep: async ms => { now += ms; }, fetch: async input => {
      if (String(input).includes('login.microsoftonline')) { now += 1000; return json({ access_token: 'token', expires_in: 3600 }); }
      starts.push(now); return json(vehicle);
    } });
    const results = await Promise.all([client.lookup('AB12CDE'), client.lookup('AB12CDE')]);
    expect(results.map(result => result.registration)).toEqual(['AB12CDE', 'AB12CDE']);
    expect(starts).toEqual([1000, 1350]);
  });
  it.each(['ascii', 'multibyte'] as const)('cancels oversized chunked %s JSON before buffering the whole response', async encoding => {
    const text = JSON.stringify({ ...vehicle, model: (encoding === 'ascii' ? 'x' : '€').repeat(1_100_000) });
    const bytes = new TextEncoder().encode(text); let emitted = 0; let cancelled = false;
    const client = new DvsaClient({ credentials, fetch: async input => {
      if (String(input).includes('login.microsoftonline')) return json({ access_token: 'token', expires_in: 3600 });
      return new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          if (emitted >= bytes.byteLength) { controller.close(); return; }
          const end = Math.min(emitted + 16_384, bytes.byteLength); controller.enqueue(bytes.slice(emitted, end)); emitted = end;
        }, cancel() { cancelled = true; },
      }, { highWaterMark: 0 }));
    } });
    const result = await new VehicleService({ client }).lookup('AB12CDE');
    expect(result.kind === 'error' ? result.code : null).toBe('INVALID_RESPONSE');
    expect(cancelled).toBe(true);
    expect(emitted).toBeLessThanOrEqual(1_015_808);
  });
  it('accepts bounded chunked UTF-8 JSON without corrupting split characters', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ ...vehicle, model: 'Café €' })); let offset = 0;
    const client = new DvsaClient({ credentials, fetch: async input => String(input).includes('login.microsoftonline')
      ? json({ access_token: 'token', expires_in: 3600 })
      : new Response(new ReadableStream<Uint8Array>({ pull(controller) { if (offset === bytes.length) controller.close(); else controller.enqueue(bytes.slice(offset, ++offset)); } })) });
    expect((await client.lookup('AB12CDE')).model).toBe('Café €');
  });
  it('uses current endpoint and both server-side authorization headers, reuses tokens and renews before returned expiry', async () => {
    let now = 100000; let tokenCount = 0; const received: { url: string; headers: Headers; body: string }[] = [];
    const client = new DvsaClient({ credentials, now: () => now, sleep: async () => {}, fetch: async (input, init) => {
      const url = String(input); received.push({ url, headers: new Headers(init?.headers), body: String(init?.body ?? '') });
      if (url.includes('login.microsoftonline')) { tokenCount++; return json({ access_token: `token-${tokenCount}`, expires_in: 120 }); }
      return json(vehicle);
    } });
    expect((await client.lookup('AB12CDE')).make).toBe('EXAMPLE'); await client.lookup('AB12CDE');
    expect(tokenCount).toBe(1); now += 70000; await client.lookup('AB12CDE'); expect(tokenCount).toBe(2);
    expect(received[1]?.url).toBe('https://history.mot.api.gov.uk/v1/trade/vehicles/registration/AB12CDE');
    expect(received[1]?.headers.get('authorization')).toBe('Bearer token-1'); expect(received[1]?.headers.get('x-api-key')).toBe('test-api-key');
    expect(new URLSearchParams(received[0]?.body).get('scope')).toBe('https://tapi.dvsa.gov.uk/.default');
  });
  it('coalesces concurrent vehicle requests and reports truthful cache age', async () => {
    let count = 0; let now = 0;
    const service = new VehicleService({ now: () => now, ttlMs: 10000, client: { lookup: async () => { count++; await Promise.resolve(); return vehicle; } } });
    const results = await Promise.all([service.lookup('ab12 cde'), service.lookup('AB12CDE')]);
    expect(results[0]?.kind).toBe('report'); expect(count).toBe(1);
    now = 5000; const cached = await service.lookup('AB12CDE');
    expect(cached.kind === 'report' ? cached.report.provenance.cacheAgeSeconds : null).toBe(5);
    now = 11000; await service.lookup('AB12CDE'); expect(count).toBe(2);
  });
  it.each([[404, 'MOTH-NF-01', 'NOT_FOUND'], [400, 'MOTH-IV-03', 'INVALID_REGISTRATION'], [403, 'MOTH-AU-01', 'UPSTREAM_AUTH']] as const)('maps %i to a useful error without retrying', async (status, errorCode, expected) => {
    let calls = 0;
    const service = new VehicleService({ client: new DvsaClient({ credentials, sleep: async () => {}, fetch: async input => String(input).includes('login.microsoftonline') ? json({ access_token: 'token', expires_in: 3600 }) : (calls++, json({ errorCode }, status)) }) });
    const result = await service.lookup('AB12CDE'); expect(result.kind === 'error' ? result.code : null).toBe(expected); expect(calls).toBe(1);
  });
  it('respects a daily quota cooldown rather than repeatedly querying DVSA', async () => {
    let calls = 0;
    const service = new VehicleService({ client: new DvsaClient({ credentials, sleep: async () => {}, fetch: async input => String(input).includes('login.microsoftonline') ? json({ access_token: 'token', expires_in: 3600 }) : (calls++, json({ errorCode: 'MOTH-RL-01' }, 429)) }) });
    const first = await service.lookup('AB12CDE'); const second = await service.lookup('AB13CDE');
    expect(first.kind === 'error' ? first.retryAfterSeconds : null).toBe(86400); expect(second.kind).toBe('error'); expect(calls).toBe(1);
  });
  it('recovers from a transient upstream failure but bounds retries', async () => {
    let calls = 0;
    const client = new DvsaClient({ credentials, sleep: async () => {}, fetch: async input => String(input).includes('login.microsoftonline') ? json({ access_token: 'token', expires_in: 3600 }) : (++calls < 3 ? json({ error: 'busy' }, 503) : json(vehicle)) });
    expect((await client.lookup('AB12CDE')).registration).toBe('AB12CDE'); expect(calls).toBe(3);
  });
  it('handles missing history, rejects legacy arrays and does not cache failed lookups', async () => {
    let response: unknown = [vehicle]; let calls = 0;
    const service = new VehicleService({ client: new DvsaClient({ credentials, sleep: async () => {}, fetch: async input => String(input).includes('login.microsoftonline') ? json({ access_token: 'token', expires_in: 3600 }) : (calls++, json(response)) }) });
    const invalid = await service.lookup('AB12CDE'); expect(invalid.kind === 'error' ? invalid.code : null).toBe('INVALID_RESPONSE');
    response = { registration: 'AB12CDE', hasOutstandingRecall: 'Unknown', motTestDueDate: '2027-01-01' }; const empty = await service.lookup('AB12CDE');
    expect(empty.kind === 'report' ? empty.report.tests : null).toEqual([]); expect(calls).toBe(2);
  });
  it('does not replace a real lookup with sample data when credentials are absent', async () => {
    const result = await new VehicleService({ client: null }).lookup('AB12CDE'); expect(result.kind === 'error' ? result.code : null).toBe('NOT_CONFIGURED');
  });
  it('recovers from temporary token service failures and respects token rate limits', async () => {
    let tokens = 0;
    const client = new DvsaClient({ credentials, sleep: async () => {}, fetch: async input => {
      if (String(input).includes('login.microsoftonline')) return ++tokens === 1 ? new Response('Temporary failure', { status: 503 }) : json({ access_token: 'token', expires_in: 3600 });
      return json(vehicle);
    } });
    expect((await client.lookup('AB12CDE')).registration).toBe('AB12CDE'); expect(tokens).toBe(2);
    const limited = new VehicleService({ client: new DvsaClient({ credentials, fetch: async () => new Response('Slow down', { status: 429, headers: { 'retry-after': '120' } }) }) });
    const result = await limited.lookup('AB12CDE');
    expect(result.kind === 'error' ? [result.code, result.retryAfterSeconds, result.retryable] : null).toEqual(['RATE_LIMITED', 120, true]);
  });
  it('rejects empty objects and malformed test records instead of displaying an empty history', async () => {
    for (const response of [{}, { ...vehicle, motTests: [{}] }, { ...vehicle, motTests: null }]) {
      const service = new VehicleService({ client: new DvsaClient({ credentials, fetch: async input => String(input).includes('login.microsoftonline') ? json({ access_token: 'token', expires_in: 3600 }) : json(response) }) });
      const result = await service.lookup('AB12CDE');
      expect(result.kind === 'error' ? result.code : null).toBe('INVALID_RESPONSE');
    }
  });
  it('renews once for the documented expired-token 403 and retries HTML server errors', async () => {
    let tokens = 0; let calls = 0;
    const client = new DvsaClient({ credentials, sleep: async () => {}, fetch: async input => {
      if (String(input).includes('login.microsoftonline')) return json({ access_token: `token-${++tokens}`, expires_in: 3600 });
      calls++;
      if (calls === 1) return json({ errorCode: 'MOTH-FB-02' }, 403);
      if (calls === 2) return new Response('<html>Unavailable</html>', { status: 503 });
      return json(vehicle);
    } });
    expect((await client.lookup('AB12CDE')).registration).toBe('AB12CDE'); expect(tokens).toBe(2); expect(calls).toBe(3);
  });
  it('propagates known failures safely', async () => {
    const service = new VehicleService({ client: { lookup: async () => { throw new LookupFailure({ kind: 'error', code: 'UPSTREAM_UNAVAILABLE', message: 'Temporary failure', retryable: true }); } } });
    expect(await service.lookup('AB12CDE')).toEqual({ kind: 'error', code: 'UPSTREAM_UNAVAILABLE', message: 'Temporary failure', retryable: true });
  });
});
