import { readFile, mkdir, writeFile } from 'node:fs/promises';
const widget = await readFile(new URL('../apps/mcp-ui/dist/widget.html', import.meta.url), 'utf8');
await mkdir(new URL('../apps/mcp/generated', import.meta.url), { recursive: true });
await writeFile(new URL('../apps/mcp/generated/widget.ts', import.meta.url), `// Generated from the verified UI build.\nexport default ${JSON.stringify(widget)};\n`);
