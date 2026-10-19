# Connect MOT Lens to Claude

MCP server URL: **https://mot-lens.web3-blog.workers.dev/mcp**.
Transport: Streamable HTTP. Authentication: **No sign in**. Leave request headers empty.
DVSA developer credentials stay on the server; users do not supply them to Claude.

Following the [official custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp), checked 19 October 2026:

1. Open **Customize → Connectors** in Claude.
2. Select **+ Add → Add custom connector**.
3. Name it **MOT Lens**, paste the server URL and select **Continue**.
4. Review the detected settings and select **No sign in**. Leave request headers empty and finish with **Add**.
5. In a conversation, open **+ → Connectors** and enable **MOT Lens**.
6. Ask “Show me the MOT Lens sample report”, or request a report for your own registration.

On a managed workspace, an owner may need to add the connector under organization settings
using **Add → Custom → Web**. Availability depends on the plan and workspace permissions;
consult the official guide if the controls differ.

Interactive reports depend on the host's MCP Apps support. Both tools also return text and
structured records. Hosted protocol checks accept the exact `https://claude.ai` origin and
reject lookalike domains. Installed Claude rendering and model tool selection remain unverified.
