import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['packages/**/*.test.ts', 'apps/mcp/**/*.test.ts'], testTimeout: 10000 } });
