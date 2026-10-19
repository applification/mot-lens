import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { packagePlugin, validatePluginZip } from './package-plugin';
import { cleanSource, readProject, sha256, type DeploymentTarget } from './release-model';
import { cloud } from './release';
import { compareObservation, observe } from './verify-hosted';
import { createHttpApp } from '../apps/mcp/src/http';
import { VehicleService } from '../apps/mcp/src/dvsa';

import { artifactSchema } from './release-model';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixtures: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(fixtures.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  await mkdir(join(root, 'test-results'), { recursive: true });
  const path = await mkdtemp(join(root, 'test-results/release-')); fixtures.push(path);
  for (const file of ['package.json', 'wrangler.jsonc', 'plugins']) await cp(join(root, file), join(path, file), { recursive: true });
  return path;
}
async function identity(path: string) {
  const { metadata, targets } = await readProject(path);
  return { version: metadata.version, repository: metadata.repository, endpoint: targets.production.endpoint };
}
function modifyZip(bytes: Uint8Array, change: (files: Record<string, Uint8Array>) => void) {
  const files = unzipSync(bytes); change(files); return zipSync(files);
}

describe.each<{ kind: DeploymentTarget['kind']; worker: string; conflict: string; mode: string }>([
  { kind: 'staging', worker: 'mot-lens-staging', conflict: 'mot-lens', mode: 'sample' },
  { kind: 'production', worker: 'mot-lens', conflict: 'mot-lens-staging', mode: 'live' },
])('release cloud target $kind', ({ kind, worker, conflict, mode }) => {
  it.each(['inherited', 'dotenv', 'both'])('preserves worker identity against %s overrides in a real Wrangler dry run', async source => {
    const path = await fixture(); const { metadata, targets } = await readProject(path);
    expect(JSON.parse(await readFile(join(root, 'node_modules/wrangler/package.json'), 'utf8')).version).toBe(metadata.devDependencies.wrangler);
    await mkdir(join(path, 'apps/mcp/src'), { recursive: true });
    await writeFile(join(path, 'apps/mcp/src/worker.ts'), 'export class DvsaGate {}\nexport default { fetch() { return new Response("release target fixture"); } };\n');
    vi.stubEnv('WRANGLER_CI_OVERRIDE_NAME', source === 'dotenv' ? undefined : conflict);
    if (source !== 'inherited') {
      for (const file of ['.env', '.env.local', '.env.staging', '.env.staging.local']) await writeFile(join(path, file), `WRANGLER_CI_OVERRIDE_NAME=${conflict}\n`);
    }
    const outdir = join(path, 'dry-run');
    const output = cloud(path, targets[kind], ['deploy', '--dry-run', '--outdir', outdir]);
    expect(output).toContain('--dry-run: exiting now.');
    expect(output).toContain(`("${mode}")`);
    expect(await readFile(join(outdir, 'README.md'), 'utf8')).toContain(`worker "${worker}"`);
  });
});

describe('plugin release archive', () => {
  it('packages committed assets deterministically without changing source files', async () => {
    const path = await fixture(); const expected = await identity(path);
    const before = await readFile(join(path, 'plugins/mot-lens/plugin.json'));
    const first = await packagePlugin(path); const second = await packagePlugin(path);
    expect(first).toEqual(second);
    const { plugin, paths } = await validatePluginZip(first, expected);
    expect(plugin.version).toBe(expected.version);
    expect(paths).toEqual(['assets/icon-dark.png', 'assets/icon.png', 'assets/report.png', 'mcp.json', 'plugin.json']);
    expect(await readFile(join(path, 'plugins/mot-lens/plugin.json'))).toEqual(before);
    for (const asset of paths.filter(path => path.startsWith('assets/'))) expect(unzipSync(first)[asset]).toEqual(new Uint8Array(await readFile(join(path, 'plugins/mot-lens', asset))));
  });
  it('rejects missing referenced source assets', async () => {
    const path = await fixture(); await rm(join(path, 'plugins/mot-lens/assets/report.png'));
    await expect(packagePlugin(path)).rejects.toThrow('ENOENT');
  });
  it('rejects malformed archives and malformed manifests', async () => {
    const path = await fixture(); const expected = await identity(path);
    await expect(validatePluginZip(strToU8('not a zip'), expected)).rejects.toThrow();
    const bad = modifyZip(await packagePlugin(path), files => { files['plugin.json'] = strToU8('{'); });
    await expect(validatePluginZip(bad, expected)).rejects.toThrow();
  });
  it('rejects a staging endpoint in the actual ZIP', async () => {
    const path = await fixture(); const expected = await identity(path);
    const bad = modifyZip(await packagePlugin(path), files => {
      const mcp = JSON.parse(strFromU8(files['mcp.json']!)); mcp.mcpServers['mot-lens'].url = 'https://mot-lens-staging.web3-blog.workers.dev/mcp';
      files['mcp.json'] = strToU8(JSON.stringify(mcp));
    });
    await expect(validatePluginZip(bad, expected)).rejects.toThrow('production');
  });
  it('rejects missing ZIP assets, unexpected paths and invalid image content', async () => {
    const path = await fixture(); const expected = await identity(path); const bytes = await packagePlugin(path);
    const nonsquare = await sharp({ create: { width: 128, height: 129, channels: 4, background: '#ffffff' } }).png().toBuffer();
    for (const change of [
      (files: Record<string, Uint8Array>) => { delete files['assets/report.png']; },
      (files: Record<string, Uint8Array>) => { files['../secret'] = strToU8('no'); },
      (files: Record<string, Uint8Array>) => { files['assets/extra.png'] = files['assets/icon.png']!; },
      (files: Record<string, Uint8Array>) => { files['assets/icon.png'] = strToU8('not an image'); },
      (files: Record<string, Uint8Array>) => { files['assets/icon.png'] = nonsquare; },
    ]) await expect(validatePluginZip(modifyZip(bytes, change), expected)).rejects.toThrow();
  });
  it('rejects a wrong product version in the actual ZIP', async () => {
    const path = await fixture(); const expected = await identity(path);
    const bad = modifyZip(await packagePlugin(path), files => {
      const plugin = JSON.parse(strFromU8(files['plugin.json']!)); plugin.version = '99.0.0'; files['plugin.json'] = strToU8(JSON.stringify(plugin));
    });
    await expect(validatePluginZip(bad, expected)).rejects.toThrow('version');
  });
});

describe('release protocol observation', () => {
  it('compares actual initialize, health, widget and target identity and preserves rejection checks', async () => {
    const path = await fixture(); const { metadata, targets } = await readProject(path); const target = targets.staging;
    const sourceSha = cleanFixtureGit(path);
    const html = `<!doctype html><meta name="mot-lens-version" content="${metadata.version}"><title>MOT Lens fixture</title>`;
    const app = createHttpApp({ service: new VehicleService({ client: null }), html, mode: 'sample', publicEndpoint: target.endpoint, widgetDomain: target.uiOrigin, build: sourceSha });
    const observation = await observe(target.endpoint, async (input, init) => app.fetch(new Request(input, init)));
    const expected = { endpoint: target.endpoint, version: metadata.version, sourceSha, widgetSha256: sha256(html), uiOrigin: target.uiOrigin, mode: target.expectedMode };
    expect(compareObservation(observation, expected)).toEqual([]);
    expect(observation).toMatchObject({ foreignOriginStatus: 403, oversizedBodyStatus: 413, sampleTests: 9 });
    expect(compareObservation(observation, { ...expected, version: '9.0.0' })).toHaveLength(3);
    expect(compareObservation(observation, { ...expected, sourceSha: cleanFixtureGit(path, true), widgetSha256: sha256('wrong'), uiOrigin: 'https://wrong.invalid', mode: 'live' })).toHaveLength(4);
  });
});

function cleanFixtureGit(path: string, change = false) {
  const git = (args: string[]) => execFileSync('git', args, { cwd: path, encoding: 'utf8', stdio: 'pipe' });
  if (!change) { git(['init', '-b', 'main']); git(['config', 'user.name', 'Release test']); git(['config', 'user.email', 'release@example.invalid']); git(['add', '.']); }
  git(['-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', change ? 'Next fixture revision' : 'Fixture']);
  return cleanSource(path);
}

function cli(path: string, args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', join(root, 'scripts/release.ts'), ...args], { cwd: path, encoding: 'utf8', timeout: 20_000 });
}
async function preparedFixture() {
  const path = await fixture();
  await writeFile(join(path, '.gitignore'), 'dist/\nnode_modules/\norigin.git/\n');
  await writeFile(join(path, 'bun.lock'), 'fixture lockfile');
  const previous = cleanFixtureGit(path); const sourceSha = cleanFixtureGit(path, true);
  const bytes = await packagePlugin(path); const { metadata } = await readProject(path);
  const artifact = artifactSchema.parse({ version: metadata.version, sourceSha, plugin: { path: `mot-lens-${metadata.version}.zip`, sha256: sha256(bytes) }, widgetSha256: sha256('widget'), lockfileSha256: sha256('different lockfile'), toolchain: { node: process.version, bun: '1.4.0', wrangler: metadata.devDependencies.wrangler } });
  const output = join(path, 'dist/release', metadata.version); await mkdir(output, { recursive: true });
  await writeFile(join(output, artifact.plugin.path), bytes); await writeFile(join(output, 'release.json'), JSON.stringify(artifact));
  await writeFile(join(output, 'SHA256SUMS'), `${artifact.plugin.sha256}  ${artifact.plugin.path}\n`);
  return { path, previous, artifact, output };
}
describe('release CLI preconditions', () => {
  it('rejects invalid versions through the real CLI', async () => {
    const path = await fixture(); const metadata = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
    for (const version of ['v1.2.3', '01.2.3', '1.2', '1.2.3-01']) {
      await writeFile(join(path, 'package.json'), JSON.stringify({ ...metadata, version }));
      const result = cli(path, ['check']); expect(result.status).toBe(1); expect(result.stderr).toContain('semantic version');
    }
  });
  it('refuses dirty source and untracked files before verification starts', async () => {
    const path = await fixture(); cleanFixtureGit(path);
    await writeFile(join(path, 'untracked.txt'), 'new');
    let result = cli(path, ['prepare']); expect(result.status).toBe(1); expect(result.stderr).toContain('clean source'); expect(result.stdout).not.toContain('turbo');
    await rm(join(path, 'untracked.txt')); await writeFile(join(path, 'plugins/mot-lens/assets/report.png'), 'changed evidence');
    result = cli(path, ['prepare']); expect(result.status).toBe(1); expect(result.stderr).toContain('clean source');
  });
  it('rejects a tag that points elsewhere before building or contacting Cloudflare', async () => {
    const path = await fixture(); const sourceSha = cleanFixtureGit(path); const bytes = await packagePlugin(path); const { metadata } = await readProject(path);
    await writeFile(join(path, '.gitignore'), 'dist/\n');
    execFileSync('git', ['add', '.gitignore'], { cwd: path });
    execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-m', 'Ignore outputs'], { cwd: path, stdio: 'pipe' });
    const head = cleanSource(path);
    execFileSync('git', ['tag', `v${metadata.version}`, sourceSha], { cwd: path });
    const output = join(path, 'dist'); await mkdir(output);
    const artifact = artifactSchema.parse({ version: metadata.version, sourceSha: head, plugin: { path: `mot-lens-${metadata.version}.zip`, sha256: sha256(bytes) }, widgetSha256: sha256('widget'), lockfileSha256: sha256('lock'), toolchain: { node: process.version, bun: '1.4.0', wrangler: metadata.devDependencies.wrangler } });
    await writeFile(join(output, artifact.plugin.path), bytes); await writeFile(join(output, 'release.json'), JSON.stringify(artifact));
    const result = cli(path, ['deploy', '--target', 'production', '--artifact', 'dist/release.json']);
    expect(result.status).toBe(1); expect(result.stderr).toContain('does not point at'); expect(result.stdout).not.toContain('turbo');
  });
  it.each(['missing', 'mismatched', 'lightweight', 'annotated'])('checks the exact published %s tag through a local bare origin', async published => {
    const { path, previous, artifact, output } = await preparedFixture();
    const git = (args: string[]) => execFileSync('git', args, { cwd: path, encoding: 'utf8', stdio: 'pipe' });
    const tag = `v${artifact.version}`;
    const publishedTag = published === 'missing' ? `archive/${tag}` : tag;
    git(['-c', 'tag.gpgSign=false', 'tag', ...(published === 'annotated' ? ['-a', '-m', 'Published fixture'] : []), publishedTag, published === 'mismatched' ? previous : artifact.sourceSha]);
    git(['clone', '--bare', path, join(path, 'origin.git')]);
    git(['tag', '-d', publishedTag]);
    git(['-c', 'tag.gpgSign=false', 'tag', tag, artifact.sourceSha]);
    git(['remote', 'add', 'origin', join(path, 'origin.git')]);
    await mkdir(join(path, 'node_modules/wrangler'), { recursive: true });
    await cp(join(root, 'node_modules/wrangler/package.json'), join(path, 'node_modules/wrangler/package.json'));
    expect(cleanSource(path)).toBe(artifact.sourceSha);
    const result = cli(path, ['deploy', '--target', 'production', '--artifact', join(output, 'release.json')]);
    expect(result.status).toBe(1);
    if (published === 'missing') expect(result.stderr).toContain(`requires published tag ${tag} on origin`);
    else if (published === 'mismatched') expect(result.stderr).toContain(`Published tag ${tag} on origin does not point at`);
    else expect(result.stderr).toContain('Lockfile differs from the prepared artifact');
    expect(result.stdout).not.toContain('turbo');
  });
  it('checks a provided ZIP and refuses unknown options and target drift', async () => {
    const path = await fixture(); const bytes = await packagePlugin(path); const zip = join(path, 'plugin.zip'); await writeFile(zip, bytes);
    expect(cli(path, ['check', '--zip', zip]).status).toBe(0);
    expect(cli(path, ['prepare', '--skip-verify']).status).toBe(1);
    const config = JSON.parse(await readFile(join(path, 'wrangler.jsonc'), 'utf8')); config.env.staging.ratelimits[0].namespace_id = config.ratelimits[0].namespace_id;
    await writeFile(join(path, 'wrangler.jsonc'), JSON.stringify(config));
    const result = cli(path, ['check']); expect(result.status).toBe(1); expect(result.stderr).toContain('separate Worker');
  });
});

it('standalone packaging writes an inspection ZIP without changing prepared release files', async () => {
  const { path, artifact, output } = await preparedFixture();
  const files = [artifact.plugin.path, 'release.json', 'SHA256SUMS'];
  const before = await Promise.all(files.map(async file => sha256(await readFile(join(output, file)))));
  const manifestPath = join(path, 'plugins/mot-lens/plugin.json');
  const plugin = JSON.parse(await readFile(manifestPath, 'utf8'));
  plugin.extensions['com.openai'].publication.release_notes += ' Updated for inspection.';
  await writeFile(manifestPath, JSON.stringify(plugin));
  const result = spawnSync(process.execPath, ['--import', 'tsx', join(root, 'scripts/package-plugin.ts')], { cwd: path, encoding: 'utf8', timeout: 20_000 });
  expect(result.status, result.stderr).toBe(0);
  expect(await Promise.all(files.map(async file => sha256(await readFile(join(output, file)))))).toEqual(before);
  const inspection = join(path, 'dist/inspection', artifact.plugin.path);
  expect(result.stdout.trim()).toBe(inspection);
  const bytes = await readFile(inspection);
  await validatePluginZip(bytes, await identity(path));
  expect(sha256(bytes)).not.toBe(artifact.plugin.sha256);
});
