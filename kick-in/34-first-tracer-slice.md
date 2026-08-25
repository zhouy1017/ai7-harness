# First Tracer Slice and Exit Gate

Status: **accepted tracer direction; the multi-point exit/verification gate is superseded by ADR 0027**

## What a tracer slice is

From the tracer-bullet idea: rather than building layer by layer — all the storage, then all the domain, then the surface — build one thin, complete path through every layer, end to end. Like a tracer round, it shows whether the aim is right before the rest is committed.

Three properties separate it from a prototype: it is **vertical rather than horizontal**, touching every layer thinly; it is **real rather than throwaway**, and the code grows into the product; and it **proves the seams connect**.

That last property is why it matters here. This design room now contains twenty-seven ADRs before a line of code exists, and their implementation assumptions still need proof. Does a pinned Harness subset compose? Does the Task Ledger bind to the Session Ledger without copying transcripts? Do capability guards hold at both enforcement points? Does the service run headlessly inside the accepted concise budget? The tracer is the first real test of any of it.

## Two steps, in order

The scale question and the integration question are different kinds of risk, and merging them would force either the scale work to be production-quality before its approach is validated, or the tracer to be disposable.

| | Step 0 — spike | Step 1 — tracer |
| --- | --- | --- |
| Risk addressed | Technical feasibility: can this work at all? | Architectural integration: do the decisions compose? |
| Answer shape | A measurement | A working path |
| Code lifespan | Throwaway | Permanent |

### Step 0 — Store and index spike

**Throwaway, time-boxed, before any tracer work.** Its target is the paging store and its indexes, not the editor: because the editor only ever holds a bounded window, the store carries the risk.

Generate Chinese corpora at 500K, 1M, and 10M characters. Build a paging block store with the three indexes, then measure:

- cold Book open and time to first editable view;
- find first match, and find all matches;
- jump to outline node, to character offset, and to match;
- replace across the whole manuscript, including atomicity and recovery;
- keystroke-to-paint latency inside a loaded window, confirming independence from manuscript size;
- **retrieval index build time and per-block re-index cost**; and
- peak memory at the 10M tier.

**Outcome:** either the store design and the retrieval strategy are confirmed, or they change before the architecture is committed. Then discard the code.

Corpora must be **generated**, never real sample Books. A real manuscript in a test fixture would violate ADR 0016.

### Step 1 — The read-only tracer

> Open one Book → import one DOCX → **view it in the real windowed editor** → ask one source-grounded question → receive an answer whose citation **resolves to an exact highlighted Manuscript Block range** in that editor.

Read-only throughout. The editor surface earns its place for two reasons: it proves the editor-to-service seam and exact block-range anchoring, and it makes provenance **visible** rather than merely recorded — a citation the editor can click through to in the actual document, which is the point of the whole grounding architecture.

## Manuscript retrieval is a required capability

Long manuscripts exceed any model context window, so AI7 must retrieve over the manuscript itself to preserve detail. This extends the accepted Source Search → Exact Fetch → Synthesis pipeline from imported sources to manuscripts.

Two indexes sit over the same block store, doing different jobs:

| Index | Job | Nature |
| --- | --- | --- |
| **Lexical** | find, replace, jump | Exact, deterministic, complete |
| **Retrieval** | assemble model context beyond the window | Ranked, approximate, partial |

### Retrieval returns candidates, never truth

The rule accepted at Question 16 carries over unchanged: **search discovers candidates; only Exact Fetch against the pinned Manuscript Revision returns authoritative text.** A retrieved chunk is a pointer, never a quotation source, and fuzzy or vector matching can never certify a quotation.

This matters more for manuscripts than for sources, because the model is being asked about text the editor is actively changing.

### One authority, many projections

**Corrected at Question 26.** An earlier version of this design unified the editor window, the lexical index, and the retrieval chunk onto the Manuscript Block and treated that as evidence the block was the right primitive. That over-unified three things with different consumers.

Chunks, rankings, and embeddings exist **for models and agents**. The editor reads **ordinary text**. The Manuscript Revision is the sole authority; everything else is a derived projection — the display window, the lexical find index, the outline, retrieval chunks and their embeddings — each disposable and rebuildable from the authority alone.

Projections may choose boundaries suited to their consumer. A retrieval chunk may span or subdivide what the editor renders, sized for a model's context rather than a reader's eye. If a shared block boundary happens to help windowed display, that is a convenience to exploit rather than a constraint to design toward.

**The requirement is consistency across forms, not unification.** Four obligations:

1. Every projection records the Manuscript Revision it was derived from.
2. Every projection is reconstructable from the authority alone, without reference to any other projection.
3. A change marks overlapping projection entries dirty **by text-range overlap rather than structural identity**, so projections with unrelated boundaries still invalidate correctly.
4. A stale entry is always detectable, never silently served as current. Deletions are tombstoned, so absence fails differently from staleness.

Re-derivation is cadenced at **Manuscript Checkpoints** rather than per keystroke, reusing the journal-versus-checkpoint separation already accepted at ADR 0006. That gives staleness a bounded window an editor can understand: the projections reflect the last checkpoint.

### Two consequences worth stating outright

**A stale projection produces a stale ranking, not merely stale text.** Retrieval ranks on projected content, so a chunk may be selected on superseded text while the now-relevant passage never surfaces. Fetching fresh text for a stale ranking would look well-formed while being wrong. The remedy is re-derivation of the affected range and re-ranking — not text substitution.

**Candidates and truth may come from different moments.** A Run pins a revision while the editor keeps working, so candidates may be drawn from a newer projection than the pin the answer is bound to. This is acceptable precisely because retrieval yields candidates rather than truth, but it is recorded rather than left as an accident.

### Manuscripts mutate, and that is the new problem

Source Versions are immutable. Manuscripts are the thing being edited. A retrieval index over changing text will feed the model superseded content unless it is revision-aware — and it will do so **silently**, because a stale hit looks exactly like a fresh one.

Incremental re-derivation by affected range, with every entry stamped with the revision it was built from, makes a stale hit **detectable rather than invisible**.

### Strategy is deferred to the spike

Lexical, vector, or hybrid remains open, for two reasons worth stating plainly:

- For Chinese, a well-built lexical index performs better than commonly assumed, and costs no model call at all.
- Vector retrieval at the 10M tier means embedding fifty to a hundred thousand blocks — real build time, and if the embedding model is remote, real cost and a per-block outbound call. A local embedding runtime is viable in Node through ONNX or transformers.js, but it is a dependency decision rather than a free choice.

Embeddings and retrieval indexes derived from manuscript text are manuscript derivatives, so ADR 0016 governs them: never in a repository, never in hosted CI, never in a distributable artifact.

## Exit gate

The slice is complete when all thirteen hold.

From the original migration workflow:

1. Book identity is not inferred from the working directory.
2. Source revision and scope are exact and durable.
3. Retrieval, Exact Fetch, Synthesis, and grounding remain separate.
4. The model sees only logged, reconstructable input.
5. The Run Record carries exact Execution Bindings to Harness Session spans, with no copied transcripts.
6. The Editorial Capability Profile cannot reach undeclared shell, filesystem, or network paths.
7. The replay fixture and a real-provider rehearsal share the same contracts.
8. Restart and reopen reconstruct the user-visible result without hidden provider state.

Added by decisions taken since that document was written:

9. The whole slice runs **headlessly against replay inside the concise `pr` gate**, proving the service is drivable without Electron; the numeric budget and exact Windows/macOS job shape remain pending.
10. The citation resolves to an **exact Manuscript Block range and highlights in the editor**.
11. The **Agent Data Root resolves to the accepted governed location for the native package under test**, holds no credential material, and platform-specific unsafe-placement detection fires. The Windows portable-folder rule remains accepted; the macOS location and enforcement mechanism remain pending.
12. The **request-fingerprint guard fails closed** when prompt, tools, or policy snapshot change.
13. **Native package proof**: every accepted release channel launches the same tracer artifact and preserves/removes owned data according to its platform contract. Windows zip and NSIS are accepted; the macOS package proof remains pending.

Criteria 9 through 13 make the tracer a test of the accepted decisions rather than only of code. Phase 0 must settle their remaining platform parameters before implementation begins.

## Explicitly out of scope

Manuscript mutation of any kind — proposals, Effects, receipts — which is Phase 3. Learning, Quality Signals, and metrics, which need mutation first. Multiple Books, Series, and Cross-project scope. Workflow Instances and gates. Export. Parallel Runs: Question 31 makes concurrency required *behavior*, but one Run is correct for a first trace, and the concurrency and budget governor arrives later.

## Question 35 decision

Accepted with owner revisions:

- a throwaway, time-boxed store-and-index spike runs first, targeting the paging store and its indexes rather than the editor;
- the tracer is read-only and ends at a citation resolving to an exact highlighted block range in the real windowed editor;
- retrieval over manuscripts is a required capability that returns candidates and never truth;
- one authority and many projections: chunks and embeddings serve models while the editor reads ordinary text, projections may use boundaries suited to their consumer, and the requirement is consistency across forms rather than a shared unit;
- projections carry their derivation revision, rebuild from the authority alone, invalidate by range overlap, tombstone deletions, and re-derive at Manuscript Checkpoints;
- retrieval strategy — lexical, vector, or hybrid — is deferred to the spike;
- the thirteen-point exit gate governs completion; and
- mutation, learning, workflow, concurrency, and export are explicitly out.

See [ADR 0026](../docs/adr/0026-manuscript-retrieval-returns-candidates.md).
