# Provider Processing Policy v8

Status: **policy-version lifecycle `active`; selected for `developer-live` by [`active-policy-set.v6.json`](active-policy-set.v6.json); default deny with two developer-live eligible-only rules — the platform-tools analysis rule of v7 and the Interactive Editorial Dialogue rule of ADR 0088**

The authority-bearing serialization of this immutable policy version is [`provider-processing-policy.v8.json`](provider-processing-policy.v8.json), validated by its self-contained Draft 7 [`provider-processing-policy.v8.schema.json`](provider-processing-policy.v8.schema.json). Its `lifecycleStatus: "active"` describes the version internally; what makes it repository-current is the active-set v6 pin at a qualifying integrated `dev` target, as the [README](README.md) states.

This Markdown file is a human-readable projection and carries no independent authority. The immutable [`v1`](provider-processing-policy.v1.json), [`v2`](provider-processing-policy.v2.json), [`v3`](provider-processing-policy.v3.json), [`v4`](provider-processing-policy.v4.json), [`v5`](provider-processing-policy.v5.json), [`v6`](provider-processing-policy.v6.json) and [`v7`](provider-processing-policy.v7.json) records remain unchanged; v5 is the `developer-live` document active-set v5 selected and every row persisted under it still names, and v7 is the reviewed platform-tools record no active set selects.

## Identity and scope

- Policy identity: `provider-processing-policy`
- Version: `v8`
- Predecessor: immutable v7 (whose bytes the Owner reviewed on 2026-09-12; v8 reproduces its one rule byte for byte)
- Operational scope: `developer-live` ([ADR 0065](../adr/0065-admit-a-developer-live-provider-processing-scope.md), widened for one dialogue turn by [ADR 0088](../adr/0088-carry-the-editorial-dialogue-under-developer-live.md) §1)
- Default: deny
- Rules: exactly two, both **eligible only** — `developer-live-public-samplebook-analysis` first, `developer-live-editor-selected-excerpt-dialogue` second

Provider v8 is selected only by trusted launch authority on a developer host: the built entry's launch argument `--trusted-operational-scope developer-live`, carried like `--data-root` from the launcher through Electron main to the service. It cannot be selected by an ordinary setting, environment variable, Provider, artifact or Plugin; cross-scope fallback is forbidden; CI, the E2E Gate and every hosted execution stay on `development-ci` / v1. Selection does not configure a Provider or dispatch a Run.

## What changes from v7

v8 reproduces v7's decision exactly on its analysis rule and adds one rule beside it. Field by field:

1. `decision.providerAllowRules` holds two rules rather than one. The first is v7's `developer-live-public-samplebook-analysis` byte for byte — including `webSearchToolAllowed: true`, the `platformTools` block of [ADR 0080](../adr/0080-assign-a-provider-route-and-model-to-every-task-that-transmits.md) §7.5 and the 90,000-token per-frozen-unit default of §7.4. The second is the dialogue rule below (ADR 0088 §3: the dialogue rule rides the platform-tools revision rather than a revision of its own).
2. `outboundDataCategories` gains `editor-selected-manuscript-excerpt`, labelled `编辑所选稿件选段` (ADR 0088 §5): the category the Egress Gate already binds for a dialogue attempt and admitted on the local deterministic route only until this record and S17c.
3. `authorityBasis` gains exactly one entry, ADR 0088.
4. The document's identity fields change as any successor's do — `version`, `predecessorVersion`, `predecessorCanonicalPath`, `canonicalPath`, `humanProjectionPath`, `schemaPath`.

Everything else — `trustedSelection`, `credentialBoundary`, `authoritySeparations`, the four earlier categories — is v7's byte for byte, and v7 is v5's except on the three platform-tools bytes its own projection lists.

## Rule 1 · eligible developer-live analysis, with the platform tools

Rule `developer-live-public-samplebook-analysis` is v7's. It applies only after a newly user-initiated Task creates an exact Run through direct Run Authorization; no Default Execution Rule, Background Analysis Enrollment, idle, scheduled, import-triggered or cross-Run dispatch is eligible. The work is human-attended on a developer host and never runs in CI, hosted, scheduled or in the background.

Only Owner-designated Public SampleBooks admitted under [ADR 0043](../adr/0043-allow-public-samplebooks-in-repository-and-ci.md) may be transmitted (exact `sample1`, the one file ADR 0079 §5 keeps admitted; ADR 0088 §4 reads a tester's edited revision of that Book as that Book). The only Outbound Data Category is `public-or-synthetic`; private manuscripts stay prohibited.

The Main Editorial Role binds route `opencode-go` (`POST https://opencode.ai/zen/go/v1/chat/completions`), model `deepseek-v4-flash`, credential slot `opencode-go` ([ADR 0067](../adr/0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md)). The binding is exact: no fallback, an empty Approved Fallback Chain, no second model.

Transmissions are bounded by the frozen Coverage Manifest unit count, plus the declared `safe-retry` adaptations, plus the cross-unit reduction's topic sections, plus the assurance sample's anchor units, plus one Run Report reflection turn; one technical Session serves one Analysis Unit; an identical request replays from the Provider Result Cache; a repeated test item identifier is refused. The three suboperations of [ADR 0066](../adr/0066-add-model-driven-cross-unit-reduction-and-assurance-sampling.md) are allowed. A platform-tool round trip is not a fourth suboperation: every model turn of the loop counts against the same transmission bound and the Run Budget Ceiling (ADR 0080 §7.4).

`webSearchToolAllowed` is `true` and `platformTools` names what the rule admits, exactly as ADR 0080 §7.5 writes it:

- `websearch` — service `parallel`, host `search.parallel.ai`, tool `web_search`, `anonymous: true`. The model's call is forwarded to that one host as one JSON-RPC `tools/call`, and the query's outbound category is the binding's own (`public-or-synthetic`). Anonymous use is acceptable in every scope under the Owner's decision of ADR 0080 §5.3 (Q2); Parallel is the service the Owner settled on 2026-09-12.
- `webfetch` — `maxBytes` 5,242,880, `timeoutSeconds` 30, `boundedByCitations` true: the retrieval is bounded by the citations the model or the search returned rather than by a host list, and it is the retention fetch the External Evidence Retention Procedure owns (SRC-013, ADR 0079 §4.3).

The tools are registered into a Run's harness only when this rule is selected, the Run's kind declares web search on its row of ADR 0080's task table (事实核查 and the review categories whose configuration says so), and the bound model's capability profile declares function calling (ADR 0080 §4, supply b). `opencode-go/deepseek-v4-flash` declares `toolCalling: 'none'` until the ADR 0080 §7.7 evidence item is run, so under this selection every composition still registers zero tools and every request body stays byte-identical to v5's. The Run Budget Ceiling default is **90,000 tokens multiplied by the frozen unit count** (ADR 0070 as ADR 0080 §7.4 sizes it; the Owner's byte of 2026-09-12), with the explicit `--run-budget-ceiling` overriding it; `unset` is refused; there is no search budget and no per-operation quota. A limit response is `quota-exhausted` and ends the Run as a Provider Account Limit: no retry, no fallback, no second model. The house-people redaction of ADR 0079 §4.4 and the capture rule (Provider Result Cache in protected local staging only; no fixture, no upload, no raw bytes in logs or the repository) are unchanged.

## Rule 2 · one Interactive Editorial Dialogue turn (ADR 0088 §1)

Rule `developer-live-editor-selected-excerpt-dialogue`, purpose `developer-live-interactive-editorial-dialogue`, is the policy form of ADR 0088 §1, term by term:

- **Origin** (§1.1). One attempt — `ask`, `continue` or `regenerate` — the editor starts in the foreground on an exact selection. The exact selection and the question are the authority: `planEnvelopeRequired: false`, `runAuthorizationRequired: false`; no Default Execution Rule, Background Analysis Enrollment, schedule or other dispatch may start one.
- **One transmission, one Session** (§1.2). `oneTransmissionPerAttempt`, `oneTechnicalSessionPerAttempt`; nothing is retried, re-sent or continued in the same Session; `继续回答` and `重新回答` are new attempts with their own Session.
- **The payload** (§1.3). The frozen dialogue contract header, the exact selected words, the question and, on `继续回答`, the complete fragments the stopped attempt kept — nothing else.
- **Category** (§1.4). `allowedOutboundDataCategories` is exactly `editor-selected-manuscript-excerpt`. The Egress Gate admits it on the `opencode-go` route only under this rule, and keeps refusing it on every other remote route and rule; that gate branch is S17c's and does not exist yet, so asking under `developer-live` stays refused before anything is recorded.
- **Carried unchanged from the analysis rule** (§1.5). The exact `providerBinding`, the `redaction` rule, `executionMode` (human-attended, developer host only, never CI, hosted, scheduled or background) and the Provider Account Limit (`quota-exhausted` ends the attempt, no retry, no fallback, no second model). `webSearchToolAllowed` is `false`: row 18's permission to use the web is not taken up here, and the rule carries no `platformTools` block, so an excerpt can never reach a search service or a fetched page.
- **The cost bound is structural** (§1.6). `runBudgetCeilingApplies: false`, `costBound: one-bounded-payload-per-attempt`; `perAttemptOutputCapTokens` is `null` — the Owner reviews whether a cap is wanted, and a number here is the byte that sets it.
- **Persistence** (§1.7). The Harness Session Ledger under `<data root>/harness-sessions/` is the only persistence of the question and the answer (`harnessSessionLedgerUnderAgentDataRootIsTheOnlyPersistence: true`, `ai7RelationLogOrDiagnosticHoldsQuestionOrAnswer: false`).
- **Live once** (§1.8). `identicalRequestReplaysFromProviderResultCache: true`, `repeatedTestItemIdentifierAllowed: false`: every live dialogue item goes through the Provider Test Ledger and the Provider Result Cache of ADR 0067.
- **Inputs** (§4). The same development rule as the analysis rule: only an admitted Public SampleBook, exact `sample1`, with a tester's edited revision of that Book admitted (`editedRevisionsOfAdmittedBookAllowed: true`); text of another manuscript pasted into it is that manuscript and stays prohibited.

## Credential and authority separation

The development credential enters the product only through the Protected Secret Store via the enrollment helper, the sole reader of the Owner's key file. Only the Credential Broker resolves the opaque Credential Reference at the final authorized adapter, against a `transmit-remote` ticket for the bound Run or attempt. Values never enter repositories, prompts, Session text, generic environments, logs, diagnostics, tool results, protocol frames or the cache's metadata.

Policy eligibility does not create a Provider implementation or dispatch. Provider configuration, credentials, readable scope, installation, enablement, DSH Session/Plugin membership, a Default Execution Rule, a Background Analysis Enrollment, External Export Policy or Effect Approval cannot fill a failed rule match. The Provider Result Cache is not a Recorded Deterministic Model Fixture and proves no Provider conformance. Provider Processing is controlled model processing only: it grants no formal Manuscript Apply, external export, learning, publication, Public Release Permission or outcome proof.

## What this selection changes, and what it does not

Selecting v8 moves every `developer-live` pin to v8 and every active-set pin to v6; the service entry arms the network-denial allowance set with the model endpoint and `search.parallel.ai`, and per-ticket host admission for `webfetch`. It registers no tool for any Run today, because no selected binding declares function calling; the first search-enabled live Run is the named item of ADR 0080 §7.7 — 「can `opencode-go/deepseek-v4-flash` complete one `websearch` round trip in thinking mode and answer with sources, and what does the full chain cost」 — run by the Owner under ADR 0070 after this selection, never a re-transmission of the cached items. `development-ci`, the E2E Gate and every hosted execution see the two rules as configuration only and call no tool. A unit whose round trips reach the breaker ends with the disclosed state 联网核查未完成 on its affected findings and is never retried (ADR 0080 §7.4). `ordinary-production` gains nothing here: its dialogue and search rules come with the production successor that binds ADR 0080 §4.
