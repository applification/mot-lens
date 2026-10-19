# Connect MOT Lens to ChatGPT

MCP endpoint: **https://mot-lens.applification.net/mcp**.
Transport: Streamable HTTP. Authentication: **None** for the public, read-only endpoint.
DVSA developer credentials stay server-side; users do not supply them to ChatGPT.

The reachable endpoint supports official DVSA vehicle lookups and an explicitly fictional
sample. Hosted live access was verified on 19 October 2026. This is a developer connection,
not approved public-directory distribution. A personal ChatGPT developer connection passed the
[dated sample, live-record and refusal checks](SUBMISSION.md#personal-chatgpt-observations-on-19-october-2026)
on 19 October 2026 with CSP enforcement off. Strict-CSP and actual-host themes/mobile remain
unverified. An earlier signed-out browser attempt remains a historical access failure.

Follow the [current official connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt),
subject to your account/workspace policy:

1. Open [ChatGPT Plugins](https://chatgpt.com/plugins).
2. Select the plus button, then **Add custom MCP server**.
3. Name it **MOT Lens** and describe it as a free viewer of recorded MOT history.
4. Choose the public connection, enter the endpoint above, and select no authentication.
5. Review the risk notice and select **I understand and want to continue**, then **Create as a plugin**.
6. Confirm discovery shows `get_vehicle_history` and `show_vehicle_report`.
7. Install it, start a new conversation and use `@` to select MOT Lens.

If the custom-server option is unavailable, ask your workspace admin about its policy.
The local server can be inspected independently with `bun run control doctor` and the
[MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector).

Try “Show me the MOT Lens sample vehicle report.” Confirm **Sample report** and fictional
DEMO001 are visible. Expand, select the failed 18 September 2026 test, and check its original
headlamp/advisory wording. Ask “Explain this advisory.” Select the reading dip/linked tests,
change units, open the readings table, and test keyboard selection/light/dark/mobile.
Check the app's Explain button sends the selected-record question into the conversation.

Try another registration through the conversation. In sample-only mode it must clearly report
that live access is not configured, clear the former selection, and offer the labelled sample.
After live access is enabled, compare a known vehicle with official records and test no-history,
not-found and temporary failure handling. Use [review cases](SUBMISSION.md) to record outcomes.

The UI uses the current [MCP Apps bridge](https://developers.openai.com/plugins/build/chatgpt-ui):
`ui/update-model-context`, `ui/message`, host theme/display mode and auto-resize. Unsupported
fullscreen retains inline expansion; unsupported messaging is disabled with a conversation
fallback. No iframe fetches or model API calls are required for explanations.

After metadata/UI changes: deploy, open the connection in ChatGPT Plugins, select **Refresh**,
verify the discovered metadata changed, and start a new conversation. Tool-result/headless
verification alone does not establish ChatGPT iframe behavior or model tool selection.
