import { z } from 'zod';
import { makeReport, normalizeRegistration, rawTestSchema, rawVehicleSchema, type LookupError, type Outcome, type RawVehicle } from '@mot-lens/domain';
import { BodyTooLarge, readBoundedBody } from './body';

const credentialSchema = z.object({
  DVSA_API_KEY: z.string().min(1), DVSA_CLIENT_ID: z.string().min(1), DVSA_CLIENT_SECRET: z.string().min(1),
  DVSA_TOKEN_URL: z.url().refine(value => new URL(value).hostname === 'login.microsoftonline.com' && new URL(value).protocol === 'https:', 'Use the Microsoft Entra token URL issued by DVSA'),
  DVSA_SCOPE: z.string().min(1),
});
export type Credentials = z.infer<typeof credentialSchema>;
export function credentialsFromEnv(env: Record<string, unknown>): Credentials | null {
  const parsed = credentialSchema.safeParse(env); return parsed.success ? parsed.data : null;
}

export class LookupFailure extends Error {
  constructor(public readonly outcome: LookupError) { super(outcome.message); }
}
const failure = (code: LookupError['code'], message: string, retryable = false, retryAfterSeconds?: number) =>
  new LookupFailure({ kind: 'error', code, message, retryable, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) });
const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.coerce.number().positive(), token_type: z.string().optional() });
const errorBodySchema = z.object({ errorCode: z.string().optional() });
// Required marker common to both current vehicle response variants. Recall
// information is validated here and omitted from this MOT-only product.
const upstreamVehicleSchema = rawVehicleSchema.extend({
  hasOutstandingRecall: z.enum(['Yes', 'No', 'Unknown', 'Unavailable']),
  motTests: z.array(rawTestSchema.extend({ completedDate: z.iso.datetime({ offset: true }).nullable(),
    testResult: z.enum(['PASSED', 'FAILED']), odometerResultType: z.enum(['READ', 'UNREADABLE', 'NO_ODOMETER']),
    dataSource: z.enum(['DVSA', 'DVA NI', 'CVS']),
  }).refine(test => test.completedDate !== null || test.dataSource === 'CVS', 'Only CVS tests may have no completed date')).optional(),
});

export class DvsaClient {
  private token: { value: string; expiresAt: number } | null = null;
  private tokenFlight: Promise<string> | null = null;
  private tail: Promise<void> = Promise.resolve();
  private queued = 0;
  private nextRequestAt = 0;
  private cooldownUntil = 0;
  constructor(private readonly options: { credentials: Credentials; fetch?: typeof fetch;
    now?: () => number; sleep?: (ms: number) => Promise<void>; upstreamPermit?: () => Promise<boolean> }) {}
  private now() { return (this.options.now ?? Date.now)(); }
  private sleep(ms: number) { return (this.options.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms))))(ms); }
  private async json(response: Response): Promise<unknown> {
    let bytes: Uint8Array;
    try { bytes = await readBoundedBody(response, 1_000_000); }
    catch (error) {
      if (error instanceof BodyTooLarge) throw failure('INVALID_RESPONSE', 'DVSA returned an unusually large response. Please try again later.', true);
      throw error;
    }
    try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw failure('INVALID_RESPONSE', 'DVSA returned an unreadable response. Please try again later.', true); }
  }
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now() + 60_000) return this.token.value;
    if (this.tokenFlight) return this.tokenFlight;
    this.tokenFlight = (async () => {
      const c = this.options.credentials;
      const response = await (this.options.fetch ?? fetch)(c.DVSA_TOKEN_URL, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: c.DVSA_CLIENT_ID,
          client_secret: c.DVSA_CLIENT_SECRET, scope: c.DVSA_SCOPE }), signal: AbortSignal.timeout(8000), redirect: 'manual',
      });
      if (response.status === 429) {
        const supplied = Number(response.headers.get('retry-after') ?? 60);
        const delay = Number.isFinite(supplied) ? Math.max(1, Math.min(supplied, 86400)) : 60;
        this.cooldownUntil = this.now() + delay * 1000;
        throw failure('RATE_LIMITED', 'DVSA authentication is temporarily limited. Please try again after the indicated wait.', true, delay);
      }
      if (response.status >= 500) throw failure('UPSTREAM_UNAVAILABLE', 'DVSA authentication is temporarily unavailable. Please try again later.', true);
      if (!response.ok) throw failure('UPSTREAM_AUTH', 'DVSA authentication is unavailable. The service operator needs to check the API credentials.');
      const parsed = tokenSchema.safeParse(await this.json(response));
      if (!parsed.success) throw failure('UPSTREAM_AUTH', 'DVSA authentication returned an unexpected response.');
      this.token = { value: parsed.data.access_token, expiresAt: this.now() + parsed.data.expires_in * 1000 };
      return this.token.value;
    })();
    try { return await this.tokenFlight; } finally { this.tokenFlight = null; }
  }
  async lookup(registration: string): Promise<RawVehicle> {
    if (this.queued >= 8) throw failure('RATE_LIMITED', 'MOT Lens is busy. Please try again shortly.', true, 10);
    this.queued++;
    const ahead = this.tail; let release: () => void = () => {};
    this.tail = new Promise<void>(resolve => { release = resolve; });
    await ahead;
    try {
      if (this.cooldownUntil > this.now()) throw failure('RATE_LIMITED', 'DVSA has temporarily limited requests. Please try again after the indicated wait.', true, Math.ceil((this.cooldownUntil - this.now()) / 1000));
      let refreshed = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const token = await this.accessToken();
          if (this.options.upstreamPermit && !await this.options.upstreamPermit()) throw failure('RATE_LIMITED', 'MOT Lens is limiting upstream requests. Please try again shortly.', true, 10);
          const wait = Math.max(0, this.nextRequestAt - this.now()); if (wait) await this.sleep(wait);
          this.nextRequestAt = this.now() + 350;
          const response = await (this.options.fetch ?? fetch)(`https://history.mot.api.gov.uk/v1/trade/vehicles/registration/${encodeURIComponent(registration)}`, {
            headers: { Authorization: `Bearer ${token}`, 'X-API-Key': this.options.credentials.DVSA_API_KEY, Accept: 'application/json' },
            signal: AbortSignal.timeout(8000), redirect: 'manual',
          });
          if (response.status === 403) {
            const detail = errorBodySchema.safeParse(await this.json(response).catch(() => ({})));
            if (detail.success && detail.data.errorCode === 'MOTH-FB-02' && !refreshed) { this.token = null; refreshed = true; continue; }
          }
          if (response.status === 401 && !refreshed) { this.token = null; refreshed = true; continue; }
          if (response.status === 401 || response.status === 403) throw failure('UPSTREAM_AUTH', 'DVSA access is unavailable. The service operator needs to check the API credentials.');
          if (response.status === 404) throw failure('NOT_FOUND', `No vehicle was found for ${registration}. Check the registration and try again.`);
          if (response.status === 400) throw failure('INVALID_REGISTRATION', 'DVSA did not accept this registration. Check it and try again.');
          if (response.status === 429) {
            const body = await this.json(response).catch(() => ({}));
            const error = errorBodySchema.safeParse(body);
            const retry = response.headers.get('retry-after');
            const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? Math.max(0, Math.ceil((Date.parse(retry) - this.now()) / 1000)) : 60;
            const delay = error.success && error.data.errorCode === 'MOTH-RL-01' ? 86400 : Number.isFinite(seconds) ? Math.max(1, Math.min(seconds, 86400)) : 60;
            this.cooldownUntil = this.now() + delay * 1000;
            throw failure('RATE_LIMITED', 'DVSA has temporarily limited requests. Please try again after the indicated wait.', true, delay);
          }
          if (!response.ok) throw failure('UPSTREAM_UNAVAILABLE', 'DVSA is temporarily unavailable. Please try again later.', true);
          const body = await this.json(response);
          const parsed = upstreamVehicleSchema.safeParse(body);
          if (!parsed.success) throw failure('INVALID_RESPONSE', 'DVSA returned records in an unexpected format. Please try again later.', true);
          if (parsed.data.registration && normalizeRegistration(parsed.data.registration) !== registration) throw failure('INVALID_RESPONSE', 'DVSA returned a different registration. No report has been displayed.', true);
          const { hasOutstandingRecall: _recall, ...vehicle } = parsed.data;
          return vehicle;
        } catch (error) {
          if (error instanceof LookupFailure && error.outcome.code !== 'UPSTREAM_UNAVAILABLE') throw error;
          if (attempt === 2) throw error instanceof LookupFailure ? error : failure('UPSTREAM_UNAVAILABLE', 'DVSA could not be reached. Please try again later.', true);
          await this.sleep(250 * 2 ** attempt + Math.floor(Math.random() * 100));
        }
      }
      throw failure('UPSTREAM_AUTH', 'DVSA access could not be renewed.');
    } finally { this.queued--; release(); }
  }
}

export class VehicleService {
  private readonly cache = new Map<string, { vehicle: RawVehicle; retrievedAt: string }>();
  private readonly inFlight = new Map<string, Promise<Outcome>>();
  constructor(private readonly options: { client: Pick<DvsaClient, 'lookup'> | null; now?: () => number; ttlMs?: number }) {}
  async lookup(input: string): Promise<Outcome> {
    const registration = normalizeRegistration(input);
    if (!registration) return { kind: 'error', code: 'INVALID_REGISTRATION', message: 'Enter a UK registration using letters and numbers (for example AB12 CDE). Spaces are allowed.', retryable: false };
    if (!this.options.client) return { kind: 'error', code: 'NOT_CONFIGURED', message: 'Live DVSA lookups are not configured yet. You can open the clearly labelled sample report.', retryable: false };
    const now = (this.options.now ?? Date.now)(); const cached = this.cache.get(registration);
    if (cached && now - Date.parse(cached.retrievedAt) < (this.options.ttlMs ?? 900_000)) {
      return { kind: 'report', report: makeReport({ ...cached, kind: 'dvsa', servedAt: new Date(now).toISOString() }) };
    }
    if (this.inFlight.has(registration)) return await this.inFlight.get(registration) ?? this.lookup(input);
    if (this.inFlight.size >= 8) return { kind: 'error', code: 'RATE_LIMITED', message: 'MOT Lens is busy. Please try again shortly.', retryable: true, retryAfterSeconds: 10 };
    const client = this.options.client;
    const request = (async (): Promise<Outcome> => {
      try {
        const vehicle = await client.lookup(registration);
        const retrievedAt = new Date((this.options.now ?? Date.now)()).toISOString();
        this.cache.delete(registration); this.cache.set(registration, { vehicle, retrievedAt });
        if (this.cache.size > 256) { const first = this.cache.keys().next().value; if (first) this.cache.delete(first); }
        return { kind: 'report', report: makeReport({ vehicle, kind: 'dvsa', retrievedAt }) };
      } catch (error) {
        return error instanceof LookupFailure ? error.outcome : { kind: 'error', code: 'UPSTREAM_UNAVAILABLE', message: 'The MOT history service is temporarily unavailable. Please try again later.', retryable: true };
      }
    })();
    this.inFlight.set(registration, request);
    try { return await request; } finally { this.inFlight.delete(registration); }
  }
}
