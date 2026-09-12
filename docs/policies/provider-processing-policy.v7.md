# Provider Processing Policy v7

Status: **policy-version lifecycle `active`; written but not selected — no active policy set pins it; default deny with one developer-live eligible-only rule that names AI7's two platform tools**

The authority-bearing serialization of this immutable policy version is [`provider-processing-policy.v7.json`](provider-processing-policy.v7.json), validated by its self-contained Draft 7 [`provider-processing-policy.v7.schema.json`](provider-processing-policy.v7.schema.json). Its `lifecycleStatus: "active"` describes the version internally and selects nothing.

**These bytes are written, not selected.** [`active-policy-set.v5.json`](active-policy-set.v5.json) and its schema are byte-unchanged, no active-policy-set v6 exists, and no source or build record changes, so [`v5`](provider-processing-policy.v5.json) remains the `developer-live` pin and every `activePolicySetVersion: 'v5'` pin in the repository stays true. The platform-tools slice of [ADR 0080](../adr/0080-assign-a-provider-route-and-model-to-every-task-that-transmits.md) §7.8 step 3 — the Egress Gate narrowings, the network-denial allowance set, the `tool` payload source, and the two tools with their ledger and cache — is the slice that will select this version, through its own reviewed active-policy-set successor. Until then v7 is neither repository-current nor repository-canonical for any target: it authorizes nothing, and a Run that asks for a platform tool is refused by the v5 rule that is actually pinned. A policy that names tools the product cannot yet register must not be selectable.

This Markdown file is a human-readable projection and carries no independent authority. The immutable [`v1`](provider-processing-policy.v1.json), [`v2`](provider-processing-policy.v2.json), [`v3`](provider-processing-policy.v3.json), [`v4`](provider-processing-policy.v4.json), [`v5`](provider-processing-policy.v5.json) and [`v6`](provider-processing-policy.v6.json) records remain unchanged for their trusted operational scopes.

## Identity and scope

- Policy identity: `provider-processing-policy`
- Version: `v7`
- Predecessor: immutable v5
- Operational scope: `developer-live` ([ADR 0065](../adr/0065-admit-a-developer-live-provider-processing-scope.md))
- Default: deny
- Rules: exactly one, **eligible only**

When an active policy set selects it, Provider v7 is selected only by trusted launch authority on a developer host: the built entry's launch argument `--trusted-operational-scope developer-live`, carried like `--data-root` from the launcher through Electron main to the service. It cannot be selected by an ordinary setting, environment variable, Provider, artifact or Plugin; cross-scope fallback is forbidden; CI, the E2E Gate and every hosted execution stay on `development-ci` / v1. Selection does not configure a Provider or dispatch a Run.

## What changes from v5

v7 reproduces v5's decision exactly, with three differences, all on the one eligible-only rule:

1. `transmissions.webSearchToolAllowed` is `true` rather than `false` — the rule's switch for the model's web-search use ([ADR 0080](../adr/0080-assign-a-provider-route-and-model-to-every-task-that-transmits.md) §7.5).
2. The rule gains a `platformTools` block naming AI7's two platform tools exactly as ADR 0080 §7.5 writes it.
3. `authorizationPreconditions.defaultRunBudgetCeilingTokensPerFrozenUnit` is `90000` rather than `30000` — three times v5's default, settled by the Owner at the byte review of 2026-09-12, because a search-enabled unit spends model turns on tool results and its real cost cannot be estimated before the first search-enabled Run (ADR 0080 §7.4).

Everything else is v5's decision byte for byte: the same authority origin, execution mode, admitted sources, Outbound Data Category, redaction rule, Provider Binding, transmission bound, three declared suboperations, remaining authorization preconditions, Provider Account Limit handling, capture rule, privacy prompts, credential boundary and authority separations. The document's own identity fields change as any successor's do — `version`, `predecessorVersion`, `predecessorCanonicalPath`, `canonicalPath`, `humanProjectionPath`, `schemaPath` — and `authorityBasis` gains exactly one entry, ADR 0080, the record these three bytes come from.

## Eligible developer-live work

Rule `developer-live-public-samplebook-analysis` applies only after a newly user-initiated Task creates an exact Run through direct Run Authorization. No Default Execution Rule, Background Analysis Enrollment, idle, scheduled, import-triggered or cross-Run dispatch is eligible. The work is human-attended on a developer host and never runs in CI, hosted, scheduled or in the background.

Only Owner-designated Public SampleBooks admitted under [ADR 0043](../adr/0043-allow-public-samplebooks-in-repository-and-ci.md) may be transmitted; the implementing slice fixes the transmittable set (S40: exact `sample1`, the one file [ADR 0079](../adr/0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md) §5 keeps admitted), and any other Book refuses before dispatch with a safe reason. The only Outbound Data Category is `public-or-synthetic`; private manuscripts stay prohibited.

The Main Editorial Role binds route `opencode-go` (`POST https://opencode.ai/zen/go/v1/chat/completions`), model `deepseek-v4-flash`, credential slot `opencode-go` ([ADR 0067](../adr/0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md)). The binding is exact: no fallback, an empty Approved Fallback Chain, no second model. Production defaults and the `ordinary-production` scope are unchanged by this record.

## Transmissions and the three declared suboperations

A Run's transmissions are bounded by its frozen Coverage Manifest unit count, plus the declared `safe-retry` adaptations of its Plan Envelope, plus the cross-unit reduction's topic sections, plus the assurance sample's anchor units, plus one Run Report reflection turn. One technical Session serves one Analysis Unit; the accumulating single-session composition is not used. An identical request (same model and request digest) replays from the Provider Result Cache without transmission, and a repeated test item identifier is refused unless the Provider Test Ledger marks it `stale`.

Under v7, as under v5, the three suboperations [ADR 0066](../adr/0066-add-model-driven-cross-unit-reduction-and-assurance-sampling.md) declares are allowed, each as its own bounded transmission:

- `crossUnitReductionAllowed` — the model-driven cross-unit reduction, split by topic and never by chapter when its input exceeds one unit budget;
- `assuranceSamplingAllowed` — the fixed-seed assurance sample re-reading each sampled finding's anchor unit;
- `runReportReflectionAllowed` — the single `if redone` reflection turn the Run Report carries.

A platform-tool round trip is not a fourth suboperation and adds no bound of its own: every model turn of the loop counts against this same transmission bound and against the Run Budget Ceiling ([ADR 0080](../adr/0080-assign-a-provider-route-and-model-to-every-task-that-transmits.md) §7.4).

## The platform tools

`webSearchToolAllowed` is `true`: this version admits the model's web-search use for its one rule, and `platformTools` names what the rule admits.

- `websearch` — service `parallel`, host `search.parallel.ai`, tool `web_search`, `anonymous: true`. The model's call is forwarded to that one host, and the query's outbound category is the binding's own. Anonymous use is acceptable in every scope under the Owner's decision recorded in ADR 0080 §5.3 (Q2); Parallel is the Commander's proposed default service and is a byte the Owner accepts or changes at review.
- `webfetch` — `maxBytes` 5,242,880 (5 MB), `timeoutSeconds` 30, `boundedByCitations` true. The retrieval is bounded by the citations the model or the search returned rather than by a host list, and it is the same retention fetch the External Evidence Retention Procedure already owns (SRC-013, [ADR 0079](../adr/0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md) §4.3): one owner, one implementation.

These bytes are the authorization only. They register no tool, narrow no gate, and open no host: the Egress Gate's `tools-present` narrowing, its `call-search-service` decision, the `tool` payload source, the network-denial allowance set, the circuit breakers, the result caps, and the tools themselves with their Provider Test Ledger items and Research Snapshot Cache entries are all owned by the platform-tools slice of ADR 0080 §7.8 step 3, which also carries the first search-enabled live item as a named test under [ADR 0070](../adr/0070-run-developer-live-unattended-and-size-the-ceiling-per-unit.md).

## Run Budget Ceiling

The Plan Envelope must bind an explicit Run Budget Ceiling; `unset` is refused. The policy's default is **90,000 tokens multiplied by the frozen unit count of the Coverage Manifest** — three times v5's 30,000 under [ADR 0070](../adr/0070-run-developer-live-unattended-and-size-the-ceiling-per-unit.md) and ADR 0080 §7.4, because a search-enabled unit spends model turns on tool results, every injected result is tokens the ceiling already counts, and the real cost is unknown until the first search-enabled Run — computed after the manifest is frozen and before the plan is; the explicit `--run-budget-ceiling` argument overrides it. The ceiling is evaluated before every dispatch from the accumulated usage. Reaching it ends the Run as `Run Budget Ceiling Reached` with the partial revision preserved. There is no search budget and no per-operation quota: the ceiling is the one budget. Every other precondition of the ordinary Run path (eligible configured Provider, Provider Preflight, exact Provider Binding, Plan Envelope, Run Authorization, Run Source Scope, declared operation classes, the final Provider Payload/Egress Gate, frozen before transmission) applies unchanged.

A limit response is classified `quota-exhausted` and ends the Run as a Provider Account Limit: no retry, no fallback, no second model.

## Redaction

The manuscript's text in full and the author's information may leave; the house's people never do. Before any transmission the house-people identity is stripped: 责编 and 相关人 names and roles, 备注, and internal notes are removed. The author's information and the house name may leave — a Book in the 发稿 flow is public information. This is the policy form of the single privacy sentence [ADR 0079](../adr/0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md) §4.4 records: the text may go to the model and its tools; it is never published verbatim to the public web; the house's people never leave.

## Capture

The scope emits no fixture and uploads nothing. Its one permitted capture is the Provider Result Cache in protected local staging outside every checkout and worktree. Raw request and response bytes never enter logs, diagnostics or the repository; cache entries reach the repository only through the reviewed fixture-generation tooling of a later slice.

## Credential and authority separation

The development credential enters the product only through the Protected Secret Store via the enrollment helper, the sole reader of the Owner's key file. Only the Credential Broker resolves the opaque Credential Reference at the final authorized adapter, against a `transmit-remote` ticket for the bound Run. Values never enter repositories, prompts, Session text, generic environments, logs, diagnostics, tool results, protocol frames or the cache's metadata.

Policy eligibility does not create a Provider implementation or dispatch. Provider configuration, credentials, readable scope, installation, enablement, DSH Session/Plugin membership, a Default Execution Rule, a Background Analysis Enrollment, External Export Policy or Effect Approval cannot fill a failed rule match. The Provider Result Cache is not a Recorded Deterministic Model Fixture and proves no Provider conformance.

Provider Processing is controlled model processing only. It grants no formal Manuscript Apply, external export, learning, publication, Public Release Permission or outcome proof.

## No implementation or activation claim

This record selects no Provider implementation, registers no tool, narrows no gate and proves no launch selector exists. It is not selected by any active policy set, so it changes no behaviour at any target that contains it; selection is a separate reviewed act, and the search-enabled categories of the 审阅 surface keep their disclosed 未联网核查 state until that act and its implementing slice both land. It cannot auto-activate: the stricter existing developer-review rule governs this authority-changing Policy revision until separately superseded.
