# First Tracer Slice and Exit Gate

Status: **accepted in Question 35 with owner revisions**

## What a tracer slice is

From the tracer-bullet idea: rather than building layer by layer — all the storage, then all the domain, then the surface — build one thin, complete path through every layer, end to end. Like a tracer round, it shows whether the aim is right before the rest is committed.

Three properties separate it from a prototype: it is **vertical rather than horizontal**, touching every layer thinly; it is **real rather than throwaway**, and the code grows into the product; and it **proves the seams connect**.

That last property is why it matters here. This design room produced twenty-five architectural decisions before a line of code existed, and every one is a hypothesis. Does a pinned Harness subset compose? Does the Task Ledger bind to the Session Ledger without copying transcripts? Do capability guards hold at both enforcement points? Does the service run headlessly inside ten minutes? The tracer is the first real test of any of it.

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

### Manuscripts mutate, and that is the new problem

Source Versions are immutable. Manuscripts are the thing being edited. A retrieval index over changing text will feed the model superseded content unless it is revision-aware — and it will do so **silently**, because a stale hit looks exactly like a fresh one.

**Block-level incremental re-indexing.** Manuscript Blocks carry stable identities under ADR 0006, so a changed block is re-indexed alone. Every index entry is stamped with the revision it was built from, making a stale hit **detectable rather than invisible**, and Exact Fetch against the current pin resolves it.

The block model is now the right unit for three separate jobs: editor windowing, lexical indexing, and retrieval invalidation.

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

9. The whole slice runs **headlessly against replay inside the `pr` gate, under ten minutes**, proving the service is drivable without Electron.
10. The citation resolves to an **exact Manuscript Block range and highlights in the editor**.
11. The **Agent Data Root is created inside the AI7 folder** on first run, holds no credential material, and sync-root detection fires when the folder sits beneath a sync path.
12. The **request-fingerprint guard fails closed** when prompt, tools, or policy snapshot change.
13. **Portable proof**: extract, run, remove, leaving no residue outside the folder.

Criteria 9 through 13 make the tracer a test of the accepted decisions rather than only of code.

## Explicitly out of scope

Manuscript mutation of any kind — proposals, Effects, receipts — which is Phase 3. Learning, Quality Signals, and metrics, which need mutation first. Multiple Books, Series, and Cross-project scope. Workflow Instances and gates. Export. Parallel Runs: Question 31 makes concurrency required *behavior*, but one Run is correct for a first trace, and the concurrency and budget governor arrives later.

## Question 35 decision

Accepted with owner revisions:

- a throwaway, time-boxed store-and-index spike runs first, targeting the paging store and its indexes rather than the editor;
- the tracer is read-only and ends at a citation resolving to an exact highlighted block range in the real windowed editor;
- retrieval over manuscripts is a required capability that returns candidates and never truth, with block-level revision-aware invalidation so stale hits are detectable;
- retrieval strategy — lexical, vector, or hybrid — is deferred to the spike;
- the thirteen-point exit gate governs completion; and
- mutation, learning, workflow, concurrency, and export are explicitly out.

See [ADR 0026](../docs/adr/0026-manuscript-retrieval-returns-candidates.md).
