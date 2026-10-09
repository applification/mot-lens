---
name: astack-mot-lens
description: Drive and verify the MOT Lens MCP server and packaged report in this repository.
---

Read `.astack/project.md` and `docs/FEATURES.md`. Build before starting the server.
Use `bun run control doctor` to establish endpoint, mode, build and tool identity.
Use `tools`, `sample`, `lookup "REGISTRATION"` or `resource` for public read-only actions.
An error from a real lookup is never a reason to substitute fictional sample data.
Use `bun run test:e2e` for selection, conversation context/message and responsive UI.
For hosted checks set `MOT_LENS_ENDPOINT` explicitly; never silently retarget development.
Do not claim actual ChatGPT verification from the local development host.
