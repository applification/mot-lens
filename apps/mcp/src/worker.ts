/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from 'cloudflare:workers';
import html from '../generated/widget';
import { credentialsFromEnv, DvsaClient, VehicleService } from './dvsa';
import { createHttpApp } from './http';
import { z } from 'zod';
import type { Outcome } from '@mot-lens/domain';
interface Env {
  DVSA_API_KEY?: string; DVSA_CLIENT_ID?: string; DVSA_CLIENT_SECRET?: string; DVSA_TOKEN_URL?: string; DVSA_SCOPE?: string;
  WIDGET_DOMAIN: string; PUBLIC_ENDPOINT: string; DATA_MODE: 'sample' | 'live'; BUILD_ID?: string; OPENAI_VERIFICATION_TOKEN?: string;
  PUBLIC_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
  DVSA_GATE: DurableObjectNamespace<DvsaGate>;
}
const configuration = z.object({
  WIDGET_DOMAIN: z.url().refine(value => new URL(value).origin === value),
  PUBLIC_ENDPOINT: z.url().refine(value => { const u = new URL(value); return u.protocol === 'https:' && u.pathname === '/mcp' && !u.search && !u.hash && !u.username && !u.password; }),
  DATA_MODE: z.enum(['sample', 'live']),
  BUILD_ID: z.string().regex(/^[a-f0-9]{40}$/).optional(),
}).refine(value => new URL(value.PUBLIC_ENDPOINT).origin === value.WIDGET_DOMAIN);

// One named coordinator across regions owns pacing, tokens and the cache.
// Ephemeral memory only: no storage, SQL, alarms or background jobs.
export class DvsaGate extends DurableObject<Env> {
  private readonly service: VehicleService;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const config = configuration.parse(env);
    const credentials = config.DATA_MODE === 'live' ? credentialsFromEnv({ ...env }) : null;
    this.service = new VehicleService({ client: credentials ? new DvsaClient({ credentials }) : null });
  }
  async lookup(registration: string): Promise<Outcome> { return await this.service.lookup(registration); }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const config = configuration.parse(env);
    const credentials = config.DATA_MODE === 'live' ? credentialsFromEnv({ ...env }) : null;
    const service = { lookup: async (registration: string) => await env.DVSA_GATE.getByName('dvsa').lookup(registration) };
    const app = createHttpApp({ service, html, mode: credentials ? 'live' : 'sample', build: config.BUILD_ID ?? 'development', widgetDomain: config.WIDGET_DOMAIN, publicEndpoint: config.PUBLIC_ENDPOINT,
      verificationToken: config.DATA_MODE === 'live' ? env.OPENAI_VERIFICATION_TOKEN : undefined,
      requestPermit: async req => (await env.PUBLIC_LIMITER.limit({ key: req.headers.get('cf-connecting-ip') ?? 'unknown' })).success });
    return await app.fetch(request);
  },
};
