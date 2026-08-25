# Source–Generation–Grounding Boundary

> **Extended at Question 35.** The Search → Exact Fetch → Synthesis pipeline described here now covers retrieval over **manuscripts**, not only imported sources. Retrieval returns candidates and never truth, and because manuscripts mutate while Source Versions do not, manuscript retrieval invalidates per Manuscript Block with revision stamps so a stale hit is detectable. See [ADR 0026](../docs/adr/0026-manuscript-retrieval-returns-candidates.md).

Status: **accepted**

## Why this needs a new boundary name

Original AI7 used “dual kernel path” and older “generative/retrieval pipeline” language. The durable idea is valuable, but those names hide a longer chain and carry obsolete Python/FastAPI/RAG implementation assumptions. **Source–Generation–Grounding Boundary** is the proposed architecture name for keeping candidate discovery, authoritative text retrieval, model synthesis, and evidence verification distinct.

## Accepted clarification: textual authority is not truth authority

An exact manuscript or source revision is the **Textual Source of Record**: it is authoritative for which words appear, in which order, and at which location. It is not a truth oracle. A **Manuscript Assertion** expressed by that text may be factually wrong, logically inconsistent, semantically broken, or inconsistent with the Book/Series canon.

AI7 therefore has two different obligations:

1. Preserve textual fidelity when quoting, locating, comparing, or proposing an edit.
2. Challenge the content through Factual Verification and Semantic Review, producing evidence-linked Editorial Error Findings and exact-revision Correction Proposals.

## Pinned original-AI7 evidence

Audit pin: `ai7-reborn-ai@3e6e9ac772b7f07832154fa39d7de8a4deca51b1`.

| Area | Current evidence | Finding |
| --- | --- | --- |
| Textual authority | `AGENTS.md:95-100`; `CONTEXT.md:689-695`; `docs/adr/0021-source-truth-text-boundary.md` | Imported manuscript/source records and revision-bound index chunks own exact wording. This does not validate the factual truth of their assertions. |
| Import/index | `runtime/source_index_operation.py:142-208,240-410,487-512,530-647,679-770` | Chunk publication is staged, digest-bound, verified, and atomic; identity binds project, version, source asset, ordinal, and exact text. |
| Search/fetch | `runtime/ai7_runtime.py:2731-2800` | Search is deterministic literal substring matching over ready chunks; exact fetch retrieves stored text by ID with lineage. Search currently returns full text too, so the operational seams are less separated than the contracts imply. |
| General execution | `runtime/ai7_runtime.py:6846-7044` | Candidate selection → exact fetch → generation → grounding is executed and source references/status are recorded. |
| Grounding strength | `runtime/ai7_runtime.py:5509-5520` | General grounding treats nonempty exact sources as grounded; it does not verify answer claims or quote spans. |
| Narrow Task Skill kernel | `runtime/task_skill_orchestrator.py:706-818`; `runtime/publication_lifecycle_skills.py:148-199` | It verifies that each reference exactly matches fetched project/chunk/version/asset/text. This is strong Reference Integrity, not proof that the generated claim is supported. |
| General review | `skills/builtin/review/manifest.json:5-24,42-80`; `runtime/ai7_runtime.py:4699-4747` | A finding has a category, severity, detail, and one valid manuscript evidence ordinal. It has no typed factual/logical claim, verification question, independent evidence, verdict, or evidence strength. The exact passage locates the finding but cannot verify itself. |
| Review contract test | `tests/backend-contract/review-workflow-contract.test.mjs:20-110` | The generated-provider fixture proves exact lineage and durable history for a mock clarity finding. It does not prove the finding is correct; without manuscript evidence, the workflow emits no finding. Preserve this test pattern but add truth-sensitive counterexamples. |
| Developmental review | `skills/builtin/developmental-review/manifest.json:5-16,51-195`; `runtime/publication_lifecycle_skills.py:221-272` | The provider-free structural handler proposes editor prompts, revision letters, and author queries. It correctly warns that structural coverage is not an editorial conclusion and requires human review. |
| Correction proposals | `skills/builtin/annotation/manifest.json:5-18,55-92`; `tests/backend-contract/annotation-proposal-contract.test.mjs:45-119`; `runtime/manuscript_proposal.py:25-38` | Exact-source-linked suggestions remain isolated, unapplied proposals until an editor chooses an explicit action. Preserve this mutation boundary for factual and semantic fixes. |
| Formal review and proof state | `runtime/publication_lifecycle_commands.py:327-434,822-950,1507-1661,1921-2043` | Review decisions, proof-correction statuses, source ownership, revision, digest, and drift are durable. An approved record mutation is not approval of every factual assertion, and current proof status is not backed by independent fact evidence. |
| External evidence | `docs/prd/ai7-workflow-publication-lifecycle.md:86,120`; `runtime/publication_lifecycle_commands.py:256-305`; `tests/backend-contract/ai7-workflow-contract.test.mjs:150-203` | Curated or manually authored editorial artifacts exist, but current schemas lack source authority, publisher/author, URL/local identity, retrieval/publication time, quoted passage, freshness, corroboration, and an Approved Fact ledger. |
| Durable Q&A | `runtime/project_qa_operation.py:570-677,2796-2957,3104-3255,3500-3522`; ADR 0078 | Each turn is locally durable and pinned to revisions, scope, provider plan, citations, Run, and Operation. Citations are whole-answer source bundles rather than claim/span links. |
| Tests | `tests/backend-contract/source-grounded-qa-contract.test.mjs:21-86`; `tests/backend-contract/project-qa-continuation-contract.test.mjs:151-198,300-384` | They prove exact stored text, no ambient cross-project fallback, unsupported-without-evidence behavior, and immutable lineage, but not claim-level correctness. |

The citation-integrity plan under `docs/reference/current-ai7/plans/04-citation-integrity.md` is explicitly reference-only. Its useful semantics are not present in the current runtime: a displayed quotation should normalized-exact-match the source; the authoritative source slice replaces the model's reproduction; near matches or invented IDs remain unverified; fuzzy matching can find candidates but never certify evidence.

## Proposed capability chain

```text
Authorized source scope
  → Source Search (candidate IDs and selection hints)
  → Exact Fetch (authoritative revision-bound text)
  → Synthesis (model-generated analysis or draft)
  → Reference Integrity (does the cited source identity/text match?)
  → Assertion Classification (quotation, fact, canon, judgment, synthesis)
  → Factual Verification / Semantic Review / Quotation Verification
  → Editorial Error Finding and Correction Proposal
  → Editorial Deliverable plus typed Evidence Links and verification status
```

Rules:

1. Imported Source Revisions remain the immutable Textual Source of Record. Generated outputs can become later editorial material only through an explicit accepted transition; they never silently become textual authority.
2. Source Search discovers candidates. Ranking may use literal, lexical, vector, or hybrid strategies later, but its result is not authoritative text. Return stable IDs, revision/digests, and clearly non-authoritative selection hints; Exact Fetch owns displayable source text.
3. Exact Fetch resolves an authorized stable reference against one exact source revision and returns authoritative text plus identity, offsets when available, and digest.
4. Synthesis is provider-neutral. RAG, long context, model family, and prompt strategy are interchangeable implementations rather than top-level domain architecture.
5. Reference Integrity checks identity, revision, asset, digest, offsets, and text. It must not be reported as semantic Claim Grounding.
6. A link back to the manuscript proves what the manuscript says, not that the assertion is true. Factual Verification must use separately classified factual authority; Semantic Review may use the wider passage, whole-work context, Series Knowledge, professional knowledge, and other accepted evidence.
7. Quotation Verification requires normalized exact match and displays the authoritative source slice. Allowed normalization handles presentation-only differences such as whitespace and Chinese full-/half-width forms; changed characters are not an exact quote.
8. Fuzzy/vector similarity may select a candidate but cannot certify, rewrite, or substitute a quotation.
9. A factual or semantic concern becomes an Editorial Error Finding with the exact target revision/span, assertion, issue type, evidence for and against, reasoning, confidence, and status. It is not a model verdict.
10. A proposed fix becomes a Correction Proposal bound to the exact target revision. Applying it remains a separate reviewed mutation; uncertainty may produce an editor/author query instead of a rewrite.
11. Every completed task snapshots the exact source scope, source revisions, fetched evidence digests, Evidence Links, verification statuses, model/provider binding, and capability/Policy Document versions used.

## Revised two-axis evidence model

Not every sentence in literary-publishing work should pretend to be an externally verifiable fact. Classification and verification are separate axes.

| Content class | What the text can establish | Required treatment |
| --- | --- | --- |
| Exact Quotation | The Textual Source of Record establishes its exact wording. | Exact Fetch plus Quotation Verification; display authoritative source text or mark unverified. |
| Report about the manuscript | The source establishes that the manuscript says or depicts something. | Evidence Link to the exact passage; do not turn the reported Manuscript Assertion into a verified real-world fact. |
| Real-world Factual Assertion | The manuscript only supplies the assertion under review. | Compare against separately authorized factual evidence; record supported, contradicted, conflicting, or unresolved. |
| Fictional/canonical Assertion | Relevant Book/Series sources and accepted Series Knowledge establish internal canon, possibly with conflicts. | Check continuity and expose conflicts; do not apply real-world fact rules to intentional fiction. |
| Editorial Interpretation or Judgment | Evidence can show the passages considered, not objectively prove the judgment. | Mark as analysis/judgment with rationale and relevant passages; preserve reasonable disagreement. |
| Creative or Promotional Synthesis | It is proposed generated editorial text. | Ground its quoted, factual, and canonical subclaims according to their own classes. |

The second axis records whether the item is textually verified, factually supported, factually contradicted, internally inconsistent, conflicting, unresolved/not checked, or not applicable. One generic `grounded` badge is insufficient.

An **Evidence Link** is a typed relationship from a claim, quotation, finding, or proposed correction to exact evidence identity/revision/digest/offsets, evidence role, and verification status. A manuscript link may have the role `textual-record` or `assertion-under-review`; it is not automatically `factual-authority`. The visible citation style is a later UX decision; the durable relationship is not.

The three checks must remain independently reportable:

1. **Reference Integrity** — is this the authentic text/record at the stated identity, revision, span, and digest?
2. **Claim Support** — does that evidence actually support the finding or generated claim for the role assigned to it?
3. **Factual Verification** — does sufficiently independent and appropriate evidence support, contradict, or leave unresolved the real-world Manuscript Assertion?

Passing an earlier check never implies that a later check passed.

## Accepted factual-evidence authority policy

Factual authority is governed by a versioned **Factual Verification Policy Document**, not a universal hard-coded list. It defines admissible source kinds, domain-specific precedence, required corroboration, freshness, and conflict behavior. A task snapshots the exact policy version and evidence records used.

The accepted default evidence preference, subject to that explicit policy, is:

1. User/editor-designated authoritative references for the task, with their intended scope stated. A designated source may define an edition, terminology, or project convention without becoming universal real-world truth.
2. Appropriate primary or official records for the claim domain—for example an authoritative edition for textual scholarship, an official record for an official fact, or primary research/data for a scientific claim—captured as timestamped, digest-bound evidence.
3. Accepted Book or Series canon for fictional and internal-continuity assertions only. It does not verify unrelated real-world claims, and competing canon passages remain visible as conflicts.
4. Approved house/reference corpus and professionally curated editorial material with authorship, provenance, and review status.
5. Authorized secondary or live external research, retained as immutable snapshots with publisher/author, URL or local identity, publication/retrieval time, exact supporting passage, digest, access provenance, and source-quality assessment.
6. Foundation Model knowledge may raise a suspicion, form a verification question, or suggest a search. It is not factual evidence by itself and cannot close a finding.

No source kind is infallible. When admissible evidence conflicts or is insufficient, AI7 preserves the evidence and reports `conflicting` or `unresolved`; it proposes an editor/author query or a qualified correction rather than silently choosing a convenient answer. A Correction Proposal records the target revision/span, assertion, issue type, evidence for and against, rationale, evidence strength, relevant uncertainties, proposed wording or query, and eventual human disposition.

For staged delivery, the current recommendation is that local manuscript/Series consistency checks and manually attached or curated reference artifacts support the first proof slice. Live web or external research would enter through a later accepted boundary covering provider permission, public egress, snapshot provenance, source-quality rules, and deterministic provider-free tests. This sequencing recommendation remains subject to the later tracer-slice decision and must not be represented as a claim that the first slice can comprehensively fact-check a manuscript.

## Keep / modify / drop recommendation

| Legacy concept | Recommendation | Reason |
| --- | --- | --- |
| Textual source-of-record boundary | Keep and rename | Protects exact wording without implying that manuscript claims are true. |
| Read-only imported sources and revision-bound Source Index Chunks | Keep | Durable exact text and provenance; chunks are retrieval units, not manuscript structural identity. |
| Explicit active-Book/Series/Cross-project source scope | Keep with already accepted scope decisions | Access authority precedes retrieval. |
| Separate exact retrieval, synthesis, and grounding | Keep and deepen | Add Search, Exact Fetch, Reference Integrity, Assertion Classification, Factual Verification, Semantic Review, and Quotation Verification. |
| Whole-answer source arrays called grounded citations | Modify | Preserve as a source bundle, but require Evidence Links for claim/quote grounding. |
| Normalized exact-quote verification from legacy reference | Reimplement, do not port | Valuable invariant; absent from current runtime and tied to missing old modules. |
| `Generative pipeline`, `Retrieval pipeline`, `Generation pipeline`, `StreamPlan`, `stream_task`, `Finalizer` | Drop/archive | Obsolete paths and decomposition. |
| Mandatory SQLite/Qdrant/BM25/jieba/BGE/DeepSeek, RAG-versus-long-context split, FastAPI/SSE vocabulary | Drop as architecture | May reappear as replaceable implementation choices only after later decisions. |

## Decision resolution

Question 16 accepted the complete boundary: textual authority is not truth authority; factual and semantic errors must be sought; fixes remain Correction Proposals or editor/author queries; factual authority follows the configurable Policy Document and default evidence preference above; Foundation Model knowledge is not evidence; and insufficient or conflicting evidence stays visible. The decision is recorded in [ADR 0005](../docs/adr/0005-separate-textual-and-factual-authority.md).
