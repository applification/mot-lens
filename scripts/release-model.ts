import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';
import { z } from 'zod';

export const versionSchema = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/, 'Expected a semantic version');
export const sourceShaSchema = z.string().regex(/^[a-f0-9]{40}$/).brand<'SourceSha'>();
export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/).brand<'Sha256'>();
export const endpointSchema = z.url().refine(value => {
  const u = new URL(value);
  return u.protocol === 'https:' && u.pathname === '/mcp' && !u.search && !u.hash && !u.username && !u.password && u.href === value;
}, 'Expected an exact HTTPS /mcp endpoint');
export const targetNameSchema = z.enum(['production', 'staging']);
export const artifactSchema = z.strictObject({
  version: versionSchema,
  sourceSha: sourceShaSchema,
  plugin: z.strictObject({ path: z.string().regex(/^mot-lens-[0-9A-Za-z.+-]+\.zip$/), sha256: digestSchema }),
  widgetSha256: digestSchema,
  lockfileSha256: digestSchema,
  toolchain: z.strictObject({ node: z.string().regex(/^v\d+\.\d+\.\d+$/), bun: z.literal('1.4.0'), wrangler: z.string().regex(/^\d+\.\d+\.\d+$/) }),
});
export type ReleaseArtifact = z.infer<typeof artifactSchema>;
export type DeploymentTarget = {
  kind: z.infer<typeof targetNameSchema>;
  worker: string;
  endpoint: z.infer<typeof endpointSchema>;
  uiOrigin: string;
  expectedMode: 'live' | 'sample';
};

const varsSchema = z.strictObject({ WIDGET_DOMAIN: z.url(), PUBLIC_ENDPOINT: endpointSchema, DATA_MODE: z.enum(['live', 'sample']) })
  .refine(value => new URL(value.PUBLIC_ENDPOINT).origin === value.WIDGET_DOMAIN, 'Widget origin must match the public endpoint');
const bindingsSchema = z.strictObject({ bindings: z.tuple([z.strictObject({ name: z.literal('DVSA_GATE'), class_name: z.literal('DvsaGate') })]) });
const limiterSchema = z.tuple([z.strictObject({ name: z.literal('PUBLIC_LIMITER'), namespace_id: z.string().regex(/^\d+$/), simple: z.strictObject({ limit: z.literal(90), period: z.literal(60) }) })]);
const workerSchema = z.object({ name: z.string(), workers_dev: z.literal(true), routes: z.array(z.strictObject({ pattern: z.string(), custom_domain: z.literal(true) })), vars: varsSchema, durable_objects: bindingsSchema, ratelimits: limiterSchema });
const configSchema = workerSchema.extend({
  main: z.literal('apps/mcp/src/worker.ts'),
  migrations: z.tuple([z.strictObject({ tag: z.literal('v1'), new_sqlite_classes: z.tuple([z.literal('DvsaGate')]) })]),
  env: z.strictObject({ staging: workerSchema.strict() }),
});
export const metadataSchema = z.object({ name: z.literal('mot-lens'), version: versionSchema, repository: z.literal('https://github.com/applification/mot-lens'), packageManager: z.literal('bun@1.4.0'), devDependencies: z.object({ wrangler: z.string().regex(/^\d+\.\d+\.\d+$/) }) });

export async function readProject(root: string) {
  const metadata = metadataSchema.parse(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')));
  const parsed = ts.parseConfigFileTextToJson('wrangler.jsonc', await readFile(join(root, 'wrangler.jsonc'), 'utf8'));
  if (parsed.error) throw new Error('Cannot parse wrangler.jsonc');
  const config = configSchema.parse(parsed.config);
  const staging = config.env.staging;
  if (config.name !== 'mot-lens' || config.routes.length !== 1 || config.routes[0]?.pattern !== 'mot-lens.applification.net' || config.ratelimits[0].namespace_id !== '90121001' || config.vars.PUBLIC_ENDPOINT !== 'https://mot-lens.applification.net/mcp' || config.vars.DATA_MODE !== 'live') throw new Error('Production Worker identity, route, limiter and endpoint must be preserved');
  if (staging.name !== 'mot-lens-staging' || staging.routes.length || staging.vars.PUBLIC_ENDPOINT !== 'https://mot-lens-staging.web3-blog.workers.dev/mcp' || staging.vars.DATA_MODE !== 'sample' || staging.ratelimits[0].namespace_id === config.ratelimits[0].namespace_id) throw new Error('Staging must have a separate Worker, endpoint and limiter, no routes, and sample mode');
  const target = (kind: DeploymentTarget['kind'], worker: z.infer<typeof workerSchema>): DeploymentTarget => ({ kind, worker: worker.name, endpoint: worker.vars.PUBLIC_ENDPOINT, uiOrigin: worker.vars.WIDGET_DOMAIN, expectedMode: worker.vars.DATA_MODE });
  return { metadata, targets: { production: target('production', config), staging: target('staging', staging) } };
}

export function sha256(bytes: string | Uint8Array) { return digestSchema.parse(createHash('sha256').update(bytes).digest('hex')); }
export function git(root: string, args: string[]) { return z.string().parse(execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).trim(); }
export function cleanSource(root: string) {
  if (git(root, ['status', '--porcelain', '--untracked-files=all'])) throw new Error('Release requires a clean source checkout, including tracked evidence and untracked files');
  return sourceShaSchema.parse(git(root, ['rev-parse', 'HEAD']));
}
export function productionTag(root: string, artifact: ReleaseArtifact) {
  const tag = `v${artifact.version}`;
  let revision: string;
  try { revision = git(root, ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`]); }
  catch { throw new Error(`Production requires ${tag} pointing at ${artifact.sourceSha}`); }
  if (revision !== artifact.sourceSha) throw new Error(`Tag ${tag} does not point at the prepared source SHA`);
}
