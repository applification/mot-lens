# Release MOT Lens

Use Node 24+, Bun 1.4.0, the committed lockfile and local Cloudflare authentication.
CI prepares artifacts without Cloudflare credentials. Deployment is an explicit local action.
The production Worker remains the top-level `mot-lens` target in `wrangler.jsonc`.

## Prepare the reviewed source

1. Edit only root `package.json` to change the product version. Keep `0.1.0` for this engineering change.
   Review and merge the change before preparing the production release.
2. Check out the merged revision in a clean checkout. Install the committed dependencies and browser.

```sh
bun install --frozen-lockfile
bunx playwright install chromium
bun run release check
bun run release prepare
```

Preparation runs `bun run verify` once, then packages the committed listing assets.
It writes `dist/release/VERSION/mot-lens-VERSION.zip`, `release.json`, `SHA256SUMS` and
`local-protocol.json`. Browser captures go to ignored `test-results/`.
Source files, historical screenshots and Git tags stay unchanged.

`release.json` records the full source SHA, canonical version, ZIP hash, widget hash,
lockfile hash and toolchain. ZIP order and timestamps are deterministic.
Focused Zod, archive and image checks do not claim full official JSON-schema validation.
To inspect an existing ZIP, run `bun run release check --zip PATH`.
`bun run package:plugin` only packages assets; use `release prepare` for release evidence.

Set the artifact path for the following commands.

```sh
RELEASE_VERSION=$(node -p "require('./package.json').version")
RELEASE_ARTIFACT="dist/release/$RELEASE_VERSION/release.json"
```

## Verify staging

Use the prepared checkout and its artifact. The command rebuilds and compares the widget,
ZIP and lockfile before invoking Wrangler with the full source SHA as `BUILD_ID`.

```sh
bun run release deploy --target staging --artifact "$RELEASE_ARTIFACT"
bun run release verify --target staging --artifact "$RELEASE_ARTIFACT"
```

Staging uses `mot-lens-staging` at `https://mot-lens-staging.web3-blog.workers.dev/mcp`.
It has no custom-domain routes and has its own limiter and Durable Object namespace.
The server forces sample mode and suppresses the publisher challenge on this target.
Do not copy production credentials or verification tokens into staging.
The plugin ZIP always points to production.

Verification checks exact health, MCP initialization and widget versions, source SHA,
widget SHA, UI origin, public endpoint and mode. It also checks the original sample,
error, resource, policy, foreign-origin and body-limit behavior.
It writes a target-specific report beside the artifact.
`bun run verify:hosted --target staging --artifact "$RELEASE_ARTIFACT"` is the same operation.
An optional `--url` must equal the selected target's configured endpoint.

## Publish immutable GitHub assets

Create `vVERSION` at the prepared source SHA. Push that tag and explicitly create its
GitHub release with the versioned ZIP, `release.json` and `SHA256SUMS` as assets.
Inspect the hashes before uploading. These are operator actions, not CLI or CI side effects.
Never move a published tag or replace published assets. Make a new version for a correction.
A GitHub source release does not submit the plugin to the public directory.

## Deploy production

Production requires a clean checkout at the artifact SHA, `vVERSION` at that SHA, and
that revision on `origin/main`. The command fetches `origin/main` before checking ancestry.
It uses the top-level Worker configuration, not an `env.production` configuration.

```sh
bun run release deploy --target production --artifact "$RELEASE_ARTIFACT"
bun run release verify --target production --artifact "$RELEASE_ARTIFACT"
```

Before upload, the CLI observes the current production deployment through Wrangler.
It retains that prior version, the new returned version and an explicit rollback command in
`deployment-production-TIMESTAMP.json`. Successful upload followed by a failed check is
`deployed-but-unverified`, exits unsuccessfully and retains the prior version.
Run the read-only verification command again to inspect a corrected or delayed deployment.

## Recover a deployment

Read the deployment receipt and confirm the previous version before running its rollback command.
The production command has this form.

```sh
bunx wrangler rollback PREVIOUS_VERSION_ID --env ""
```

The CLI never rolls back automatically. It does not move tags.
For staging history, use `bunx wrangler deployments list --env staging` and select the
intended previous version before `bunx wrangler rollback VERSION_ID --env staging`.
After rollback, verify against the matching prior source checkout and its artifact.
There is no application data to restore.

## Submit to the directory later

Publisher verification and public submission remain parked.
Follow [the submission checklist](SUBMISSION.md) when the owner resumes that work.
Personal ChatGPT developer-connection observations, strict-CSP host acceptance and
public-directory approval are separate facts. No complete submission walkthrough URL is supplied.
