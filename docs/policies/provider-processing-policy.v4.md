# Provider Processing Policy v4

Status: **policy-version lifecycle `active`; repository authority is target-qualified; default deny with one developer-live eligible-only rule**

The authority-bearing serialization of this immutable policy version is [`provider-processing-policy.v4.json`](provider-processing-policy.v4.json), validated by its self-contained Draft 7 [`provider-processing-policy.v4.schema.json`](provider-processing-policy.v4.schema.json). Its `lifecycleStatus: "active"` describes the version internally. Repository-current authority additionally requires an exact integrated `dev` target whose same-tree [`active-policy-set.v4.json`](active-policy-set.v4.json) `developer-live` pin matches identity, version, path and SHA-256. Before integration, this record is accepted-but-unintegrated.

This Markdown file is a human-readable projection and carries no independent authority. The immutable [`v1`](provider-processing-policy.v1.json), [`v2`](provider-processing-policy.v2.json) and [`v3`](provider-processing-policy.v3.json) records remain unchanged for their trusted operational scopes.

## Identity and scope

- Policy identity: `provider-processing-policy`
- Version: `v4`
- Predecessor: immutable v3
- Operational scope: `developer-live` ([ADR 0065](../adr/0065-admit-a-developer-live-provider-processing-scope.md))
- Default: deny
- Rules: exactly one, **eligible only**

Provider v4 is selected only by trusted launch authority on a developer host: the built entry's launch argument `--trusted-operational-scope developer-live`, carried like `--data-root` from the launcher through Electron main to the service. It cannot be selected by an ordinary setting, environment variable, Provider, artifact or Plugin; cross-scope fallback is forbidden; CI, the E2E Gate and every hosted execution stay on `development-ci` / v1. Selection does not configure a Provider or dispatch a Run.

## Eligible developer-live work

Rule `developer-live-public-samplebook-analysis` applies only after a newly user-initiated Task creates an exact Run through direct Run Authorization. No Default Execution Rule, Background Analysis Enrollment, idle, scheduled, import-triggered or cross-Run dispatch is eligible. The work is human-attended on a developer host and never runs in CI, hosted, scheduled or in the background.

Only Owner-designated Public SampleBooks admitted under [ADR 0043](../adr/0043-allow-public-samplebooks-in-repository-and-ci.md) may be transmitted; the implementing slice fixes the transmittable set (S40: exact `sample1`), and any other Book refuses before dispatch with a safe reason. The only Outbound Data Category is `public-or-synthetic`; private manuscripts stay prohibited.

The Main Editorial Role binds route `opencode-go` (`POST https://opencode.ai/zen/go/v1/chat/completions`), model `deepseek-v4-flash`, credential slot `opencode-go` ([ADR 0067](../adr/0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md)). The binding is exact: no fallback, an empty Approved Fallback Chain, no second model. Production defaults and the `ordinary-production` scope are unchanged.

A Run's transmissions are bounded by its frozen Coverage Manifest unit count plus the declared `safe-retry` adaptations of its Plan Envelope. One technical Session serves one Analysis Unit; the accumulating single-session composition is not used. An identical request (same model and request digest) replays from the Provider Result Cache without transmission, and a repeated test item identifier is refused unless the Provider Test Ledger marks it `stale`.

The Plan Envelope must bind an explicit Run Budget Ceiling; `unset` is refused. The development default is 500,000 total tokens, and the ceiling is evaluated before every dispatch from the accumulated usage. Reaching it ends the Run as `Run Budget Ceiling Reached` with the partial revision preserved. Every other precondition of the ordinary Run path (eligible configured Provider, Provider Preflight, exact Provider Binding, Plan Envelope, Run Authorization, Run Source Scope, declared operation classes, the final Provider Payload/Egress Gate, frozen before transmission) applies unchanged.

A limit response is classified `quota-exhausted` and ends the Run as a Provider Account Limit: no retry, no fallback, no second model.

## Capture

The scope emits no fixture and uploads nothing. Its one permitted capture is the Provider Result Cache in protected local staging outside every checkout and worktree. Raw request and response bytes never enter logs, diagnostics or the repository; cache entries reach the repository only through the reviewed fixture-generation tooling of a later slice.

## Credential and authority separation

The development credential enters the product only through the Protected Secret Store via the enrollment helper, the sole reader of the Owner's key file. Only the Credential Broker resolves the opaque Credential Reference at the final authorized adapter, against a `transmit-remote` ticket for the bound Run. Values never enter repositories, prompts, Session text, generic environments, logs, diagnostics, tool results, protocol frames or the cache's metadata.

Policy eligibility does not create a Provider implementation or dispatch. Provider configuration, credentials, readable scope, installation, enablement, DSH Session/Plugin membership, a Default Execution Rule, a Background Analysis Enrollment, External Export Policy or Effect Approval cannot fill a failed rule match. The Provider Result Cache is not a Recorded Deterministic Model Fixture and proves no Provider conformance.

Provider Processing is controlled model processing only. It grants no formal Manuscript Apply, external export, learning, publication, Public Release Permission or outcome proof.

## No implementation or activation claim

This record selects no Provider implementation and proves no launch selector exists; the implementing slice (S40) supplies both. It cannot auto-activate: the stricter existing developer-review rule governs this authority-changing Policy revision until separately superseded.
