---
status: proposed
date: 2026-10-25
deciders: Owner — exact-text acceptance pending
---

# 0101 · Admit scoped full-fidelity learned examples

**Owner acceptance is pending.** This is the proposed-only outcome of [#1141 revision 1](https://github.com/zhouy1017/ai7-harness/issues/1141), authored against accepted `codex/integration-21@d1c31c40428057bdc5a637f55fd8d63dd496d5ec`. Allocating 0101 identifies this proposal; it grants no acceptance, policy selection, source admission or runtime permission. A completed review, a green check, a merge of this file or the Commander's preparation approval does not accept it and activates no processing; only the Owner's recorded acceptance of this exact text, then named in the status line, does. Until that acceptance and its separate follow-through, [ADR 0079 §4.4](0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md#4--network-egress-in-the-product), its dependent clauses and the selected policies govern unchanged.

The proposed exception is ordinary-production only. `developer-live`, development CI and the Gate, fixture recording, the admitted-material boundaries of [AGENTS](../../AGENTS.md#protected-material) and every current development redaction and source rule are unchanged.

## Context

[ADR 0094 §3](0094-unified-multi-provider-runtime-global-learning-agent-and-word-track-changes-intake.md#3-opt-out-local-learning-with-intelligent-curation), [ADR 0095 §7](0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md#7-the-learning-agent-may-ask-why) and the [Learning Eligibility Policy](../policies/learning-eligibility-policy.md) accept local learning from real editorial decisions, imported Word revision pairs and editor rewrites, governed curation into Global Editorial Memory Items and Editorial Exemplars, and later use by review, polish and dialogue. [F05 #1024](https://github.com/zhouy1017/ai7-harness/issues/1024) delivers that learning. None of these lifts redaction or grants a raw source or purpose.

ADR 0079 §4.4 lets the manuscript's text and the author's information reach a Model Provider but strips 责编 and 相关人 names and roles, 备注 and internal notes before transmission. Every rule of the selected ordinary-production [Provider Processing v27](../policies/provider-processing-policy.v27.json) keeps both redaction booleans true. Pending [#1121](https://github.com/zhouy1017/ai7-harness/pull/1121) at `a60c843d97a827aea42ad4db004d143921ae9acf` prepares unselected candidates — v28 `f8e5f1031f2e923e7693fdc153497349f368a12c5929714c7af9aa5afadcb147`, v29 `c9545a5f461a7791115c1f4664bbd731757775951f814d39c28b12c85af88c9d`, set v20 `c5587d32e87a6422a09d2c3cb77271d1e0773a016923b91b776c623a7b5ff168` — whose `ai7.editorial-learning-example/1` admits only native proposal-decision examples, only for curation, after redaction (`redactionLifted: false`).

A full-fidelity learned example is the editor's exact words: the text before, the proposal, the chosen text and the decision reason. Those words can name a colleague, a role or a note's content. The existing known-name filter replaces literal names it already knows, and omitting personnel and note objects proves that no such object was joined. Neither proves that arbitrary original text contains no house person's name, role or internal-note wording. Under §4.4 such text must therefore be stripped, which destroys the example's fidelity, or held, which blocks raw use altogether.

The Owner's 2026-10-24 direction, quoted in the [#1071 application](https://github.com/zhouy1017/ai7-harness/issues/1071#issuecomment-6381981177) (「隐私限制公开发布，不限制向LLM供应商传输」), sets the principle that privacy restricts public release, not transmission to the editor's model provider; the [controlling correction](https://github.com/zhouy1017/ai7-harness/issues/1071#issuecomment-6382289920) keeps §4.4 until an accepted amendment names its affected clauses, and the [v27 landing record](https://github.com/zhouy1017/ai7-harness/issues/1071#issuecomment-6383282475) retains redaction. The canonical [Unpublished Editorial Material and Public Release Permission](../domain/editorial/CONTEXT.md) definitions already separate internal processing from public release. This proposal is the explicit, field-level amendment that correction requires; the principle does not accept it by implication.

Two independent proposals are pending and unaccepted at the authoring base: [ADR 0099 at `3f945eee`](https://github.com/zhouy1017/ai7-harness/blob/3f945eee805fc8d9263249099f10878129641cba/docs/adr/0099-distinguish-public-release-from-scoped-global-agent-processing.md) (Book-less Global Agent input and listed projections only, no examples or lineage) and [ADR 0100 at `825cb2d8`](https://github.com/zhouy1017/ai7-harness/blob/825cb2d88dee06c51677e83ae6a8510679aea16d/docs/adr/0100-admit-scoped-editor-task-instruction-text.md) (the saved ≤1,200-grapheme instruction of its authored-typos, Main Role branch only). Neither grants a raw example. This text neither edits nor depends on accepting either, and preserves each one's separate predicate.

Alternatives considered: a universal name/role/note classifier cannot prove absence in arbitrary text and would be a hidden rule; a per-example human clearance checkbox or artifact reintroduces the per-item approval ADR 0094 §3 removed; a privacy-off flag or a flip of the shared redaction booleans would lift the strip for unrelated payloads; keeping the strip is the current behavior and the outcome if this text is not accepted.

## 1. The proposed exception

After (a) the Owner's acceptance of this exact text, (b) separately authorized alignment of the clauses in §6, (c) a separately reviewed and selected immutable policy successor that names the source variant and purpose and (d) a faithful accepted typed consumer, **only the listed original text fields** of an eligible example from one closed source family (§2), consumed by one of five separately granted purposes (§3), sent only to the model provider bound to that exact attempt (§4) and under the proof, fidelity and bounds of §5, may avoid refusal or removal **solely because** they contain a house person's name, a house-person role or internal-note wording. In §6, “the learned-example text processing of ADR 0101 §1” means exactly this conjunction.

The exception is ordinary-production and field-level. It does not follow arbitrary data attached to an example, expose a whole source row, or change what any other part of the same payload may contain; the manuscript's text and author information keep their existing permissions. It does not claim that a filter, classifier or projection proves the listed words private-word-free, and it adds no per-example human clearance, checkbox or artifact. Existing learning controls and each consumer's ordinary explicit action, or the enabled-learning envelope for curation, remain the authority.

These stay excluded even inside the exception:

- structured author, editor and related-person attribution arrays, personnel and role lists, Book titles, file paths, operational identifiers carried as incidental metadata, credentials and secret values;
- Editor Note and internal-note objects, note pickers, automatic note copying, note-to-example conversion, hidden source reconstruction and reads of a note's anchored manuscript;
- ambient Book, library or Working Corpus expansion, arbitrary rewrite history and any field whose original typed owner cannot be proved.

A real decision-feedback reason is not an Editor Note merely because it is free text, and an Editor Note does not become a reason because its words resemble one. The record's exact type and proven producer distinguish them, never a semantic classifier.

## 2. Three closed source families

| Family | Listed original fields and their truthful meaning | Independent prerequisite |
| --- | --- | --- |
| Native Proposal Decision | Complete exact before (`currentText`), proposal (`proposedText`), decision-derived after and the actual retained reason or `null`, bound to the real accepted, accepted-with-edit or rejected decision and its exact feedback prefix, revision and category. After means the chosen text, not proof of Apply. A suggested reason stays labeled suggested. | The actual native producer, the required review origin, complete lineage and current eligibility, and the selected typed source/consumer contract. The first implementation remains native same-Book `editorial-review/typos-and-usage`. |
| Word Tracked Edit Sample | Complete exact before and after fragments and typed paragraph boundaries of a real accepted sample, preserving its operation, intake mode and source identity. No proposal, decision, reason, Apply result or positive vote is fabricated. | The actual accepted [F-07 #1026](https://github.com/zhouy1017/ai7-harness/issues/1026) intake, sample, source, import and admission contract under [ADR 0094 §5](0094-unified-multi-provider-runtime-global-learning-agent-and-word-track-changes-intake.md#5-two-tracked-change-import-choices) and current learning controls, then a separately accepted model consumer. Either intake mode alone is neither endorsement nor rejection. |
| Manual Edit Journal observation | Complete exact before and after transformation from the actual accepted source. No proposal, decision, reason or independent support is fabricated. | A separately accepted capture and causal/status eligibility consumer that preserves undo/redo, later edits, supersession, restoration and recovery meaning. Local journal or capture presence is not model eligibility. |

Naming the Word and manual families is only a prospective text exception. It preapproves no capture API, source classifier, causal grouping or frontier, support or contradiction count, or model eligibility; missing proof holds the source and its bundle. The optional reason belongs only to the native decision family: Word author, date or comment metadata, guessed manual intent and nearby notes never become a reason. Another reason-bearing variant needs its own closed decision.

## 3. Five separately granted purposes

Each purpose needs its own selected rule, typed source variant and exact consumer contract; no rule inherits another's permission.

1. **Model-driven curation** (`learning-curation`): under its separately authorized role and binding and the actual enabled-learning envelope — eligible sources and categories, supervision, exact Task and Run, finite budget and idle dispatch. Local collection or import is no extra grant; activation, support, threshold and extra-pass meaning are unchanged.
2. **Editorial review reference**: under the actual category or procedure's separately authorized role, exact Review Run, Task and Plan and declared typed context. The first consumer is native same-Book typos. Later closed kinds may be `editorial-review/typos-and-usage`, `editorial-review/style-and-format`, `editorial-review/literary-expression`, `editorial-review/cross-deliverable-consistency`, `editorial-review/factual-review`, `editorial-review/academic-integrity`, `editorial-review/series-consistency` or `editorial-review/publication-risk`; a later selected contract enumerates its exact kinds. This proposal does not select all eight and adds no standalone factual-review or re-check, evaluation, writing, translation, conflict-regeneration or custom-analysis raw purpose.
3. **Polish reference** (`editorial-polish`): one deliberate polish action on the selected text with separately typed raw context under its own role and binding. The current and prepared generalized-line polish contexts gain no raw example; suggestions stay editor controlled.
4. **Book dialogue reference** (`editorial-dialogue`): an explicit ask, continue or regenerate with its Book and an exactly disclosed, pinned source bundle under its own role and binding. A session, the last Book or a preference supplies no extra authority.
5. **Global dialogue reference** (`global-agent-dialogue`): an explicit ask, continue or regenerate in which every eligible memory and the complete raw source bundle and its Book scope are disclosed and pinned under its own role and binding. No ambient library read, and nothing is inherited from title-only or line projections or from pending ADR 0099.

**Roles are inherited, not assigned.** [ADR 0080 §1](0080-assign-a-provider-route-and-model-to-every-task-that-transmits.md#1--every-task-that-transmits-its-model-role-and-the-capabilities-it-needs) rows 5 and 6 name the Fast Interaction Role for general typos and format review; the selected v27 review rule binds the Main Editorial Role; pending ADR 0100 proposes Main only for its authored-typos branch. This privacy proposal resolves none of that and assigns Main to no review. Curation's planned Main binding and the Fast bindings of polish and dialogue create no new role permission either; a consumer without separately accepted role authority stays held.

**Scope stays exact.** Every included source's Book and House scope and exclusions must be current. Foreign ancestry is never trimmed to make a mixed bundle look same-Book. Cross-Book use needs an explicitly accepted scope with a complete current source closure; Global entry is not that scope, and this proposal creates no House eligibility.

## 4. Recipient, tools and dialogue

Only the model provider bound to the exact attempt receives exempt fields — never a web or search service, external tool, subagent or other recipient. Raw-bearing context **and** retained fragments need an enforceable no-forwarding boundary. A declared tool-free attempt proves that dimension; any other isolation contract needs actual independent proof. A named host, a known-literal scan of tool arguments, a sampled absence of leaks or a model instruction proves nothing. Without proof, raw use is held while independently authorized plain or line-only behavior continues; required search is not disabled to claim the original consumer complete, and no hidden session, stage or request is added to bypass the hold. Existing local tools keep their own limits, and no new capability follows.

In Book dialogue the exception reaches only newly admitted ordinary-production typed raw fields. The selected manuscript words, the question, every other existing field and all development dialogue keep the [ADR 0088](0088-carry-the-editorial-dialogue-under-developer-live.md#dialogue-contract) item 3 strip. Old fragments are not reconstructed, reclassified or enriched. A continuation carrying exempt raw wording needs its exact future typed provenance, source, bounded-payload and no-forwarding proof; otherwise it is held. The explicit attempt, one technical Session, bounded persistence, account-limit stopping and the absence of Apply, external Effect and publication authority remain.

## 5. Source proof, fidelity and bounded packets

**Proof.** Resolve the real typed producer, the complete immutable source ancestry, current learning, supervision, material, Book and House controls, the original reason presence and feedback prefix, and the consumer's authority. Curation may begin from eligible sources before any memory exists, within its envelope; later use needs the usable memory and full ancestry that consumer requires. Corruption refuses. Ordinary exclusion, oversize or an unsupported source holds the whole bundle; the convenient positives are never selected from it.

**Projection.** Project only the variant's closed fields and prove that no Note, people, credential or extra-source join occurred. That proves the source boundary, not that the original words are free of private wording, and disclosure and policy bases say so: a field such as `redactionApplied: false` must mean that no text was changed under this basis, never that the old filter proved cleanliness.

**Fidelity.** Keep the full original text: no normalization, trimming, name replacement, excerpting, reason elision or synthesized clean example. An empty side requires actual insertion or deletion semantics; `null` appears only where the variant allows a missing reason; paragraph boundaries are typed records, never invented whitespace. An oversized selected bundle is held whole.

**Identity.** Pin the source digest, original reason presence and feedback prefix, source, consumer and policy versions, controls, ordered membership and the actual emitted text digest. Real random identifiers and authority pins stay local; any model-visible opaque attribution needs its own reviewed wrapper, never fake UUID aliases. Request and fixture identity hashes the actual emitted bytes.

**Currentness.** Recheck after the capacity grant and immediately before each physical send, and separately recheck before publishing any new proposal, finding or suggestion under the consumer's accepted contract. A changed source or binding refuses without silent refresh, fallback or resend. The true sent outcome, cost and history and every old completed or retained text are preserved; nothing is retroactively enriched.

**Meaning.** Disclose complete included and held coverage and actual use. An independently usable generalized line is not raw consumption. Imports, undo, redo or budget changes never create a decision or support. Examples are editorial evidence — never factual truth, Foundation Model training or Apply — and quality, adoption and support semantics are unchanged.

**Proposed common ceilings** for later policy preparation, not current grants:

| Bound | Ceiling |
| --- | --- |
| Complete examples or groups per request | 10 |
| Each before, proposal or after side | 2,048 graphemes |
| Native reason | 512 graphemes |
| Total example text | 16,000 graphemes |
| Canonical encoded block, including typed boundary records | 131,072 UTF-8 bytes |
| Opaque reference | 128 characters |

The actual framing or consumer may be narrower and counts its outer framing. The generalized Top-5, 200-grapheme line bounds stay separate. A whole Word batch still needs complete inventory, mode-independent deduplication and an explicit complete-plan pass limit K and total ceiling T plus a per-pass ceiling L; this proposal supplies no batch, pass or default budget.

## 6. Exact proposed clause operations

These operations are proposals against `d1c31c40`, **not edits made by this file**, and apply only in separately authorized alignment after acceptance. Every unnamed word, historical Owner quotation and independent obligation stays. Selectors are exact source phrases.

**Seven core operations across five existing paths:**

| # | Owner and exact selector | Proposed operation |
| --- | --- | --- |
| 1 | [ADR 0079 §4](0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md#4--network-egress-in-the-product) item 4 **What may leave**: ``the house's people never leave — 责编 and 相关人 names and roles, 备注 and internal notes are stripped before transmission`` | Replace with ``the house's people never leave — 责编 and 相关人 names and roles, 备注 and internal notes are stripped before transmission, except that in the learned-example text processing of ADR 0101 §1 only the listed original text fields of an eligible typed example keep such wording, while personnel, role and attribution metadata and Editor Note and internal-note objects remain excluded as sources``. Preserve the manuscript, author and house-name statements and the ADR 0095 category sentence with its no-person-name bounds. |
| 2 | [ADR 0079 Consequences](0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md#consequences), privacy-summary bullet: ``the house's people never leave.`` | Replace with ``the house's people never leave, except as original wording inside the eligible typed example fields of ADR 0101 §1.`` Keep the rest of the bullet, including its public-publication prohibition. |
| 3 | [ADR 0080 Context](0080-assign-a-provider-route-and-model-to-every-task-that-transmits.md#context), “The product's privacy rule is settled” bullet: ``责编 and 相关人 names and roles, 备注 and internal notes are stripped;`` | Replace with ``责编 and 相关人 names and roles, 备注 and internal notes are stripped outside the learned-example text processing of ADR 0101 §1, which still sends no personnel metadata or 备注 object;``. No role, provider or tool text changes. |
| 4 | [ADR 0080 §5.3](0080-assign-a-provider-route-and-model-to-every-task-that-transmits.md#53-the-owners-decisions-of-2026-09-11-second-session--the-platform-tools-the-search-service-the-bounds) **Question 2**, final consequence premise: ``and the house-people strip of §4.4 already applies to everything the model reads, so no query can carry what the model never saw.`` | Replace with ``and outside the learned-example text processing of ADR 0101 §1 the house-people strip of §4.4 applies to everything the model reads, so no query can carry what the model never saw; inside it a raw-bearing context or retained fragment is admitted only where the attempt enforceably prevents forwarding exempt wording to a search service, tool, subagent or other recipient, and otherwise the raw example is held while independently authorized plain or line-only behavior continues.`` Preserve the question, the Owner's quotation, the anonymous-service permission, the no-search-credential rule, the named recipient and the query's outbound-category text. |
| 5 | [ADR 0088 Dialogue contract](0088-carry-the-editorial-dialogue-under-developer-live.md#dialogue-contract) item 3: ``House-people identity, editor notes and internal notes remain stripped according to ADR 0079 §4.4.`` | Replace with ``House-people identity, editor notes and internal notes remain stripped according to ADR 0079 §4.4, except that in ordinary production the newly admitted typed example fields of ADR 0101 §1 keep their original wording; selected words, the question, other fields and development dialogue keep the strip, no Editor Note object is read, old fragments are not enriched, and a raw-bearing continuation needs the typed provenance and no-forwarding proof of ADR 0101 §4.`` Preserve item 3's other sentences and items 1, 2, 4 and 5. |
| 6 | [Requirements](../ui-ux-v2/requirements.md#network-egress) **V2-UX-EGR-004**: ``责编 and 相关人 names and roles, 备注 and internal notes are stripped before transmission;`` | Replace with ``责编 and 相关人 names and roles, 备注 and internal notes are stripped before transmission, except as original wording inside the listed typed example fields of ADR 0101 §1, which send no personnel, role or attribution metadata and no 备注 object (MARK-006);``. Preserve the other categories and sentences. |
| 7 | [Policy index](../policies/README.md#immutable-history-and-activation), **Immutable history and activation**, after the paragraph beginning ``Preserve every predecessor policy JSON`` | Append ``ADR 0101 §1's learned-example text exception is accepted design, not a runtime selection: it applies only through a separately reviewed and selected immutable successor naming each source variant and purpose, and no selection above implements it; v27, its predecessors and unselected candidates keep their redaction bytes.`` No policy byte or selected-status claim changes. |

When ADR 0099, ADR 0100 or another accepted amendment has already changed a selector, re-derive the operation against that accepted text and compose the predicates: each exception keeps its own named scope and limits, the strip stays the default, and no composition becomes “all provider processing”.

**Four conditional operations across three additional paths**, only if pending ADR 0099's exact wording is accepted and aligned first (eleven operations across eight existing paths in total). They are composition rules, not edits to pending ADR 0099:

| # | Selector introduced by ADR 0099 | Proposed qualification |
| --- | --- | --- |
| 8 | [Requirements](../ui-ux-v2/requirements.md#editorial-marks) **V2-UX-MARK-006**, Text A: ``only the Book-less Global Agent attempts of ADR 0099 §1 send that input without the internal-note strip`` | Replace with ``the Book-less Global Agent attempts of ADR 0099 §1 alone send that editor input without the internal-note strip (an eligible native Proposal Decision reason is a separate decision-feedback record, not the note, whose original wording only ADR 0101 §1 may keep)``. Keep the note-object prohibition, no anchored read, no note picker, no automatic copying, no learning admission and the export and conversion sentences. |
| 9 | [Editorial CONTEXT](../domain/editorial/CONTEXT.md) **Editor Note**, Text B: ``only ADR 0099 §1 exempts them from house-people and internal-note redaction`` | Replace with ``as Global Agent input only ADR 0099 §1 exempts them from house-people and internal-note redaction; an eligible native decision reason repeating them is a separate decision-feedback record whose original wording only ADR 0101 §1 may keep``. Keep the original definition, the Chinese name and the `_Avoid_` line. |
| 10 | [UI CONTEXT](../ui-ux-v2/CONTEXT.md) **Editor Note**, Text C: ``only ADR 0099 §1 exempts them from redaction`` | Replace with ``as Global Agent input only ADR 0099 §1 exempts them from redaction; only ADR 0101 §1 lets an eligible native decision reason keep the same words``. Keep the object, export and source obligations. |
| 11 | [Information architecture](../ui-ux-v2/information-architecture.md#editorial-marks) **Editorial marks**, 备注 row: ``editor-typed wording is editor input, unfiltered only under ADR 0099 §1`` | Replace with ``editor-typed wording is editor input, unfiltered only under ADR 0099 §1; an eligible native decision reason keeps its words only under ADR 0101 §1, never by reading the note``. Keep privacy, default-off export, object-never-sent, color and actions. |

At untouched `d1c31c40`, MARK-006 and both Editor Note definitions prohibit the object and need no rewrite. Pending ADR 0099's editor-surfaces row already scopes its wording to input in the Global Agent and stays unchanged; it is not broadened into a source picker. Any independently accepted ADR 0100 saved-instruction predicate is preserved. The exact conditional selectors are re-derived against the actually accepted text; no acceptance dependency on an unaccepted candidate is created.

**Deliberately unchanged:** ADR 0079's Owner quotations, §2 item 4's account of the historical production successor, the §3 dated export amendment and its account, Clauses changed, §4.1's public-publication prohibition and §5's repository and development material; ADR 0080's §1 role rows, Question 2's history and every other §5.3 and §7 rule; ADR 0088's other items and its development section; [ADR 0094](0094-unified-multi-provider-runtime-global-learning-agent-and-word-track-changes-intake.md#3-opt-out-local-learning-with-intelligent-curation) §§3–5 controls; [ADR 0095 §6](0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md#6-one-production-policy-a-runtime-model-table-and-two-new-outbound-categories)'s no-person-name bounds on 编辑任务说明 and 本社审阅规范条款, which lie outside this raw-field exception; MARK-006's object and export rules, EXP-023, EGR-001/002/003/005 and the editor-surfaces mark table; the Learning Eligibility Policy; and every immutable policy and active set. Credential references and generations, the Credential Broker, source enrollment, the learning envelope, finite budgets, the final Payload/Egress Gate, Apply, export, release and never-resend stay separate. No protected development material and no manuscript or derivative in a repository, worktree, CI input, log, artifact, corpus, fixture or distribution is authorized.

## 7. Separate policy and consumer work

Current v27 and the pending #1121 bytes stay unchanged; `ai7.editorial-learning-example/1` remains native, curation-only and redacted and is not reinterpreted. No policy version is reserved and no shared redaction flag flips. Even after acceptance, a separately reviewed and selected immutable successor must name each closed source variant, its field exception, purpose, wrapper, role, recipient, currentness, budget and request bounds, together with a provider-free fixture counterpart over exact admitted public or synthetic sources and emitted bytes. No developer-live or material grant, fixture overlay, success seed or generic fallback follows.

- **First curation consumer** (F-05 part 2): its known-name, no-change test is not arbitrary-text proof, so its existing holds remain until the accepted amendment and a real successor and consumer exist. Later it revises only the native source, wire, prompt, fixture and basis, keeping its finite envelope, per-pass ceiling, one request with no tools or retry, and its financial, unknown-outcome, recovery and proposed-memory owners.
- **Word and manual:** each needs its real accepted producer, eligibility and source consumer; the Word batch rules of §5 stay.
- **Review:** raw review starts with native same-Book typos under its publication guard.
- **Polish and dialogue:** generalized-line polish stays unchanged; raw polish, Book dialogue and Global dialogue remain later distinct consumers.
- **F05:** full raw consumption, adoption and quality remain open; this proposal closes none of them.

## 8. Consequences and the Owner's decision

If accepted and delivered, the provider bound to a qualifying attempt may receive exact original wording, including house-person names, roles or note wording, inside the listed fields. No provider term, confidentiality guarantee or new recipient is inferred. In return, learned examples keep the editor's real words while structured personnel and note objects never become sources, and public release keeps its separate authority. The cost is coordinated later policy, consumer and disclosure work; it cannot be delivered as a filter toggle.

The Owner decides whether to accept this exact reviewed text and its breadth — three source families and five purposes — or a narrower inventory. Retaining universal redaction is the current behavior and the alternative. Until acceptance and separately authorized follow-through, nothing changes, and drafting completion closes neither #1141, #1071 nor #1024.

## 9. Review scenarios

Documentation review walks these with authored synthetic descriptions only; a later implementation proves them with admitted public or synthetic inputs.

| Scenario | Required outcome | Owner |
| --- | --- | --- |
| An eligible native field contains a colleague's name, a role or note wording, under a selected source variant and purpose | The listed field is sent with its original wording; nothing outside the closed fields joins it | §1, §5 |
| The same wording sits in an attached Note, personnel or attribution object, or an extra field | Never collected | §1 |
| Any rule, consumer or predecessor policy without the selected successor | The current strip and holds apply unchanged | §1, §7 |
| Rejected or accepted-with-edit native decision; a reason marked suggested | After is the chosen text, not Apply proof; the reason stays labeled suggested | §2 |
| Word sample imported as baseline or as suggestions; a manual edit later undone | Neither is endorsement, rejection or a vote; no proposal, decision or reason is invented | §2, §5 |
| Stale, excluded, oversized, corrupt, wrong-purpose, wrong-role, wrong-recipient or ungranted example | Corruption, or a stale source or binding at a recheck, refuses; exclusion, oversize, an unsupported source, a wrong purpose, role or recipient and a missing grant hold the whole bundle; no truncation, fallback or convenient subset | §3, §4, §5 |
| A source is withdrawn after the physical send | True sent outcome, cost and history stay; the pre-publication recheck stops new proposals, findings or suggestions; no resend | §5 |
| Restart or a merged Book import | Old outcomes are not enriched and no House authority is imported | §3, §5 |
| General typos or format review | Gains no Main Role from this proposal | §3 |
| Book dialogue selected words, question, other fields or development dialogue | Keep the strip | §4 |
| Conditional ADR 0099 Note wording beside a native reason | No Note object, picker or copying; only the typed reason qualifies | §6 rows 8–11 |
| Raw-bearing context or fragment where search, tools or subagents are possible without proven isolation | Raw use held; plain or line-only behavior continues; search is not disabled to claim completion | §4 |
| Provider-free fixture for a later consumer | Exact emitted bytes over admitted sources, with no seed, overlay, fallback or live grant | §5, §7 |

Documentation checks cover links, selectors, status and directive consistency, these walkthroughs and `git diff --check`. They supply no provider, fixture, guest, Electron, build, hosted Gate or editorial-quality evidence.
