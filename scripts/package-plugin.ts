import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import sharp from 'sharp';
import { z } from 'zod';
import { readProject, versionSchema } from './release-model';

const assetPathSchema = z.string().regex(/^\.\/assets\/[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpe?g)$/);
const reviewCaseSchema = z.object({ description: z.string().min(1), prompt: z.string().min(1), expected_behavior: z.string().min(1) }).passthrough();
const pluginSchema = z.object({
  $schema: z.literal('https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'), name: z.literal('mot-lens'), version: versionSchema.optional(),
  description: z.string().min(1), homepage: z.url(), repository: z.url(), license: z.literal('MIT'),
  extensions: z.object({ 'com.openai': z.object({
    interface: z.object({ displayName: z.literal('MOT Lens'), supportURL: z.url(), websiteURL: z.url(), privacyPolicyURL: z.url(), termsOfServiceURL: z.url(),
      composerIcon: assetPathSchema, composerIconDark: assetPathSchema, logo: assetPathSchema, logoDark: assetPathSchema, screenshots: z.array(assetPathSchema).min(1).max(5),
    }).passthrough(),
    review: z.object({ test_cases: z.object({ positive: z.array(reviewCaseSchema).length(5), negative: z.array(reviewCaseSchema).length(3) }), commerce: z.literal(false) }).passthrough(),
    publication: z.object({ countries: z.array(z.string()).min(1), release_notes: z.string().min(1) }).passthrough(),
  }).passthrough() }).passthrough(),
}).passthrough();
const mcpSchema = z.strictObject({
  $schema: z.literal('https://agent-plugins.org/schemas/1.0.0/mcp.schema.json'),
  mcpServers: z.strictObject({ 'mot-lens': z.strictObject({ type: z.literal('streamable-http'), url: z.url() }) }),
});
type PackageIdentity = { version: string; repository: string; endpoint: string };
type Plugin = z.infer<typeof pluginSchema>;

function assets(plugin: Plugin) {
  const ui = plugin.extensions['com.openai'].interface;
  return [...new Set([ui.composerIcon, ui.composerIconDark, ui.logo, ui.logoDark, ...ui.screenshots])].sort();
}
function checkIdentity(plugin: Plugin, mcp: z.infer<typeof mcpSchema>, expected: PackageIdentity) {
  assert.equal(plugin.version, expected.version, 'Plugin version must equal the canonical product version');
  assert.equal(plugin.repository, expected.repository); assert.equal(plugin.homepage, expected.repository);
  const ui = plugin.extensions['com.openai'].interface;
  assert.equal(ui.supportURL, `${expected.repository}/issues`);
  const origin = new URL(expected.endpoint).origin;
  assert.equal(ui.websiteURL, `${origin}/`); assert.equal(ui.privacyPolicyURL, `${origin}/privacy`); assert.equal(ui.termsOfServiceURL, `${origin}/terms`);
  assert.equal(mcp.mcpServers['mot-lens'].url, expected.endpoint, 'Plugin ZIP must point at production');
}
async function checkImage(bytes: Uint8Array, path: string, plugin: Plugin) {
  const ui = plugin.extensions['com.openai'].interface;
  const icon = [ui.composerIcon, ui.composerIconDark, ui.logo, ui.logoDark].includes(`./${path}`);
  assert.ok(bytes.length > 0 && bytes.length <= (icon ? 1 : 5) * 1024 * 1024, `Listing image size exceeds limit: ${path}`);
  const image = sharp(bytes, { limitInputPixels: 4096 * 4096 });
  const metadata = await image.metadata();
  assert.ok(metadata.format === 'png' || metadata.format === 'jpeg', `Unsupported listing image format: ${path}`);
  assert.ok(metadata.width && metadata.height && metadata.width <= 4096 && metadata.height <= 4096, `Invalid image dimensions: ${path}`);
  if (icon) assert.ok(metadata.width === metadata.height && metadata.width >= 128, `Invalid icon dimensions: ${path}`);
  if (ui.screenshots.includes(`./${path}`)) assert.ok(metadata.width >= 320 && metadata.height >= 320, `Invalid screenshot dimensions: ${path}`);
  assert.equal(metadata.format === 'png', path.endsWith('.png'), `Image extension differs from its content: ${path}`);
  await image.stats();
}

export async function validatePluginZip(bytes: Uint8Array, expected: PackageIdentity) {
  assert.ok(bytes.length > 0 && bytes.length <= 16 * 1024 * 1024, 'Invalid plugin ZIP size');
  const seen = new Set<string>(); let total = 0;
  const entries = unzipSync(bytes, { filter: file => {
    assert.ok(!seen.has(file.name), `Duplicate ZIP path: ${file.name}`); seen.add(file.name);
    total += file.originalSize;
    assert.ok(seen.size <= 20 && file.originalSize <= 5 * 1024 * 1024 && total <= 20 * 1024 * 1024, 'Plugin ZIP expands beyond listing limits');
    assert.ok(file.name === 'plugin.json' || file.name === 'mcp.json' || assetPathSchema.safeParse(`./${file.name}`).success, `Unsafe or unexpected ZIP path: ${file.name}`);
    return true;
  } });
  const plugin = pluginSchema.parse(JSON.parse(strFromU8(z.instanceof(Uint8Array).parse(entries['plugin.json']))));
  const mcp = mcpSchema.parse(JSON.parse(strFromU8(z.instanceof(Uint8Array).parse(entries['mcp.json']))));
  checkIdentity(plugin, mcp, expected);
  const paths = assets(plugin).map(path => path.slice(2));
  assert.deepEqual(Object.keys(entries).sort(), ['plugin.json', 'mcp.json', ...paths].sort(), 'ZIP must contain only root manifests and their referenced assets');
  for (const path of paths) await checkImage(z.instanceof(Uint8Array).parse(entries[path]), path, plugin);
  return { plugin, mcp, paths: Object.keys(entries).sort() };
}

export async function packagePlugin(root: string) {
  const { metadata, targets } = await readProject(root);
  const expected = { version: metadata.version, repository: metadata.repository, endpoint: targets.production.endpoint };
  const source = join(root, 'plugins/mot-lens');
  const plugin = pluginSchema.parse(JSON.parse(await readFile(join(source, 'plugin.json'), 'utf8')));
  assert.equal(plugin.version, undefined, 'The source manifest must omit version; root package.json owns it');
  const emitted = { ...plugin, version: metadata.version };
  const mcp = mcpSchema.parse(JSON.parse(await readFile(join(source, 'mcp.json'), 'utf8')));
  const files: Record<string, Uint8Array> = {
    'plugin.json': strToU8(`${JSON.stringify(emitted, null, 2)}\n`),
    'mcp.json': strToU8(`${JSON.stringify(mcp, null, 2)}\n`),
  };
  for (const path of assets(plugin)) files[path.slice(2)] = await readFile(join(source, path));
  const bytes = zipSync(Object.fromEntries(Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)), { level: 9, mtime: new Date(2000, 0, 1) });
  await validatePluginZip(bytes, expected);
  return bytes;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd(); const { metadata, targets } = await readProject(root);
  const output = join(root, 'dist/inspection', `mot-lens-${metadata.version}.zip`);
  const bytes = await packagePlugin(root);
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, bytes);
  await validatePluginZip(await readFile(output), { version: metadata.version, repository: metadata.repository, endpoint: targets.production.endpoint });
  process.stdout.write(`${output}\n`);
}
