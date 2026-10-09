import { readFile, mkdir, writeFile } from 'node:fs/promises';
const widget = await readFile(new URL('../apps/mcp-ui/dist/widget.html', import.meta.url), 'utf8');
await mkdir(new URL('../apps/mcp/generated', import.meta.url), { recursive: true });
const output = new URL('../apps/mcp/generated/widget.ts', import.meta.url);
const source = `// Generated from the verified UI build.\nexport default ${JSON.stringify(widget)};\n`;
// Preserve an unchanged output so a running Node watcher does not restart
// just as the browser verification checks its health endpoint.
if (await readFile(output, 'utf8').catch(() => null) !== source) await writeFile(output, source);
