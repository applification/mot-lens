import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import { widgetBoundary } from '../../scripts/widget-boundary.ts';
export default defineConfig({ plugins: [widgetBoundary(fileURLToPath(new URL('../..', import.meta.url))), react(), viteSingleFile()], build: {
  rollupOptions: { input: 'widget.html' }, cssCodeSplit: false, target: 'es2022',
}, server: { fs: { allow: ['../..'] } } });
