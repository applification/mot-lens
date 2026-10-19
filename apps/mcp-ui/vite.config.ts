import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import { PRODUCT } from '../../packages/domain/src/identity.ts';
import { widgetBoundary } from '../../scripts/widget-boundary.ts';
export default defineConfig({ plugins: [{ name: 'mot-lens-identity', transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'mot-lens-version', content: PRODUCT.version }, injectTo: 'head' }] }, widgetBoundary(fileURLToPath(new URL('../..', import.meta.url))), react(), viteSingleFile()], build: {
  rollupOptions: { input: 'widget.html' }, cssCodeSplit: false, target: 'es2022',
}, server: { fs: { allow: ['../..'] } } });
