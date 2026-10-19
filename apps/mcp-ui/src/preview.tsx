import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
import { PRODUCT, makeReport, type RawVehicle } from '@mot-lens/domain';
import './preview.css';

// This is a development-only host: actual MCP HTTP calls, standard postMessage
// bridge, and an inspectable conversation context. It never runs an LLM.
function PreviewHost() {
  const [registration, setRegistration] = useState(''); const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mode, setMode] = useState('inline'); const [ready, setReady] = useState(false); const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState('No test selected'); const [message, setMessage] = useState('No message sent');
  const frame = useRef<HTMLIFrameElement | null>(null); const bridgeRef = useRef<AppBridge | null>(null); const clientRef = useRef<Client | null>(null);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let active = true; let bridge: AppBridge | undefined;
    const client = new Client({ name: 'mot-lens-development-host', version: PRODUCT.version }); clientRef.current = client;
    const start = async () => {
      const endpoint = new URLSearchParams(location.search).get('endpoint') ?? 'http://127.0.0.1:8787/mcp';
      await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
      if (!active || !frame.current?.contentWindow) return;
      bridge = new AppBridge(client, { name: 'MOT Lens development preview (not ChatGPT)', version: PRODUCT.version },
        { serverTools: {}, openLinks: {}, updateModelContext: {}, message: {}, logging: {} },
        { hostContext: { theme: 'light', displayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'] } });
      bridgeRef.current = bridge;
      bridge.onupdatemodelcontext = async params => { if (active) setContext(params.content?.map(content => content.type === 'text' ? content.text : JSON.stringify(content)).join('\n') ?? JSON.stringify(params, null, 2)); return {}; };
      bridge.onmessage = async params => { if (active) setMessage(JSON.stringify(params, null, 2)); return {}; };
      bridge.onrequestdisplaymode = async ({ mode }) => { if (active) setMode(mode); await bridge?.sendHostContextChange({ displayMode: mode }); return { mode }; };
      bridge.onsizechange = ({ height }) => { if (frame.current && height) frame.current.style.height = `${Math.max(350, Math.ceil(height + 4))}px`; };
      bridge.oninitialized = async () => {
        if (!active || !bridge) return;
        const args = { sample: true };
        await bridge.sendToolInput({ arguments: args });
        const result = await client.callTool({ name: 'show_vehicle_report', arguments: args });
        await bridge.sendToolResult(result); if (active) setReady(true);
      };
      await bridge.connect(new PostMessageTransport(frame.current.contentWindow, frame.current.contentWindow));
      // Default verification uses the exact built resource returned by MCP.
      // ?source=dev opts into Vite's source hot reload for design work.
      if (new URLSearchParams(location.search).get('source') === 'dev') frame.current.src = `/widget.html?generation=${generation}`;
      else {
        const resource = await client.readResource({ uri: 'ui://mot-lens/report-v1.html' });
        const content = resource.contents[0];
        if (!content || !('text' in content) || content.mimeType !== 'text/html;profile=mcp-app') throw new Error('MCP did not return the report resource');
        frame.current.srcdoc = content.text;
      }
    };
    void start().catch(err => { if (active) setError(err instanceof Error ? err.message : 'Connection failed'); });
    return () => { active = false; bridgeRef.current = null; clientRef.current = null; void bridge?.close(); void client.close(); };
  }, [generation]);
  async function lookup(sample = false) {
    const client = clientRef.current; const bridge = bridgeRef.current; if (!client || !bridge || !ready) return;
    const args = sample ? { sample: true } : { registration };
    setError(null);
    try { await bridge.sendToolInput({ arguments: args }); const result = await client.callTool({ name: 'show_vehicle_report', arguments: args }); await bridge.sendToolResult(result); }
    catch (err) { setError(err instanceof Error ? err.message : 'Lookup failed'); }
  }
  async function edge(kind: 'empty' | 'mixed' | 'missing') {
    const vehicle: RawVehicle = kind === 'empty' ? { registration: 'SAMPLE2', make: 'EXAMPLE', motTestDueDate: '2027-03-01' } : {
      registration: 'SAMPLE2', make: 'EXAMPLE', motTests: [
        { motTestNumber: 'EDGE1', completedDate: '2025-01-01T10:00:00Z', testResult: 'PASSED', odometerValue: '10000', odometerUnit: 'MI', odometerResultType: 'READ', defects: null },
        { motTestNumber: 'EDGE2', completedDate: '2026-01-01T11:00:00Z', testResult: 'PASSED', odometerValue: kind === 'missing' ? null : '20000', odometerUnit: 'KM', odometerResultType: kind === 'missing' ? 'UNREADABLE' : 'READ', defects: [] },
        { motTestNumber: 'EDGE3', completedDate: null, testResult: 'FAILED', dataSource: 'CVS', defects: [{ text: 'An unfamiliar category is preserved', type: 'PRS' }] },
      ],
    };
    const report = makeReport({ vehicle, kind: 'sample', retrievedAt: new Date().toISOString() });
    await bridgeRef.current?.sendToolInput({ arguments: { sample: true } });
    await bridgeRef.current?.sendToolResult({ content: [{ type: 'text', text: 'Development fixture, not live records.' }], structuredContent: { kind: 'report', report } });
  }
  return <main className="preview-page" data-theme={theme}><header className="preview-toolbar"><div><strong>MOT Lens</strong><span>Development host · MCP + bridge · no model</span></div><div className="preview-controls"><button onClick={() => { const next = theme === 'light' ? 'dark' : 'light'; setTheme(next); void bridgeRef.current?.sendHostContextChange({ theme: next }); }}>Switch to {theme === 'light' ? 'dark' : 'light'}</button><button onClick={() => { setReady(false); setContext('No test selected'); setMode('inline'); setGeneration(v => v + 1); }}>Remount app</button></div></header>
    <form className="preview-lookup" onSubmit={e => { e.preventDefault(); void lookup(); }}><label htmlFor="registration">Registration</label><input id="registration" value={registration} onChange={e => setRegistration(e.target.value)} placeholder="AB12 CDE" maxLength={24} /><button disabled={!ready}>Look up</button><button type="button" disabled={!ready} onClick={() => void lookup(true)}>Load sample</button></form>
    {error && <p role="alert" className="preview-error">{error}</p>}
    <div className={`preview-widget ${mode}`}><iframe key={generation} ref={frame} title="MOT Lens interactive report" style={{ width: '100%', height: 700, border: 0 }} /></div>
    <details className="preview-debug"><summary>Inspect host context and messages (development only)</summary><h2>Model context</h2><pre data-testid="model-context">{context}</pre><h2>Conversation message</h2><pre data-testid="conversation-message">{message}</pre><div className="preview-controls"><button disabled={!ready} onClick={() => void edge('empty')}>No tests fixture</button><button disabled={!ready} onClick={() => void edge('mixed')}>Mixed units fixture</button><button disabled={!ready} onClick={() => void edge('missing')}>Missing readings fixture</button><button disabled={!ready} onClick={() => void bridgeRef.current?.sendToolCancelled({ reason: 'Development cancellation check' })}>Cancelled fixture</button><button disabled={!ready} onClick={() => void bridgeRef.current?.sendToolResult({ content: [], structuredContent: { invalid: true } })}>Malformed fixture</button></div></details>
  </main>;
}
const root = document.getElementById('root'); if (root) createRoot(root).render(<PreviewHost />);
