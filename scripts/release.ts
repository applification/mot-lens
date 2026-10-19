import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { PRODUCT } from '@mot-lens/domain';
import { createHttpApp } from '../apps/mcp/src/http';
import { VehicleService } from '../apps/mcp/src/dvsa';
import { packagePlugin, validatePluginZip } from './package-plugin';
import { artifactSchema, cleanSource, endpointSchema, git, productionTag, readProject, sha256, targetNameSchema, type DeploymentTarget, type ReleaseArtifact } from './release-model';
import { compareObservation, observe, type DeploymentExpectation } from './verify-hosted';

const pathSchema = z.string().min(1);
const commandSchema = z.discriminatedUnion('command', [
  z.strictObject({ command: z.literal('check'), zip: pathSchema.optional() }),
  z.strictObject({ command: z.literal('prepare') }),
  z.strictObject({ command: z.literal('deploy'), target: targetNameSchema, artifact: pathSchema }),
  z.strictObject({ command: z.literal('verify'), target: targetNameSchema, artifact: pathSchema, url: endpointSchema.optional() }),
]);
const deploymentSchema = z.object({ id: z.uuid(), created_on: z.iso.datetime({ offset: true }), versions: z.array(z.object({ version_id: z.uuid(), percentage: z.number().min(0).max(100) })).min(1) });

function run(root: string, args: string[]) { execFileSync('bun', args, { cwd: root, stdio: 'inherit' }); }
async function toolchain(root: string, wrangler: string): Promise<ReleaseArtifact['toolchain']> {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'Use Node 24 or newer');
  const installed = z.object({ version: z.string() }).parse(JSON.parse(await readFile(join(root, 'node_modules/wrangler/package.json'), 'utf8')));
  assert.equal(installed.version, wrangler, 'Installed Wrangler differs from the pinned version');
  return artifactSchema.shape.toolchain.parse({ node: process.version, bun: execFileSync('bun', ['--version'], { cwd: root, encoding: 'utf8' }).trim(), wrangler });
}
function expectation(artifact: ReleaseArtifact, target: DeploymentTarget): DeploymentExpectation {
  return { endpoint: target.endpoint, version: artifact.version, sourceSha: artifact.sourceSha, widgetSha256: artifact.widgetSha256, uiOrigin: target.uiOrigin, mode: target.expectedMode };
}
async function check(root: string, zip?: string) {
  const project = await readProject(root);
  assert.equal(PRODUCT.version, project.metadata.version, 'Product identity must derive from root package.json');
  assert.equal(PRODUCT.repository, project.metadata.repository);
  const bytes = zip ? await readFile(resolve(root, zip)) : await packagePlugin(root);
  await validatePluginZip(bytes, { version: project.metadata.version, repository: project.metadata.repository, endpoint: project.targets.production.endpoint });
  return project;
}
async function jsonFile(path: string, value: unknown) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }
function outputDirectory(root: string, version: string) {
  const path = join(root, 'dist/release', version);
  git(root, ['check-ignore', '--no-index', '--quiet', '--', join(path, 'release.json')]);
  return path;
}
async function readArtifact(root: string, path: string) {
  const artifactPath = resolve(root, path);
  const artifact = artifactSchema.parse(JSON.parse(await readFile(artifactPath, 'utf8')));
  const bytes = await readFile(join(dirname(artifactPath), artifact.plugin.path));
  assert.equal(sha256(bytes), artifact.plugin.sha256, 'Plugin ZIP hash differs from release metadata');
  const project = await readProject(root);
  assert.equal(artifact.version, project.metadata.version, 'Artifact version differs from this checkout');
  await validatePluginZip(bytes, { version: artifact.version, repository: project.metadata.repository, endpoint: project.targets.production.endpoint });
  return { artifact, project };
}
async function verify(artifact: ReleaseArtifact, target: DeploymentTarget, output: string) {
  const observation = await observe(target.endpoint);
  const differences = compareObservation(observation, expectation(artifact, target));
  await jsonFile(output, { expected: expectation(artifact, target), observation, differences });
  assert.deepEqual(differences, [], 'Hosted deployment does not match the prepared artifact');
  return observation;
}
function cloud(root: string, target: DeploymentTarget, args: string[]) {
  return execFileSync('bun', ['x', '--no-install', 'wrangler', ...args, '--config', join(root, 'wrangler.jsonc'), '--env', target.kind === 'staging' ? 'staging' : ''], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false' },
  });
}

export async function runRelease(argv: string[], root = process.cwd()) {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
    zip: { type: 'string' }, target: { type: 'string' }, artifact: { type: 'string' }, url: { type: 'string' },
  } });
  if (positionals.length !== 1) throw new Error('Usage: release check [--zip ZIP] | prepare | deploy --target staging|production --artifact JSON | verify --target staging|production --artifact JSON [--url HTTPS_ENDPOINT]');
  const command = commandSchema.parse({ command: positionals[0], ...values });
  if (command.command === 'check') {
    const { metadata, targets } = await check(root, command.zip);
    process.stdout.write(`${JSON.stringify({ version: metadata.version, targets, checked: 'Focused manifest, image, ZIP and target checks. Not full official JSON-schema validation.' }, null, 2)}\n`);
    return;
  }
  if (command.command === 'prepare') {
    const sourceSha = cleanSource(root);
    const { metadata, targets } = await check(root);
    const tools = await toolchain(root, metadata.devDependencies.wrangler);
    run(root, ['run', 'verify']);
    assert.equal(cleanSource(root), sourceSha, 'Verification changed source');
    const bytes = await packagePlugin(root);
    const html = await readFile(join(root, 'apps/mcp-ui/dist/widget.html'), 'utf8');
    const artifact = artifactSchema.parse({ version: metadata.version, sourceSha,
      plugin: { path: `mot-lens-${metadata.version}.zip`, sha256: sha256(bytes) }, widgetSha256: sha256(html),
      lockfileSha256: sha256(await readFile(join(root, 'bun.lock'))), toolchain: tools,
    });
    const app = createHttpApp({ service: new VehicleService({ client: null }), html, mode: 'sample', build: sourceSha, publicEndpoint: targets.production.endpoint, widgetDomain: targets.production.uiOrigin });
    const observation = await observe(targets.production.endpoint, async (input, init) => app.fetch(new Request(input, init)));
    assert.deepEqual(compareObservation(observation, { ...expectation(artifact, targets.production), mode: 'sample' }), []);
    const output = outputDirectory(root, metadata.version);
    await mkdir(output, { recursive: true });
    await writeFile(join(output, artifact.plugin.path), bytes);
    await validatePluginZip(await readFile(join(output, artifact.plugin.path)), { version: artifact.version, repository: metadata.repository, endpoint: targets.production.endpoint });
    await jsonFile(join(output, 'release.json'), artifact);
    await jsonFile(join(output, 'local-protocol.json'), { ...observation, verified: 'In-process protocol with the built widget and fictional sample. Not hosted or installed ChatGPT proof.' });
    await writeFile(join(output, 'SHA256SUMS'), `${artifact.plugin.sha256}  ${artifact.plugin.path}\n${sha256(await readFile(join(output, 'release.json')))}  release.json\n`);
    assert.equal(cleanSource(root), sourceSha);
    process.stdout.write(`${output}\n${await readFile(join(output, 'SHA256SUMS'), 'utf8')}`);
    return;
  }
  if (command.command === 'verify') {
    const { artifact, project } = await readArtifact(root, command.artifact);
    const target = project.targets[command.target];
    if (command.url) assert.equal(command.url, target.endpoint, 'Explicit URL must match the selected deployment target');
    const output = join(outputDirectory(root, artifact.version), `verify-${target.kind}.json`);
    await verify(artifact, target, output);
    process.stdout.write(`Hosted protocol verified. ${output}\nThis verifier does not test installed ChatGPT acceptance. See docs/SUBMISSION.md.\n`);
    return;
  }
  const sourceSha = cleanSource(root);
  const { artifact, project } = await readArtifact(root, command.artifact);
  assert.equal(sourceSha, artifact.sourceSha, 'HEAD differs from the prepared artifact');
  const target = project.targets[command.target];
  if (target.kind === 'production') {
    productionTag(root, artifact);
    git(root, ['fetch', '--no-tags', 'origin', 'main:refs/remotes/origin/main']);
    git(root, ['merge-base', '--is-ancestor', artifact.sourceSha, 'refs/remotes/origin/main']);
  }
  const tools = await toolchain(root, project.metadata.devDependencies.wrangler);
  assert.equal(tools.bun, artifact.toolchain.bun); assert.equal(tools.wrangler, artifact.toolchain.wrangler);
  assert.equal(sha256(await readFile(join(root, 'bun.lock'))), artifact.lockfileSha256, 'Lockfile differs from the prepared artifact');
  run(root, ['run', 'build']);
  assert.equal(sha256(await readFile(join(root, 'apps/mcp-ui/dist/widget.html'))), artifact.widgetSha256, 'Built widget differs from the prepared artifact');
  assert.equal(sha256(await packagePlugin(root)), artifact.plugin.sha256, 'Packaged source differs from the prepared artifact');
  assert.equal(cleanSource(root), sourceSha);
  const output = join(outputDirectory(root, artifact.version), `deployment-${target.kind}-${Date.now()}.json`);
  const previous = target.kind === 'production' ? deploymentSchema.parse(JSON.parse(cloud(root, target, ['deployments', 'status', '--json']))) : null;
  if (previous) assert.ok(previous.versions.length === 1 && previous.versions[0]?.percentage === 100, 'Record and resolve split production traffic before deploying');
  const rollback = previous ? `bunx wrangler rollback ${previous.versions[0]?.version_id} --env ""` : null;
  const receipt = { checkedAt: new Date().toISOString(), target, sourceSha, previous, rollback };
  await jsonFile(output, { ...receipt, status: 'deploying' });
  let deployed = false; let version: string | null = null;
  try {
    const result = cloud(root, target, ['deploy', '--var', `BUILD_ID:${sourceSha}`]); deployed = true;
    version = z.uuid().parse(result.match(/Current Version ID:\s*([a-f0-9-]{36})/i)?.[1]);
    await jsonFile(output, { ...receipt, status: 'deployed-but-unverified', version });
    process.stdout.write(`Deployed ${target.worker} version ${version}.\n${rollback ? `Rollback command: ${rollback}\n` : 'Staging history was not captured. Inspect deployments list before rollback.\n'}`);
    const observation = await verify(artifact, target, join(dirname(output), `verify-${target.kind}.json`));
    await jsonFile(output, { ...receipt, status: 'verified', version, observation });
    process.stdout.write(`Hosted protocol verified. ${output}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await jsonFile(output, { ...receipt, status: deployed ? 'deployed-but-unverified' : 'deployment-failed-or-unknown', version, error: message });
    throw new Error(`${deployed ? 'Deployed but unverified' : 'Deployment failed or its outcome is unknown'}. Check ${output}. Prior version ${previous?.versions[0]?.version_id ?? 'not recorded for staging'}. ${rollback ?? 'No automatic rollback.'}`, { cause: error });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runRelease(process.argv.slice(2)).catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
