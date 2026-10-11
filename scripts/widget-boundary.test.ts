import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { widgetBoundary } from './widget-boundary';

const fixtures: string[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(code: string) {
  const root = await mkdtemp(join(tmpdir(), 'mot-lens-widget-boundary-')); fixtures.push(root);
  const files = {
    'apps/mcp-ui/widget.html': '<!doctype html><div id="root"></div><script type="module" src="/src/app.ts"></script>',
    'apps/mcp-ui/index.html': '<!doctype html><script type="module" src="/src/preview.tsx"></script>',
    'apps/mcp-ui/src/app.ts': code,
    'apps/mcp-ui/src/preview.tsx': 'document.body.textContent = "Development preview";',
    'apps/mcp/src/dvsa.ts': 'export const credentials = "Disposable server fixture";',
    'packages/domain/src/index.ts': 'export const registration = "SAMPLE1";',
    'packages/ui/src/index.ts': 'export { registration } from "../../domain/src/index";',
  };
  for (const [path, value] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), value);
  }
  const run = (guard = true, input: string | string[] = 'widget.html') => build({
    configFile: false, root: join(root, 'apps/mcp-ui'), logLevel: 'silent',
    plugins: guard ? [widgetBoundary(root)] : [],
    resolve: { alias: { '@mot-lens/ui': join(root, 'packages/ui/src/index.ts') } },
    build: { write: false, minify: false, rollupOptions: { input } },
  });
  return { root, run };
}

describe('production widget boundary through Vite', () => {
  it.each([
    'fetch("https://example.invalid/vehicle");',
    'const request = window["fetch"]; request("https://example.invalid/token");',
    'new XMLHttpRequest();',
    'new WebSocket("wss://example.invalid");',
    'new EventSource("https://example.invalid/events");',
    'navigator.sendBeacon("https://example.invalid", "record");',
  ])('rejects direct API access: %s', async code => {
    const { run } = await fixture(code);
    await expect(run(false)).resolves.toBeDefined();
    await expect(run()).rejects.toThrow(/app\.ts:1:\d+: Direct browser network APIs.*App.callServerTool/);
  });

  it.each(['process.env.DVSA_CLIENT_SECRET', 'process["env"]["DVSA_API_KEY"]', 'import.meta.env.VITE_DVSA_CLIENT_SECRET', 'const { VITE_DVSA_API_KEY } = import.meta.env'])('rejects browser environment access: %s', async code => {
    const { run } = await fixture(`${code};`);
    await expect(run(false)).resolves.toBeDefined();
    await expect(run()).rejects.toThrow(/Server environment values.*apps\/mcp/);
  });

  it('rejects an aliased, transitive UI-to-server import', async () => {
    const { root, run } = await fixture('import { credentials } from "@mot-lens/ui"; document.body.textContent = credentials;');
    await writeFile(join(root, 'packages/ui/src/index.ts'), 'export { credentials } from "../../../apps/mcp/src/dvsa";');
    await expect(run(false)).resolves.toBeDefined();
    await expect(run()).rejects.toThrow(/apps\/mcp\/src\/dvsa\.ts is server-only.*shared domain\/UI/);
  });

  it.each([
    'import "./preview.tsx";',
    'export * from "./preview.tsx";',
    'void import("./preview.tsx");',
  ])('rejects inclusion of the development host: %s', async code => {
    const { run } = await fixture(code);
    await expect(run(false)).resolves.toBeDefined();
    await expect(run()).rejects.toThrow(/preview\.tsx is server-only or development-only/);
  });

  it.each([
    'import "node:fs";',
    'export * from "@modelcontextprotocol/server";',
    'void import("@modelcontextprotocol/client");',
    'require("@modelcontextprotocol/ext-apps/server");',
  ])('rejects server APIs before resolving them: %s', async code => {
    const { run } = await fixture(code);
    await expect(run()).rejects.toThrow(/Server import .* cannot ship in widget.html.*App.callServerTool/);
  });

  it('rejects computed import paths that bypass an inspectable dependency boundary', async () => {
    const { run } = await fixture('void import(window.location.hash.slice(1));');
    await expect(run()).rejects.toThrow(/Use a static module specifier/);
  });

  it.each(['index.html', ['widget.html', 'index.html']])('rejects a production input other than only widget.html: %s', async input => {
    const { run } = await fixture('document.body.textContent = "Report";');
    await expect(run(false, input)).resolves.toBeDefined();
    await expect(run(true, input)).rejects.toThrow(/production input must be only apps\/mcp-ui\/widget.html/);
  });

  it('allows shared modules, host bridge methods, Vite flags and recorded text; ignores unreached server/preview files', async () => {
    const { run } = await fixture(`
      import { registration } from '@mot-lens/ui';
      import type { Stats } from 'node:fs';
      import { type Dirent } from 'node:fs';
      export { type IncomingMessage } from 'node:http';
      interface RecordedFields { fetch: string; sendBeacon: string }
      const fields: RecordedFields = { fetch: 'wording', sendBeacon: 'wording' };
      const app = { callServerTool: async () => registration, sendMessage: async () => registration };
      void app.callServerTool(); void app.sendMessage();
      // fetch and DVSA_CLIENT_SECRET in comments/record text are data.
      const wording = 'fetch DVSA_CLIENT_SECRET process.env import.meta.env';
      document.body.textContent = wording + registration + Object.values(fields).join('') + import.meta.env.MODE + import.meta.env['DEV'];
    `);
    await expect(run()).resolves.toBeDefined();
  });
});
