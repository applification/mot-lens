import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({ plugins: [react(), viteSingleFile()], build: {
  rollupOptions: { input: 'widget.html' }, cssCodeSplit: false, target: 'es2022',
}, server: { fs: { allow: ['../..'] } } });
