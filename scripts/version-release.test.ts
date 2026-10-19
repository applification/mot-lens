import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { z } from 'zod';

const root = fileURLToPath(new URL('../', import.meta.url));
const tasksSchema = z.object({ tasks: z.array(z.object({ taskId: z.string(), hash: z.string() })) });
const proofSchema = z.object({ health: z.object({ version: z.string() }), server: z.object({ version: z.string() }), widgetVersion: z.string(), manifestVersion: z.string(), widgetHash: z.string(), embeddedHash: z.string() });
it('a version-only edit changes both Turbo task keys and actual server, widget and plugin identities', async () => {
  await mkdir(join(root, 'test-results'), { recursive: true });
  const fixture = await mkdtemp(join(root, 'test-results/version-'));
  const command = (binary: string, args: string[]) => execFileSync(binary, args, { cwd: fixture, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  try {
    const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0');
    for (const file of files.filter(path => /^(apps\/|packages\/|scripts\/|plugins\/|package.json$|bun.lock$|tsconfig.json$|turbo.json$|wrangler.jsonc$|\.gitignore$)/.test(path))) {
      await mkdir(dirname(join(fixture, file)), { recursive: true }); await cp(join(root, file), join(fixture, file));
    }
    await mkdir(join(fixture, 'node_modules/@mot-lens'), { recursive: true });
    for (const entry of await readdir(join(root, 'node_modules'))) if (entry !== '@mot-lens') await symlink(join(root, 'node_modules', entry), join(fixture, 'node_modules', entry));
    for (const [name, path] of Object.entries({ domain: 'packages/domain', ui: 'packages/ui', mcp: 'apps/mcp', 'mcp-ui': 'apps/mcp-ui' })) await symlink(join(fixture, path), join(fixture, 'node_modules/@mot-lens', name));
    await writeFile(join(fixture, 'identity-proof.ts'), `
import { readFile } from 'node:fs/promises';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createHttpApp } from './apps/mcp/src/http';
import { VehicleService } from './apps/mcp/src/dvsa';
import embedded from './apps/mcp/generated/widget';
import { packagePlugin, validatePluginZip } from './scripts/package-plugin';
import { readProject, sha256 } from './scripts/release-model';
const { metadata, targets } = await readProject(process.cwd());
const target = targets.production;
const html = await readFile('apps/mcp-ui/dist/widget.html', 'utf8');
const app = createHttpApp({ service: new VehicleService({ client: null }), html: embedded, mode: 'sample' });
const client = new Client({ name: 'version-proof', version: '1' });
await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), { fetch: async (input, init) => app.fetch(new Request(input, init)) }));
try {
 const health = await (await app.request('/health')).json();
 const resource = (await client.readResource({ uri: 'ui://mot-lens/report-v1.html' })).contents[0];
 if (!resource || !('text' in resource)) throw new Error('Missing widget');
 const { plugin } = await validatePluginZip(await packagePlugin(process.cwd()), { version: metadata.version, repository: metadata.repository, endpoint: target.endpoint });
 process.stdout.write(JSON.stringify({ health, server: client.getServerVersion(), widgetVersion: resource.text.match(/<meta name="mot-lens-version" content="([^"]+)"/)?.[1], manifestVersion: plugin.version, widgetHash: sha256(html), embeddedHash: sha256(resource.text) }));
} finally { await client.close(); }
`);
    command('git', ['init', '-b', 'main']); command('git', ['add', '.']);
    command('git', ['-c', 'user.name=Version test', '-c', 'user.email=version@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Version fixture']);
    const hashes = () => tasksSchema.parse(JSON.parse(command(join(root, 'node_modules/.bin/turbo'), ['build', '--dry=json']))).tasks;
    const beforeKeys = hashes(); command('bun', ['run', 'build']);
    const before = proofSchema.parse(JSON.parse(command(process.execPath, ['--import', 'tsx', 'identity-proof.ts'])));
    const metadata = JSON.parse(await readFile(join(fixture, 'package.json'), 'utf8'));
    await writeFile(join(fixture, 'package.json'), `${JSON.stringify({ ...metadata, version: '1.2.3-version-proof' }, null, 2)}\n`);
    const afterKeys = hashes();
    for (const taskId of ['@mot-lens/mcp-ui#build', '@mot-lens/mcp#build']) {
      expect(beforeKeys.find(task => task.taskId === taskId)?.hash).toBeDefined();
      expect(afterKeys.find(task => task.taskId === taskId)?.hash).not.toBe(beforeKeys.find(task => task.taskId === taskId)?.hash);
    }
    command('bun', ['run', 'build']);
    const after = proofSchema.parse(JSON.parse(command(process.execPath, ['--import', 'tsx', 'identity-proof.ts'])));
    for (const result of [before, after]) {
      expect(result.health.version).toBe(result.server.version); expect(result.widgetVersion).toBe(result.health.version); expect(result.manifestVersion).toBe(result.health.version); expect(result.embeddedHash).toBe(result.widgetHash);
    }
    expect(after.health.version).toBe('1.2.3-version-proof'); expect(after.widgetHash).not.toBe(before.widgetHash);
    expect(command('git', ['diff', '--name-only']).trim()).toBe('package.json');
  } finally { await rm(fixture, { recursive: true, force: true }); }
}, 60_000);
