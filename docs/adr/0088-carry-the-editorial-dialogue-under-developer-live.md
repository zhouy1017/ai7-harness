---
status: accepted — the Owner decided on 2026-10-07 and 2026-10-08 what this record states, and on 2026-10-08 directed that the Commander merge it once drafted (「可以，起草后由你合并」); the Commander's merge is this record's acceptance
date: 2026-10-08
deciders: Owner (chooow.yang@gmail.com)
amends: ADR 0065 — its Purpose and boundary, and its Origin, Bounded transmissions and Hard ceiling clauses, for a dialogue attempt only (§1, §2); its Inputs clause is read as §4 states; AGENTS.md's Protected material paragraph gains a one-line clarification of the same reading (§4)
---

# 0088 · Carry the editorial dialogue under `developer-live`, and read the SampleBook rule as a development rule

On 2026-10-07 the Owner allowed the editorial dialogue — `就这段提问…`, built provider-free as S17a (#52) — to be answered by the real OpenCode Go model: 「允许接入opencode go的真实模型」. [ADR 0065](./0065-admit-a-developer-live-provider-processing-scope.md) admits `developer-live` for one purpose, tuning the analysis contracts, and every one of its clauses assumes a planned and authorized Run. This record widens the scope's purpose to also carry one user-initiated dialogue turn, and states the terms. On 2026-10-08 the Owner decided that the dialogue's policy rule lands inside the platform-tools Provider Processing revision of S87-f3 (#473) rather than as a revision of its own, and clarified that the rule admitting only Public SampleBooks for transmission is a development and testing rule, not a product rule. This record writes both down. It changes no production default, no CI or Gate behavior, and no repository rule.

## Context

- **S17a is built and provider-free.** Selecting words and asking sends one message: the frozen Editorial Dialogue Contract's header, the selected words (one block, at most 2,000 graphemes) and the question (1–500 characters); `继续回答` adds the complete fragments the stopped answer kept. Each attempt — `ask`, `continue` or `regenerate` — is a fresh harness composition with one technical Session, whose DSH Session log is persisted under `<data root>/harness-sessions/` as the Harness Session Ledger of [UI ADR 0014](../ui-ux-v2/adr/0014-wait-by-default-and-stream-only-foreground-interactive-editorial-dialogue.md). AI7's six dialogue relations hold no question and no answer. A dialogue binds outbound category `editor-selected-manuscript-excerpt`, which the Egress Gate admits on the local deterministic route only, and under `developer-live` asking is refused before anything is recorded ([source checkout](../development/source-checkout.md), J-16).
- **The Owner's answers of 2026-10-07 to the S17 questions.** A dialogue turn needs no plan and no `开始任务`: selecting text and asking is enough, and the composer says 「只发送所选文字和你的问题，不改稿件。」 The durable history is the DSH Session log itself under the Agent Data Root, not a copy in an AI7 record. And the real model may answer.
- **ADR 0079 §4.1 already places dialogue in the default-allowed tier.** Dialogue tasks (`就这段提问…`) need no per-Run authorization in the product. [ADR 0080](./0080-assign-a-provider-route-and-model-to-every-task-that-transmits.md) row 18 binds 对话任务 to the 快速交互角色, which is unbound and runs on the Main Editorial Role's binding (§4, §5 round one); under `developer-live` that binding is `opencode-go/deepseek-v4-flash`. Row 18 allows web search; nothing requires it.
- **Provider Processing v5 cannot carry a dialogue.** Its one rule, `developer-live-public-samplebook-analysis`, has purpose `developer-live-prompt-and-pipeline-tuning`, admits only `public-or-synthetic`, requires a Plan Envelope, a Run Authorization and a non-`unset` Run Budget Ceiling, and bounds transmissions by a Coverage Manifest a dialogue does not have. `src/service/launch-policy.ts` verifies that the `developer-live` policy has exactly one rule. Provider Processing v7, the platform-tools successor the Owner reviewed on 2026-09-12, is written and selected by no active set; S87-f3 (#473) selects it.
- **ADR 0065's Inputs clause and AGENTS.md's Protected material paragraph** say that only admitted Public SampleBooks may be transmitted to a model. Read alone, AGENTS.md's sentence could be taken to forbid the product's `ordinary-production` scope, which transmits the editor's own manuscripts under Provider Processing v6 ([project constraints](../agents/project-constraints.md) already says so), from transmitting anything at all.

## Decision

### 1 · `developer-live` may carry one user-initiated dialogue turn

The scope's purpose widens from tuning the analysis contracts to also carrying an Interactive Editorial Dialogue turn the editor starts on a developer host. A dialogue attempt under `developer-live` is eligible on these terms, and no others:

1. **Origin.** One attempt (`ask`, `continue` or `regenerate`) the editor starts in the foreground on an exact selection. There is no Plan Envelope and no Run Authorization (the Owner, 2026-10-07): the exact selection and the question are the authority, as ADR 0079 §4.1's default-allowed tier says. No Default Execution Rule, Background Analysis Enrollment, schedule or other dispatch may start one.
2. **One transmission, one Session.** An attempt sends exactly one payload over exactly one technical Session. Nothing is retried, re-sent or continued in the same Session; `继续回答` and `重新回答` are new attempts with their own Session (UI ADR 0014).
3. **The payload.** The frozen dialogue contract, the exact selected words, the question and, on `继续回答`, the complete fragments the stopped attempt kept — nothing else. The Egress Gate admits it by matching the attempt's one admitted message against the immutable Execution Binding, as S17a's gate already does.
4. **Outbound category `editor-selected-manuscript-excerpt`.** The Egress Gate admits it on the `opencode-go` route only under the dialogue rule, and keeps refusing it on every other remote route and rule.
5. **Carried unchanged from v5.** The exact binding (Main Editorial Role → route `opencode-go`, endpoint `https://opencode.ai/zen/go/v1/chat/completions`, model `deepseek-v4-flash`, slot `opencode-go`), no fallback, no second model; the house-people redaction of ADR 0079 §4.4, which applies to everything the payload is assembled from; the Provider Account Limit — a limit response is `quota-exhausted`, ends the attempt with no retry, no fallback and no second model; no web search (`webSearchToolAllowed: false`) — row 18's permission to use the web is not taken up here; human-attended, developer host only, never CI or hosted; no fixture emission and no upload.
6. **The cost bound is structural.** A dialogue has no Run and no Coverage Manifest, so ADR 0065's Run Budget Ceiling clause does not apply to it. One transmission of a bounded payload per attempt is the bound. Whether the rule also declares a per-attempt output cap is a byte the Owner reviews (§3).
7. **Persistence.** The Harness Session Ledger under `<data root>/harness-sessions/` is the admitted persistence of the question and the answer text, as UI ADR 0014 and S17a keep it. No AI7 relation, log or diagnostic holds either.
8. **Live once.** Every live dialogue item goes through the Provider Test Ledger and the Provider Result Cache of [ADR 0067](./0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md): it carries a test-item identifier, an identical request replays from the cache, and a repeated item is refused unless the Owner marks it stale.

ADR 0065's analysis clauses are unchanged for analysis Runs.

### 2 · What it does not change

- `development-ci` stays provider-free: CI, the E2E Gate and J-16 keep the local deterministic route.
- `ordinary-production` gains nothing here. A production dialogue rule comes with the production successor that binds row 18, under ADR 0080 §4.
- The credential stays under ADR 0067: the enrollment helper is the only reader of the key file and the Credential Broker releases the value only against a `transmit-remote` ticket for the bound attempt.
- A dialogue answer gains no authority (UI ADR 0014). `转为修改建议` stays a separate governed object.

### 3 · The rule ships with S87-f3's revision (the Owner, 2026-10-08)

No separate Provider Processing revision is cut for the dialogue now. Its rule enters the same `developer-live` revision that S87-f3 (#473) writes and selects for the platform tools, beside the analysis rule. S17c, the live dialogue route, follows S87-f3.

v7's bytes, reviewed on 2026-09-12, do not contain the dialogue rule. S87-f3 states how the revision carrying both rules is numbered: v7 rewritten before any active set selects it, or a successor that leaves v7 as unselected history. Either way the Owner reviews the whole revision byte by byte before that pull request is Ready, as ADR 0079 §2.5 requires. This record fixes the terms of §1; the bytes are the Owner's.

### 4 · The SampleBook rule is a development and testing rule (the Owner, 2026-10-08)

The Owner: 「我们指的是测试中只允许公开样书发送，实际使用中这方面没有限制。测试中修改后的也可以发送」. Read precisely:

1. **The development scopes.** In `development-ci`, `fixture-recording` and `developer-live`, and in every test, fixture and CI input, only an admitted Public SampleBook may be transmitted to a model. Today that is exact `sample1` (ADR 0079 §5.3). ADR 0065's "private manuscripts stay prohibited in every development scope" stands as written.
2. **`ordinary-production` is not a development scope.** In real use the editor's own manuscripts are transmitted under that scope's Provider Processing document (v6 today), its rules and its redaction, with no SampleBook restriction. Nothing in ADR 0065 says otherwise: its Inputs clause governs `developer-live`.
3. **Edited `sample1` is `sample1`.** The transmittable set identifies a Book by its Source Version, which must be exact `sample1`, and accepts any revision of that Book's manuscript. Text a tester has edited in it may be sent. This is how the analysis path already reads it: `src/service/analysis/execution.ts` checks the source digest and the analysis store checks the lineage. One boundary holds: editing is a test of the product, not a carrier. Text of another manuscript pasted into the `sample1` Book is that manuscript, and sending it remains prohibited.
4. **The repository rules are unchanged.** AGENTS.md's Protected material paragraph governs the repository, working trees, hosted CI, logs, artifacts, fixtures, corpora and distributions, and every development host. Nothing about that changes. ADR 0079 §5's repository admission and §5.4's fixture-generator rule are untouched: this reading concerns what may be transmitted, not what may be stored.
5. **AGENTS.md says so in one line.** Its transmission sentence now reads that development and testing may transmit only admitted Public SampleBooks (a tester's edits of `sample1` included), only under `developer-live` on a developer host, and that the product's `ordinary-production` scope transmits the editor's own manuscripts under its own policy.

### 5 · What stays for S87-f3 and S17c

**S87-f3 (#473), in the policy revision it selects:**

- the dialogue rule's bytes: its purpose, `editor-selected-manuscript-excerpt` added to the document's outbound categories with its Chinese label, origin without plan or authorization, one transmission and one Session per attempt, the payload set of §1.3, the v5 binding, redaction, account-limit and capture terms, `webSearchToolAllowed: false`, any per-attempt output cap;
- the revision's schema and human projection, and the active-policy-set successor that pins it;
- the launch-policy pins: `config/source-checkout-launch-authority.json`, the `ACTIVE_SET_*`, `PROVIDER_PINS` and `DEVELOPER_LIVE_POLICY_BINDING` constants and `verifyDeveloperLivePolicy` in `src/service/launch-policy.ts` (which must accept the second rule), the policy lists in `tools/build.mjs`, the launch-policy and policy-schema tests, and every `'v5'` literal the selection moves;
- the policy README, CONTEXT-MAP.md and the Execution context's target-qualified route.

**S17c, after S87-f3:**

- a schema revision that widens `dialogue_execution_bindings`: the route and scope CHECKs, a nullable fixture digest, and the policy version, rule, credential slot and test-item columns;
- the policy gate in `src/service/dialogue/dialogue-execution.ts`, and the Egress Gate branch that admits `editor-selected-manuscript-excerpt` on `opencode-go` only under the dialogue rule;
- one transmission path shared with analysis, extracted from the private `transmitOnce` of `src/service/analysis/execution.ts`, and the Provider Result Cache's item identifiers, which today name only S40's items;
- the route disclosure in the dialogue surface (a protocol revision), and the limit and cache-replay states it shows;
- the first named live item, under ADR 0067.

## Consequences

- **The dialogue can answer from the real model on a developer host** once S87-f3 and S17c land. Until then, asking under `developer-live` stays refused before anything is recorded, as S17a built it.
- **Replay is visible to the developer.** Under live-once, `重新回答` over the same selection and question is an identical request and replays the cached answer. A fresh live answer needs a new or stale-marked item. S17c's Brief says how the surface shows a replayed answer.
- **The `developer-live` policy gains a second rule** with a different shape: no Coverage Manifest bound, no Plan Envelope, no ceiling. The one-rule pin in `launch-policy.ts` and the policy schema both change, which is why the rule rides a revision that is already moving those pins.
- **S17c waits on S87-f3.** The dialogue's live route is serialized behind the platform-tools slice rather than cutting a revision the platform tools would replace weeks later.
- **The privacy rule now has two halves that do not collide.** The product's rule stays ADR 0079's one sentence: the text may go to the model and its tools, it is never published verbatim to the public web, and the house's people never leave. The development rule is that tests send only `sample1`, edited or not.

## Rejected alternatives

- **A separate `developer-live` revision for the dialogue now.** Rejected by the Owner (2026-10-08): it would move the same launch pins S87-f3 moves, and add a second byte review for one rule.
- **Require a plan and `开始任务` for a dialogue turn**, so that the dialogue fits ADR 0065's clauses unchanged. Rejected by the Owner (2026-10-07): selecting text and asking is enough, and ADR 0079 §4.1 already puts dialogue in the default-allowed tier.
- **A Run Budget Ceiling per dialogue turn.** Rejected: a dialogue has no Run, and one bounded payload per attempt is already the bound. A per-attempt output cap, if wanted, is a policy byte.
- **Keep a copy of the answers in an AI7 relation.** Rejected by the Owner (2026-10-07) in favour of the Harness Session Ledger, which keeps UI ADR 0014 and [ADR 0011](./0011-separate-task-business-and-harness-execution-ledgers.md) as written.
- **Read "only Public SampleBooks" as a product rule.** Rejected by the Owner (2026-10-08): it is a testing rule, and the product transmits the editor's own manuscripts under `ordinary-production`.
- **Admit only the unedited import of `sample1`.** Rejected by the Owner (2026-10-08): 「测试中修改后的也可以发送」.
