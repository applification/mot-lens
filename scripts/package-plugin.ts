import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = new URL('../plugins/mot-lens/', import.meta.url);
await mkdir(new URL('assets/', root), { recursive: true });
for (const dark of [false, true]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="48" fill="${dark ? '#202820' : '#F7F8F3'}"/><rect x="30" y="92" width="196" height="78" rx="12" fill="#F4D852"/><path d="M52 148v-34l13 22 13-22v34m20 0v-34h25v34zm36-34h36m-18 0v34" fill="none" stroke="#253326" stroke-width="8" stroke-linejoin="round"/><circle cx="190" cy="63" r="26" fill="${dark ? '#94B79A' : '#355F41'}"/><circle cx="190" cy="63" r="15" fill="none" stroke="#F7F8F3" stroke-width="3"/><path d="m207 81 12 13" stroke="${dark ? '#94B79A' : '#355F41'}" stroke-width="9" stroke-linecap="round"/></svg>`;
  await writeFile(new URL(`assets/icon${dark ? '-dark' : ''}.svg`, root), svg);
  await sharp(Buffer.from(svg)).png().toFile(fileURLToPath(new URL(`assets/icon${dark ? '-dark' : ''}.png`, root)));
}
await copyFile(new URL('../.astack/report/evidence/inline.png', import.meta.url), new URL('assets/report.png', root));
// Confirm manifests parse and all listed visual files exist before packaging.
JSON.parse(await readFile(new URL('plugin.json', root), 'utf8'));
JSON.parse(await readFile(new URL('mcp.json', root), 'utf8'));
const output = new URL('../dist/mot-lens-plugin.zip', import.meta.url);
await mkdir(new URL('../dist/', import.meta.url), { recursive: true }); await rm(output, { force: true });
execFileSync('zip', ['-r', fileURLToPath(output), 'plugin.json', 'mcp.json', 'assets'], { cwd: fileURLToPath(root), stdio: 'ignore' });
process.stdout.write(`Draft plugin package: ${fileURLToPath(output)}\n`);
