import { test, expect, type Page } from '@playwright/test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { makeReport } from '@mot-lens/domain';

const report = (make: string, registration: string, number: string) => ({ kind: 'report', report: makeReport({
  kind: 'sample', retrievedAt: '2026-10-10T00:00:00Z', vehicle: { make, registration, motTests: [{
    motTestNumber: number, completedDate: '2026-01-01T12:00:00Z', testResult: 'PASSED',
    odometerValue: '10000', odometerUnit: 'MI', odometerResultType: 'READ', defects: [],
  }] },
}) });
const first = report('FIRST', 'FIRST1', 'A'); const second = report('SECOND', 'SECOND2', 'B');
const sample = report('OLD SAMPLE', 'SAMPLE1', 'OLD');
const scriptValue = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c');
let widget: string;

test.beforeAll(async () => {
  const client = new Client({ name: 'mot-lens-lifecycle-tests', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(process.env.MOT_LENS_BROWSER_ENDPOINT ?? 'http://127.0.0.1:8787/mcp')));
  try {
    const resource = await client.readResource({ uri: 'ui://mot-lens/report-v1.html' }); const content = resource.contents[0];
    if (!content || !('text' in content) || content.mimeType !== 'text/html;profile=mcp-app') throw new Error('Expected production MCP App resource');
    widget = content.text;
  } finally { await client.close(); }
});

// A controllable JSON-RPC host exercises the shipped resource, including delayed
// replies. All tool records are local fixtures; no DVSA or conversation is called.
async function openHost(page: Page) {
  const html = `<!doctype html><meta charset="utf-8"><body>
    <button id="hold-context">Hold context replies</button><button id="release-context">Release context reply</button>
    <button id="hold-tools">Hold sample replies</button><button id="release-tool">Release sample reply</button>
    <button id="second">Load second vehicle</button><button id="cancel">Cancel lookup</button><button id="teardown">Teardown</button>
    <pre id="context"></pre><pre id="messages">[]</pre><pre id="pending">0</pre><pre id="tool-pending">0</pre><pre id="closed">false</pre>
    <iframe title="MOT Lens lifecycle fixture" style="width:100%;height:1200px"></iframe><script>
    const frame = document.querySelector('iframe'); let holdContext = false, holdTools = false;
    const contexts = [], tools = [], messages = [];
    const respond = (request, result) => frame.contentWindow.postMessage({jsonrpc:'2.0', id:request.id, result}, '*');
    const send = (method, params) => frame.contentWindow.postMessage({jsonrpc:'2.0', method, params}, '*');
    const deliver = outcome => send('ui/notifications/tool-result', {content:[], structuredContent:outcome});
    const showPending = () => { document.querySelector('#pending').textContent = contexts.length; document.querySelector('#tool-pending').textContent = tools.length; };
    document.querySelector('#hold-context').onclick = () => { holdContext = true; };
    document.querySelector('#release-context').onclick = () => { const request = contexts.shift(); if(request) respond(request, {}); showPending(); };
    document.querySelector('#hold-tools').onclick = () => { holdTools = true; };
    document.querySelector('#release-tool').onclick = () => { const request = tools.shift(); if(request) respond(request, {content:[], structuredContent:${scriptValue(sample)}}); showPending(); };
    document.querySelector('#second').onclick = () => { send('ui/notifications/tool-input', {arguments:{registration:'SECOND2'}}); deliver(${scriptValue(second)}); };
    document.querySelector('#cancel').onclick = () => send('ui/notifications/tool-cancelled', {reason:'Fixture cancellation'});
    document.querySelector('#teardown').onclick = () => frame.contentWindow.postMessage({jsonrpc:'2.0', id:'teardown', method:'ui/resource-teardown', params:{}}, '*');
    window.addEventListener('message', event => {
      if(event.source !== frame.contentWindow) return; const data = event.data;
      if(data.id === 'teardown') document.querySelector('#closed').textContent = 'true';
      if(data.method === 'ui/initialize') respond(data, {protocolVersion:'2026-01-26', hostInfo:{name:'Lifecycle fixture',version:'1'}, hostCapabilities:{updateModelContext:{},message:{},serverTools:{}}, hostContext:{theme:'light',displayMode:'inline',availableDisplayModes:['inline','fullscreen']}});
      else if(data.method === 'ui/notifications/initialized') deliver(${scriptValue(first)});
      else if(data.method === 'ui/update-model-context') {
        document.querySelector('#context').textContent = data.params.content[0].text;
        if(holdContext) contexts.push(data); else respond(data, {}); showPending();
      } else if(data.method === 'tools/call') { if(holdTools) tools.push(data); else respond(data,{content:[],structuredContent:${scriptValue(sample)}}); showPending(); }
      else if(data.method === 'ui/message') { messages.push(data.params); document.querySelector('#messages').textContent = JSON.stringify(messages); respond(data, {}); }
      else if(data.method === 'ui/request-display-mode') respond(data, {mode:data.params.mode});
    });
    frame.srcdoc = ${scriptValue(widget)};
  </script></body>`;
  await page.route('**/lifecycle-fixture', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto('/lifecycle-fixture');
  const app = page.frameLocator('iframe'); await expect(app.getByRole('heading', { name: 'First', exact: true })).toBeVisible();
  await expect(page.locator('#context')).toContainText('FIRST1'); return app;
}
const reading = '1 Jan 2026, 12:00: 10,000 mi, PASSED';
async function settleMessages(page: Page) {
  // Flush posted replies and React's next paint before checking an ignored result.
  await page.frameLocator('iframe').locator('body').evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test('a superseded sample completion cannot replace the current report or its context', async ({ page }) => {
  const app = await openHost(page); await page.locator('#hold-tools').click(); await page.locator('#cancel').click();
  await app.getByRole('button', { name: 'Explore the sample report' }).click(); await expect(page.locator('#tool-pending')).toHaveText('1');
  await page.locator('#second').click(); await expect(app.getByRole('heading', { name: 'Second', exact: true })).toBeVisible();
  await page.locator('#release-tool').click(); await settleMessages(page);
  await expect(app.getByRole('heading', { name: 'Second', exact: true })).toBeVisible(); await expect(page.locator('#context')).toContainText('SECOND2');
  // Neighbor: a sample that is still current can complete normally.
  await page.locator('#cancel').click(); await app.getByRole('button', { name: 'Explore the sample report' }).click();
  await expect(page.locator('#tool-pending')).toHaveText('1'); await page.locator('#release-tool').click();
  await expect(app.getByRole('heading', { name: 'Old Sample', exact: true })).toBeVisible(); await expect(page.locator('#context')).toContainText('SAMPLE1');
});

test('an obsolete acknowledgement cannot confirm the current selection before its own acknowledgement', async ({ page }) => {
  const app = await openHost(page); await page.locator('#hold-context').click(); await app.getByRole('button', { name: reading, exact: true }).click();
  await expect(page.locator('#pending')).toHaveText('1'); await page.locator('#second').click();
  await expect(app.getByRole('heading', { name: 'Second', exact: true })).toBeVisible(); await app.getByRole('button', { name: reading, exact: true }).click();
  await page.locator('#release-context').click(); await settleMessages(page);
  await expect(app.getByRole('status')).toHaveText('Updating the conversation context…');
  await expect(page.locator('#context')).toContainText('"motTestNumber":"B"');
  await page.locator('#release-context').click(); await expect(app.getByRole('status')).toHaveText('Selected test shared with the conversation.');
});

test('a waiting explanation is invalidated by a new report and a current explanation still works', async ({ page }) => {
  const app = await openHost(page); await page.locator('#hold-context').click(); await app.getByRole('button', { name: reading, exact: true }).click();
  await expect(page.locator('#pending')).toHaveText('1'); await app.getByRole('button', { name: 'Explain this test', exact: true }).click();
  await page.locator('#second').click(); await expect(app.getByRole('heading', { name: 'Second', exact: true })).toBeVisible();
  await page.locator('#release-context').click(); await settleMessages(page);
  await expect(page.locator('#messages')).toHaveText('[]');
  await expect(page.locator('#context')).toContainText('SECOND2');
  await page.locator('#release-context').click(); await app.getByRole('button', { name: reading, exact: true }).click();
  await expect(page.locator('#context')).toContainText('"motTestNumber":"B"'); await page.locator('#release-context').click();
  await expect(app.getByRole('status')).toHaveText('Selected test shared with the conversation.');
  await app.getByRole('button', { name: 'Explain this test', exact: true }).click(); await expect(page.locator('#messages')).toContainText('SECOND2');
  await expect(page.locator('#messages')).toContainText('\\"motTestNumber\\":\\"B\\"');
});

test('teardown prevents pending explanations and acknowledgements from publishing', async ({ page }) => {
  const app = await openHost(page); await page.locator('#hold-context').click(); await app.getByRole('button', { name: reading, exact: true }).click();
  await expect(page.locator('#pending')).toHaveText('1'); await app.getByRole('button', { name: 'Explain this test', exact: true }).click();
  await page.locator('#teardown').click(); await expect(page.locator('#closed')).toHaveText('true');
  await page.locator('#release-context').click(); await settleMessages(page);
  await expect(page.locator('#messages')).toHaveText('[]'); await expect(app.getByRole('status')).toHaveText('Updating the conversation context…');
});
