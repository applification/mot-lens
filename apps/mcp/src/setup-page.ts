// Public connection instructions; the vehicle report remains an MCP resource.
export const setupPage = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Connect MOT Lens to ChatGPT or Claude for official UK MOT history, original test records and mileage readings.">
  <meta name="theme-color" content="#f7f6f3">
  <title>Set up MOT Lens · ChatGPT &amp; Claude</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif; color: #263026; background: #f7f6f3; font-synthesis: none; }
    * { box-sizing: border-box; }
    body { margin: 0; font-size: 15px; line-height: 1.65; }
    a { color: inherit; text-underline-offset: 4px; }
    a:hover { color: #315d3d; }
    a:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid #315d3d; outline-offset: 5px; }
    [hidden] { display: none; }
    .shell { max-width: 1040px; margin: 0 auto; padding: 0 32px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 98px; border-bottom: 1px solid #eaeaea; }
    .brand { display: inline-flex; gap: 12px; align-items: center; font-size: 16px; font-weight: 650; letter-spacing: 2px; text-decoration: none; white-space: nowrap; }
    .brand-mark { display: inline-grid; place-items: center; width: 30px; height: 30px; color: #315d3d; background: #edf3ec; border-radius: 6px; font-size: 23px; line-height: 1; }
    .brand-slash { color: #9ba197; font-weight: 400; }
    .byline { font-size: 12px; color: #626960; }
    .byline a { text-decoration: none; }
    .hero { padding: 64px 0 36px; }
    .eyebrow { margin: 0 0 18px; font-size: 11px; font-weight: 600; letter-spacing: 1.6px; text-transform: uppercase; color: #626960; }
    h1 { max-width: 800px; margin: 0; font-family: Georgia, "Times New Roman", serif; font-weight: 400; font-size: clamp(40px, 6vw, 66px); letter-spacing: -2.3px; line-height: 1.08; }
    .intro { max-width: 620px; margin: 22px 0 0; font-size: 17px; line-height: 1.65; color: #626960; }
    .connection { padding: 26px 28px 22px; background: #edf3ec; border: 1px solid #eaeaea; border-radius: 8px; }
    .connection label { display: block; font-size: 11px; font-weight: 650; letter-spacing: 1px; text-transform: uppercase; }
    .endpoint { display: flex; align-items: stretch; gap: 14px; margin-top: 11px; }
    .endpoint input { flex: 1; width: 100%; min-width: 0; padding: 10px 0; border: 0; border-radius: 0; background: transparent; color: #263026; font: 14px/1.6 "SFMono-Regular", Consolas, monospace; }
    button { flex-shrink: 0; padding: 11px 18px; border: 0; border-radius: 5px; font: inherit; font-size: 13px; font-weight: 550; color: #fff; background: #263026; cursor: pointer; }
    button:hover { background: #3d493d; }
    button:active { transform: scale(.98); }
    .connection-note { margin: 12px 0 0; font-size: 12px; color: #4c5b4b; }
    .copy-status { min-height: 20px; margin: 4px 0 0; font-size: 12px; color: #315d3d; }
    .guides { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; padding: 48px 0 40px; }
    .guide { min-width: 0; }
    .guide-number { font: 11px "SFMono-Regular", Consolas, monospace; color: #787774; letter-spacing: .7px; }
    h2 { margin: 9px 0 22px; font: 400 34px/1.2 Georgia, "Times New Roman", serif; letter-spacing: -.7px; }
    ol { margin: 0; padding: 0; list-style: none; counter-reset: steps; }
    li { display: grid; grid-template-columns: 24px 1fr; gap: 12px; margin: 0 0 17px; color: #50584e; font-size: 14px; }
    li::before { counter-increment: steps; content: counter(steps, decimal-leading-zero); padding-top: 3px; font: 11px/1.6 "SFMono-Regular", Consolas, monospace; color: #858c80; }
    strong { color: #263026; font-weight: 600; }
    .guide-link { display: inline-block; margin-top: 3px; font-size: 12px; color: #315d3d; }
    .workspace-note { margin: 0; padding: 0 0 32px; font-size: 12px; color: #626960; border-bottom: 1px solid #eaeaea; }
    .try { display: grid; grid-template-columns: 1fr 1.4fr; gap: 40px; padding: 34px 0; }
    .try h2 { margin: 0 0 10px; font-size: 25px; }
    .try p { margin: 0; font-size: 13px; color: #626960; }
    .prompt { margin: 0; padding: 20px 24px; border-left: 2px solid #9bad93; background: #fff; font: 400 20px/1.5 Georgia, "Times New Roman", serif; }
    .prompt + .prompt { margin-top: 10px; font-size: 16px; background: transparent; }
    footer { padding: 26px 0 32px; border-top: 1px solid #eaeaea; color: #626960; font-size: 11px; }
    .footer-links { display: flex; flex-wrap: wrap; gap: 20px; margin-bottom: 15px; }
    footer p { max-width: 760px; margin: 8px 0 0; }
    @media (prefers-reduced-motion: no-preference) { main > section { animation: appear .4s ease-out both; } @keyframes appear { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; scroll-behavior: auto !important; } }
    @media (max-width: 650px) { .shell { padding: 0 22px; } header { min-height: 80px; gap: 12px; } .byline { max-width: 110px; text-align: right; font-size: 11px; } .hero { padding-top: 40px; } h1 { letter-spacing: -1.4px; } .intro { font-size: 16px; } .connection { padding: 22px 20px 18px; } .endpoint { flex-wrap: wrap; gap: 8px; } .endpoint input { flex-basis: 100%; font-size: 12px; } .guides { grid-template-columns: 1fr; gap: 32px; padding-top: 34px; } .guide + .guide { padding-top: 28px; border-top: 1px solid #eaeaea; } .try { grid-template-columns: 1fr; gap: 20px; } }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <a class="brand" href="/" aria-label="MOT Lens home"><span class="brand-mark" aria-hidden="true">◉</span>MOT <span class="brand-slash">/</span> LENS</a>
      <span class="byline">Free &amp; open source<br>by <a href="https://applification.net">Applification</a></span>
    </header>
    <main>
      <section class="hero" aria-labelledby="page-title">
        <p class="eyebrow">Connect once. Ask about a vehicle.</p>
        <h1 id="page-title">MOT history, in your<br>AI conversation.</h1>
        <p class="intro">Official UK test records, original advisories and mileage history. Add MOT Lens to ChatGPT or Claude, then ask about a registration.</p>
      </section>
      <section class="connection" aria-label="Connection details">
        <label for="server-url">MCP server URL · the same for both</label>
        <div class="endpoint">
          <input id="server-url" type="text" readonly spellcheck="false" value="https://mot-lens.applification.net/mcp" aria-describedby="connection-note">
          <button id="copy-url" type="button" aria-label="Copy MCP server URL" hidden>Copy URL</button>
        </div>
        <p class="connection-note" id="connection-note">Choose no authentication. MOT Lens needs no sign-in, API key or request headers.</p>
        <p class="copy-status" id="copy-status" role="status" aria-live="polite"></p>
      </section>
      <section class="guides" aria-label="Set up your AI host">
        <article class="guide" aria-labelledby="chatgpt-title">
          <span class="guide-number">01 / CONNECT</span>
          <h2 id="chatgpt-title">ChatGPT</h2>
          <ol>
            <li><span>Open <a href="https://chatgpt.com/plugins">ChatGPT Plugins</a>. Select <strong>+</strong>, then <strong>Add custom MCP server</strong>.</span></li>
            <li><span>Name it <strong>MOT Lens</strong>, choose a public connection and paste the server URL above. Select <strong>no authentication</strong>.</span></li>
            <li><span>Review the connection notice and continue. Choose <strong>Create as a plugin</strong>, review its two tools, then install it.</span></li>
            <li><span>Start a new conversation. Type <strong>@</strong> and select <strong>MOT Lens</strong>, then ask for a vehicle report.</span></li>
          </ol>
          <a class="guide-link" href="https://developers.openai.com/plugins/deploy/connect-chatgpt">Official ChatGPT connection guide ↗</a>
        </article>
        <article class="guide" aria-labelledby="claude-title">
          <span class="guide-number">02 / CONNECT</span>
          <h2 id="claude-title">Claude</h2>
          <ol>
            <li><span>Open <a href="https://claude.ai/settings/connectors">Customize → Connectors</a>. Choose <strong>+ Add</strong>, then <strong>Add custom connector</strong>.</span></li>
            <li><span>Name it <strong>MOT Lens</strong>, paste the server URL above and select <strong>Continue</strong>.</span></li>
            <li><span>Review the detected settings. Choose <strong>No sign in</strong> and leave request headers empty, then finish with <strong>Add</strong>.</span></li>
            <li><span>In a conversation, open <strong>+ → Connectors</strong> and enable <strong>MOT Lens</strong>. Ask for a vehicle report.</span></li>
          </ol>
          <a class="guide-link" href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp">Official Claude connector guide ↗</a>
        </article>
      </section>
      <p class="workspace-note">Custom connections depend on your host’s plan and workspace permissions. On a managed Claude workspace, an owner may need to add the web connector first. If an option is missing, check the linked guide or ask your workspace administrator.</p>
      <section class="try" aria-labelledby="try-title">
        <div><h2 id="try-title">Your first conversation</h2><p>Use your own registration for official records, or explore the clearly labelled fictional sample. Interactive reports appear in hosts that support MCP Apps; records are also available as text.</p></div>
        <div><blockquote class="prompt">“Show me the MOT history for [your registration].”</blockquote><blockquote class="prompt">“Show me the MOT Lens sample report.”</blockquote></div>
      </section>
    </main>
    <footer>
      <nav class="footer-links" aria-label="About MOT Lens"><a href="https://github.com/rufushudson/mot-lens">Source code</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/health">Service health</a></nav>
      <p>Official records come from the DVSA MOT History API. Contains public sector information licensed under the <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">Open Government Licence v3.0</a>.</p>
      <p>An MOT records a test at a point in time, not a vehicle’s current condition. MOT Lens is independent of DVSA, OpenAI and Anthropic.</p>
    </footer>
  </div>
  <script>
    const input = document.getElementById('server-url');
    const button = document.getElementById('copy-url');
    const status = document.getElementById('copy-status');
    button.hidden = false;
    button.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(input.value); status.textContent = 'Server URL copied.'; }
      catch { input.focus(); input.select(); status.textContent = 'URL selected. Use your device’s copy command to copy it.'; }
    });
  </script>
</body>
</html>`;
