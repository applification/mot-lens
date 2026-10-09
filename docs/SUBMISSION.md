# Public submission materials — draft

`plugins/mot-lens/` contains the portable Agent Plugins package: root `plugin.json`,
`mcp.json`, square light/dark icons and an explicitly fictional report screenshot.
Run `bun run package:plugin` to create ignored `dist/mot-lens-plugin.zip`; the manifest is at
the ZIP root. This is prepared material, not a submitted or approved plugin.

The manifest includes name, descriptions, Applification branding, HTTPS support/privacy/terms,
five positive and three negative review cases, release notes and no-commerce declaration.
The screenshot is the packaged MCP UI rendered in a development host, not a ChatGPT screenshot.
No reviewer password is needed because the MCP endpoint is public and read-only.

Follow [the current submission guide](https://developers.openai.com/plugins/deploy/submission)
and [plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines). The publisher
must verify its developer identity, configure live DVSA access, complete an actual ChatGPT
connection and upload a walkthrough before asking for review. A custom developer connection
is separate from approved publication in the public directory.

## Remaining submission inputs

- Verified Applification publisher identity and owner-approved listing/contact information.
- Live DVSA credentials/access conditions, successful known-vehicle verification and record comparison.
- Installed ChatGPT proof: selected test, follow-up, another registration, mobile/themes and graceful errors.
- A real video recording URL: intentionally omitted from the draft manifest, never fabricated.
- Portal-issued domain challenge. Set `OPENAI_VERIFICATION_TOKEN` as a Worker secret; the server
  serves exactly that plaintext token at `/.well-known/openai-apps-challenge`. Without it, 404.
  Verify only on the hostname/eligible parent specified by the portal; do not replace another app's token.
- Confirm the unique `ui.domain` in resource metadata is accepted by the host/reviewer. It currently
  identifies the dedicated MOT Lens Worker origin. CSP has no external resource/connect domains.
- Portal review findings, approval and publication steps. No submission was performed in this build.

## Recording script and acceptance

1. Show the installed ChatGPT plugin and prompt for a known official registration. Verify summary,
   recorded latest result/expiry, DVSA source/retrieval/cache age against the official record.
2. Expand the report, change chart units and use its readings table. Select a failed test and show
   original wording, recorded unit/result/test number/source.
3. Select an advisory, ask “Explain this advisory” and show the host uses the selected record.
   The explanation must avoid a diagnosis, repair inference or buying verdict.
4. Follow a pattern's linked tests. Explain exact repeated wording and a mileage change as facts
   needing checking, with the conversion basis. Demonstrate same-day records remain separate.
5. Ask for another registration and show selection resets. Include not-found/no-history examples.
6. Request the labelled fictional sample. Show light/dark, keyboard and mobile; state it is not live.
7. Show a negative request (private owner identity, payment, condition verdict) stays outside scope.

Record tool names, arguments, typed/text result, UI behavior, host messages, errors and actual
outcome for each case. Rerun after metadata changes. Do not mark a fixture as a real API lookup,
a development bridge as ChatGPT or a draft package as approved distribution.
