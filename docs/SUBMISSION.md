# Prepare public submission materials

`plugins/mot-lens/` contains the portable Agent Plugins package: root `plugin.json`,
`mcp.json`, square light/dark icons and an explicitly fictional report screenshot.
Use [release preparation](RELEASING.md) to create ignored
`dist/release/VERSION/mot-lens-VERSION.zip`, metadata and checksums. The emitted manifest is at
the ZIP root. Its version derives from root `package.json`; the source template omits version.
This is prepared material, not a submitted or approved plugin.

The manifest includes name, descriptions, Applification branding, HTTPS support/privacy/terms,
five positive and three negative review cases, release notes and no-commerce declaration.
The screenshot is the packaged MCP UI rendered in a development host, not a ChatGPT screenshot.
No reviewer password is needed because the MCP endpoint is public and read-only.

Follow [the current submission guide](https://developers.openai.com/plugins/deploy/submission)
and [plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines). The publisher
must verify its developer identity, finish the remaining host acceptance and upload a complete
walkthrough before asking for review. Hosted live DVSA access and the personal developer-connection
observations below are already recorded. Publisher verification and public submission are parked.
A custom developer connection is separate from approved publication in the public directory.

## Personal ChatGPT observations on 19 October 2026

The root agent used a signed-in personal developer connection against production version `0.1.0`,
build `51885bb98830a364cf70d71e89060d3d4b909f20`. The fictional nine-test report rendered and expanded.
Selecting a failed sample test showed its original defects. Explain produced a conversation answer
tied to that selection and stated that repairs and current condition were not established.
An owner-supplied live lookup matched all three tests in the direct DVSA/hosted MCP comparison.
The host refused private-owner, payment/deletion and condition-score/guaranteed-purchase requests.
Invalid input produced a host error without substituting fiction.

CSP enforcement was off and the setting stayed unchanged. These observations do not establish
strict-CSP equivalence, actual-host themes/mobile coverage, or public-directory approval.
Local packaged-resource journeys cover themes and mobile separately. Earlier signed-out or hung
browser attempts remain historical access failures. The private conversation, registration,
raw records and live screenshots are omitted. The sample-only recording is not a complete
submission walkthrough and has no public walkthrough URL.

## Remaining submission inputs

- Verified Applification publisher identity and owner-approved listing/contact information.
- Reconfirm live DVSA access conditions and record accuracy for the release submitted for review.
- Strict-CSP host acceptance, actual-host mobile/themes and the public-directory install/review lifecycle.
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
