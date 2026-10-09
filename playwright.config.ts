import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', fullyParallel: false, workers: 1, retries: 0,
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1180, height: 900 }, trace: 'retain-on-failure' },
  webServer: [{ command: 'bun run start', url: 'http://127.0.0.1:8787/health', reuseExistingServer: !process.env.CI },
    { command: 'bun run --cwd apps/mcp-ui dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI }],
});
