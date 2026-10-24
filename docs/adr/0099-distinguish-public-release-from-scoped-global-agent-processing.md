---
status: proposed
date: 2026-10-25
deciders: Owner — exact-text acceptance pending
---

# 0099 · Distinguish public release from scoped Global Agent processing

**Owner acceptance is pending.** This is the proposed-only outcome of [#1123 revision 1](https://github.com/zhouy1017/ai7-harness/issues/1123), verified against candidate `codex/integration-21@89644754129b3a54741f75c24e682172f9cdda5d`. Allocating 0099 identifies this proposal; it grants no acceptance, policy selection or runtime permission. [ADR 0079 §4.4](0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md#4--network-egress-in-the-product), its dependent clauses and current redaction remain binding.

## Context

The [Editorial context](../domain/editorial/CONTEXT.md) distinguishes Unpublished Editorial Material from Public Release Permission: internal editorial processing and public release are different actions. An inference request to the editor's configured provider is not publication merely because its endpoint is internet-accessible. Processing still needs its own source, policy and execution authority; provider configuration alone supplies none of them ([Execution context](../domain/execution/CONTEXT.md)).

[#1071 decision 2](https://github.com/zhouy1017/ai7-harness/issues/1071#issuecomment-6379596688) records the Owner's principle that ordinary-production Book-less Global Agent dialogue has no outbound-category restriction, with disclosure retained and categories used for bookkeeping. The [Commander's application](https://github.com/zhouy1017/ai7-harness/issues/1071#issuecomment-6381981177) also proposed removing house-people/internal-note redaction, but the [controlling correction](https://github.com/zhouy1017/ai7-harness/issues/1071#issuecomment-6382289920) superseded that application: accepted ADR 0079 §4.4 requires an Owner-accepted amendment naming its affected clauses. The [v27 landing record](https://github.com/zhouy1017/ai7-harness/issues/1071#issuecomment-6383282475) retains redaction. Recorded intent is not acceptance of this exact proposal; the comments' future policy-version references reserve no version here.

## 1. Proposed exception and source boundary

After Owner acceptance of this exact text, dependent-clause alignment and separately authorized policy selection/runtime work, **only human-attended ordinary-production Book-less Global Agent `ask`, `continue` and `regenerate` attempts** may send their already-admitted payload to the editor's configured Fast Interaction Role without stripping words merely because they contain house-people names/roles or internal-note wording.

The payload remains the frozen dialogue contract, explicitly listed eligible memory/preference revision **projections**, the editor's deliberately supplied words, and already-retained complete continuation fragments under the existing attempt contract. It does not become the full memory record, source lineage, examples, all preferences, a Book, a manuscript or a library scan. Eligibility, supervision, exclusion, deactivation, exact revision pins and consumption-time revalidation still govern each projection; removing redaction cannot admit an otherwise ineligible source.

Deliberately typing or pasting one's note wording is editor input, distinct from authorizing AI7 to read an **Editor Note object** or its anchored manuscript. The object remains excluded as a model source and from Task/Run readable source scope. Mentioning a note or Book grants no read authority. This proposal supplies no note picker, note-to-learning admission, ambient memory/Book/library retrieval or new source kind.

For this dedicated dialogue, outbound categories remain disclosure/accounting classifications rather than a content-category refusal gate, as v27 already records. This changes neither the category definitions nor their bounds on other rules. Book dialogue, curation, review, polish, evaluation, factual verification, search and background stages receive no exception.

Current `localTools.targetedRetrieval.allowed: false` and `oneBoundedPayloadPerAttempt: true` remain intact, together with one technical session per attempt, the existing source/count/format/size limits and no web tool. Continue/regenerate remain explicit new attempts, with no automatic resend inside the old session. The wider F06 tool/source/attempt authority needs its own contract; neither category-free wording nor this redaction proposal grants it.

## 2. Authorities and history preserved

- Public Release Permission remains exact material/channel authority, distinct from provider processing. The V1 prohibition on publicly publishing manuscript text verbatim ([ADR 0079 §4.1](0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md#4--network-egress-in-the-product)) and the Local-only Export Boundary remain. Publication Version, local export preparation/approval/receipt, delivery and single-use manuscript Apply retain their separate authorities. No public posting, upload or publishing capability follows.
- Trusted launch still selects one operational scope. `developer-live`, provider-free development CI/Gate and fixture recording retain their selected policies and material boundaries; development transmits only admitted Public SampleBooks, including permitted tester edits of `sample1`. Another manuscript pasted into `sample1` stays protected. The manuscript/derivative repository, worktree, CI, log, artifact, corpus, fixture and distribution prohibition, with only its exact admitted exceptions, is unchanged ([AGENTS](../../AGENTS.md#protected-material), [project constraints](../agents/project-constraints.md#ownership-provenance-and-protected-material)). This proposal admits no material, dependency or credential and grants no release or `main` promotion.
- [ADR 0088, Dialogue contract item 3](0088-carry-the-editorial-dialogue-under-developer-live.md#dialogue-contract) retains its redaction and bounded development dialogue. [ADR 0095 §1 and §6](0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md#6-one-production-policy-a-runtime-model-table-and-two-new-outbound-categories) retain the no-person-name and other bounds on 编辑任务说明 and 本社审阅规范条款. [ADR 0094 §3–4](0094-unified-multi-provider-runtime-global-learning-agent-and-word-track-changes-intake.md#3-opt-out-local-learning-with-intelligent-curation) retains learning admission, lineage, exclusions, supervision and explicit source authority. No background enrollment, learning envelope, curation dispatch or model-training permission follows.
- Exact policy/provider/route/model/protocol and credential reference/generation binding, the Credential Broker, trusted recipient and final single-use Payload/Egress Gate remain. Secret values never enter prompts, disclosure, memory, logs or model-visible state. There is no new recipient, fallback, second model or tool. Existing stopping, account-limit, interruption, outcome-unknown and never-resend obligations remain; this proposal adds no approval dialog or budget.
- Disclosure must show the actual assembled projections, editor words, retained fragments and recipient before the explicit attempt action. A later runtime child must prove preview-to-send equality and revalidate source eligibility/pins, text and policy/provider/credential binding after queuing and at the final gate. A stale source or binding refuses the old send; removing a filter cannot leave a preview of different bytes.
- Old policies keep their bytes and behavior. Old attempts keep their original policy/binding and recorded payload/history; there is no history rewrite, implicit migration or reconstruction of previously redacted words from source objects. Continuation/regeneration cannot silently replace old retained text with richer source content. A later explicit new attempt needs fresh valid disclosure under its applicable policy and the unchanged continuation/source contract; recovering omitted words requires new deliberately supplied input, not hidden retrieval. The Harness Session Ledger remains the transcript owner; dialogue projections remain non-authoritative joins.

## 3. Exact proposed clause amendments

These are proposed replacement operations at the recorded base, **not changes made by this file**. References to “ADR 0099 §1” mean only the gated, bounded exception above. Unnamed text stays unchanged. The dated Owner quotations remain historical evidence; the export amendment's historical scope is preserved. This ADR is the single proposal owner, not a parallel requirements or policy document.

| Existing owner and exact clause | Exact proposed replacement or addition |
| --- | --- |
| [ADR 0079](0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md), §4 item 4 **What may leave** (4c) | Replace `the house's people never leave — 责编 and 相关人 names and roles, 备注 and internal notes are stripped before transmission` with `except for the admitted payload and attempts defined in ADR 0099 §1, 责编 and 相关人 names and roles, 备注 and internal notes are stripped before transmission`. Preserve the manuscript/author/house-name statements and ADR 0095 category sentence. |
| ADR 0079, §2 item 4 **The production policy is revised in the same step** | Replace `the redaction rule of §4.4` with `the redaction rule of §4.4, subject only to ADR 0099 §1`. |
| ADR 0079, §3 introductory **Amended on 2026-09-10** paragraph | Preserve the dated export-only amendment and append: `The later ADR 0099 §1 exception qualifies the current provider-redaction reading only; it does not change this export amendment or MARK-006's note-object source exclusion.` |
| ADR 0079, **Clauses changed**, first requirements bullet | Preserve its account of the export-only change and append: `For current provider-redaction behavior, V2-UX-EGR-004 and MARK-006 are additionally read with the limited ADR 0099 §1 exception; their other obligations remain.` |
| ADR 0079, **Consequences**, privacy-summary bullet beginning “The product's privacy rule fits one sentence” | Replace that bullet with: `Admitted text may go to the model and its tools; manuscript text is never published verbatim to the public web; house-people and internal-note redaction remains except for the dedicated Global Agent payload and attempts of ADR 0099 §1.` |
| [ADR 0080](0080-assign-a-provider-route-and-model-to-every-task-that-transmits.md), **Context**, “The product's privacy rule is settled” bullet only | Replace `备注 and internal notes are stripped;` with `备注 and internal notes are stripped except for the dedicated Global Agent payload and attempts of ADR 0099 §1;`. Preserve the rest of the bullet and all provider/tool rules. |
| [Requirements](../ui-ux-v2/requirements.md#network-egress), **V2-UX-EGR-004** | Replace `备注 and internal notes are stripped before transmission;` with `备注 and internal notes are stripped before transmission except for the dedicated Global Agent payload and attempts of ADR 0099 §1;`. Preserve the other sentences/clauses and category bounds. |
| [Requirements](../ui-ux-v2/requirements.md#editorial-marks), **V2-UX-MARK-006**, first sentence only | Replace that sentence with text A below. Preserve default-off export, per-export inclusion and explicit conversion to 批注. |
| [Editorial CONTEXT](../domain/editorial/CONTEXT.md), **Editor Note**, definition paragraph only | Replace that paragraph with text B below; retain its Chinese name and `_Avoid_` line. |
| [UI CONTEXT](../ui-ux-v2/CONTEXT.md), **Editor Note** (`备注`), definition paragraph only | Replace that paragraph with text C below; retain its `_Avoid_` line. |
| [Editor surfaces](../ui-ux-v2/editor-surfaces.md), **1 · ① 稿件入口**, mark table's **备注** row, final cell only | Replace ``默认不导出，可选 `含备注`；不发给模型，不进任务范围`` with ``默认不导出，可选 `含备注`；备注对象不发给模型、不进任务范围；编辑可按 ADR 0099 §1 在全域对话主动输入同样文字，不授权读取备注或其稿件``. Keep author, color, actions and other cells. |
| [Information architecture](../ui-ux-v2/information-architecture.md#editorial-marks), **Editorial marks**, 备注 diagram row only | Replace that row with `├─ 备注 · editor-private object · not exported by default · object never sent; wording only as explicit ADR 0099 §1 input · fixed color`. Keep the following actions and all navigation. |

**Text A — MARK-006 first-sentence replacement:**

> 备注 is an editor-private object excluded as a model source and from a Task/Run's readable source scope. The editor may deliberately supply its wording as their own input only under ADR 0099 §1's Global Agent exception; this authorizes neither reading the note object or its anchored manuscript nor a note-selection or learning-admission capability.

**Text B — canonical Editor Note definition replacement:**

> An editor-private note bound to an exact Manuscript Revision range that does not leave with an export by default and leaves only when the editor includes it in that export; it is excluded as an object from Provider payloads and Run Source Scope and may be converted to an Annotation explicitly (ADR 0076; ADR 0079 §3). The editor may deliberately supply its wording as their own input only under ADR 0099 §1; this grants no read of the note object or its anchored manuscript and adds no note-selection or learning-admission capability.

**Text C — UI Editor Note definition replacement:**

> The presentation of a canonical Editor Note: an editor-private note on exact text that does not leave with an export by default and leaves only when the editor includes it in that export; the object is excluded as a model source and from a Task's readable scope (ADR 0076; ADR 0079 §3 as amended 2026-09-10). Deliberately supplied wording is editor input only under ADR 0099 §1, with no authority to read the note object or its anchored manuscript and no new note-selection or learning-admission capability.

ADR 0080 §5.3 **Question 2 — the search service as a second recipient** is deliberately unchanged: this tool-free exception neither changes that historical reasoning nor permits search queries to acquire additional text. ADR 0079 §4.1, §3 export rules and §5 material admission, EGR-001/002/003/005, EXP-023, ADRs 0088/0094/0095 and the existing Public Release Permission/Provider Processing/External Export/Global Agent Session definitions are not amended. Later accepted-text alignment must remove contradictory current readings within this map while retaining unaffected rules and historical quotations ([design authority](../agents/design-authority.md), [document lifecycle](../agents/document-lifecycle.md)).

## 4. Current evidence and later validation

At the recorded candidate base, static inspection shows the restriction is intentional:

- [Provider Processing v27](../policies/provider-processing-policy.v27.json), rule `ordinary-production-global-agent-dialogue`, has both redaction booleans true, explicit memory/preference revision sources, `targetedRetrieval.allowed: false` and `oneBoundedPayloadPerAttempt: true`. The [policy index](../policies/README.md) qualifies its integration-line selection; [#1121](https://github.com/zhouy1017/ai7-harness/pull/1121)'s unselected successor candidate remains separate and retains redaction.
- [`readWave21Eligibility`](../../src/service/launch-policy.ts) requires `HOUSE_PEOPLE_REDACTION`. [`admittedGlobalAgentRoute` and `startGlobalAgentTurn`](../../src/service/dialogue/global-agent-session.ts) require it and recheck disclosed sources/text/binding at send. [`inspectGlobalAgent`, `globalAgentRedact`, `prepareGlobalAgentTurn` and `globalAgentAttempt`](../../src/service/store.ts) construct the limited projections and redact listing/question/retained text.
- Existing [Global Agent service tests](../../tests/service/ordinary-production-global-agent.test.ts) and [launch-policy tests](../../tests/unit/launch-policy.test.ts) specify redaction, stale disclosure refusal and absent retrieval/tools. They were read as implementation evidence, not executed for this proposal. Changing only policy flags or a shared redaction constant would not satisfy these readers or preserve predecessor behavior.

Independent review precedes Owner acceptance of exact named text. Dependent clauses then need separately assigned alignment; a separately reviewed immutable policy successor and trusted selection need their own authority; a bounded runtime/test/Journey child must preserve predecessor behavior and prove the scenarios below. No policy version is reserved, no current candidate is silently amended or selected, and this document claims no product validation or activation.

| Later scenario using admitted synthetic/public test material | Required outcome |
| --- | --- |
| Editor supplies synthetic house-person/note words in a new eligible attempt after acceptance and selection | Actual disclosure and sent payload match without the dedicated privacy strip; existing format/size bounds still apply. |
| A listed eligible memory/preference projection contains those words | Only that projection is sent; no underlying note, examples, lineage or manuscript is read. |
| A source is unlisted, excluded, deactivated, superseded or barred by supervision; a pin/text changes while queued | Eligibility/staleness refusal still wins before send. |
| Editor mentions a note or opens a Book; F06 requests a retrieval/tool turn | No object read or extra payload; current retrieval/tool prohibitions require a separate contract to change. |
| Recipient, policy, provider/model or credential reference/generation changes after disclosure | Old send is refused; no secret value appears in model-visible material. |
| Predecessor policy or noncovered production/development rule executes | Existing redaction, scope, payload and material bounds remain. |
| Old redacted history is continued/regenerated after a future selection | No reconstruction, source expansion, migration or history rewrite; only valid retained content under the applicable new-attempt contract. |
| Cancellation, interruption or unknown outcome; request for publication/export/Apply/background action | No automatic resend or authority conversion; existing explicit action and separate authority rules remain. |

Documentation review covers links, directive/authority consistency, these scenario walkthroughs and `git diff --check`. It supplies no provider, fixture, guest, Electron, build, hosted Gate or editorial-quality evidence.

## 5. Consequences and Owner choices

The proposed distinction removes one content strip from an already bounded processing action while preserving source admission and public-release authority. It requires coordinated later policy/runtime/disclosure work; it cannot safely be implemented as a global filter toggle. Retaining universal redaction remains the current behavior and the alternative if this text is not accepted.

The Owner must still choose:

1. This bounded Global Agent scope, or a separately inventoried wider ordinary-production scope covering affected tasks, categories, sources and tool recipients. No wider exception is inferred.
2. Deliberately supplied wording only, or separately authorized note-object/source/learning capabilities with their own affected-clause inventory. This proposal grants only the former if accepted.
3. Whether to accept this exact named ADR text after independent review. The recorded principle does not accept the draft by implication.

Until that acceptance and separately authorized follow-through, current redaction and permissions remain unchanged. Drafting completion does not close #1123 or #1071, authorize merge/Ready, or complete runtime delivery.
