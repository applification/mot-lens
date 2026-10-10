/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from 'cloudflare:workers';
import html from '../generated/widget';
import { credentialsFromEnv, DvsaClient, VehicleService } from './dvsa';
import { createHttpApp } from './http';
import type { Outcome } from '@mot-lens/domain';
interface Env {
  DVSA_API_KEY?: string; DVSA_CLIENT_ID?: string; DVSA_CLIENT_SECRET?: string; DVSA_TOKEN_URL?: string; DVSA_SCOPE?: string;
  WIDGET_DOMAIN?: string; BUILD_ID?: string; OPENAI_VERIFICATION_TOKEN?: string;
  PUBLIC_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
  DVSA_GATE: DurableObjectNamespace<DvsaGate>;
}
// One named coordinator across regions owns pacing, tokens and the cache.
// Ephemeral memory only: no storage, SQL, alarms or background jobs.
export class DvsaGate extends DurableObject<Env> {
  private readonly service: VehicleService;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const credentials = credentialsFromEnv({ ...env });
    this.service = new VehicleService({ client: credentials ? new DvsaClient({ credentials }) : null });
  }
  async lookup(registration: string): Promise<Outcome> { return await this.service.lookup(registration); }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const credentials = credentialsFromEnv({ ...env });
    const service = { lookup: async (registration: string) => await env.DVSA_GATE.getByName('dvsa').lookup(registration) };
    const app = createHttpApp({ service, html, mode: credentials ? 'live' : 'sample', build: env.BUILD_ID ?? '0.1.0', widgetDomain: env.WIDGET_DOMAIN,
      verificationToken: env.OPENAI_VERIFICATION_TOKEN,
      requestPermit: async req => (await env.PUBLIC_LIMITER.limit({ key: req.headers.get('cf-connecting-ip') ?? 'unknown' })).success });
    return await app.fetch(request);
  },
};
