import { test, expect } from '@playwright/test';

const setupUrl = new URL('/', process.env.MOT_LENS_BROWSER_ENDPOINT ?? 'http://127.0.0.1:8787/mcp').href;
const endpoint = 'https://mot-lens.applification.net/mcp';

test('connection page explains both hosts, copies the public endpoint and fits mobile', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(setupUrl).origin });
  await page.goto(setupUrl);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/MOT history, in your\s*AI conversation\./);
  await expect(page.getByRole('heading', { name: 'ChatGPT', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Claude', exact: true })).toBeVisible();
  await expect(page.getByLabel('MCP server URL · the same for both')).toHaveValue(endpoint);
  await expect(page.getByRole('link', { name: 'Official ChatGPT connection guide' })).toHaveAttribute('href', 'https://developers.openai.com/plugins/deploy/connect-chatgpt');
  await expect(page.getByRole('link', { name: 'Official Claude connector guide' })).toHaveAttribute('href', 'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp');
  await page.getByRole('button', { name: 'Copy MCP server URL' }).click();
  await expect(page.getByRole('status')).toHaveText('Server URL copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(endpoint);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Copy MCP server URL' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('connection URL remains copyable when clipboard access is unavailable', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new DOMException('Clipboard denied', 'NotAllowedError'); } } }));
  await page.goto(setupUrl);
  await page.getByRole('button', { name: 'Copy MCP server URL' }).click();
  await expect(page.getByRole('status')).toHaveText('URL selected. Use your device’s copy command to copy it.');
  const input = page.getByLabel('MCP server URL · the same for both');
  await expect(input).toBeFocused();
  expect(await input.evaluate((element: HTMLInputElement) => element.value.slice(element.selectionStart ?? 0, element.selectionEnd ?? 0))).toBe(endpoint);
});
