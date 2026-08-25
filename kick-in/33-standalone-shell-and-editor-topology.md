# Standalone Shell and Editor Topology

Status: **accepted topology and scale targets; dedicated performance and editor-sufficiency gates are superseded by ADR 0027**

Scope: process topology and the editor's technical foundation. Interaction design, layout, visual language, and information architecture are owned by the accepted [V2 UI/UX baseline](../docs/ui-ux-v2/README.md).

## Manuscript scale is a required feature

Long Chinese manuscripts are not a stretch goal. The product must meet three tiers, **counted in Chinese characters**:

| Tier | Requirement | What it stresses |
| --- | --- | --- |
| **under 500K chars** | No sensible performance degradation. Editing feels the same as with a short document | Editor window, typing latency, navigation |
| **up to 1M chars** | No critical performance issue. Operations may be visibly slower, but nothing blocks work and long operations show progress | Store and index operations, whole-manuscript search, scroll to an arbitrary position |
| **up to 10M chars** | No crash and no unresponsiveness. The application opens, stays interactive, never hangs the UI thread, never exhausts memory, and never loses data. Degraded speed is acceptable; breaking is not | Store scale, memory ceiling, absence of unbounded in-memory structures |

For orientation: 10M Chinese characters is roughly 30 MB of UTF-8 text and, at typical Chinese prose paragraph lengths, somewhere between 50,000 and 100,000 Manuscript Blocks. Repository and hosted-CI evidence uses generated public-synthetic material only; no private or real manuscript is a fixture or calibration source.

### Windowed display is accepted; index time is the binding constraint

An editor reads only part of a manuscript at a time, so **rendering the whole manuscript at once is not a requirement**. Windowed display is the accepted design rather than a compromise forced by performance.

The performance requirement therefore sits on **whole-manuscript index operations** — find, replace, and jump must complete in reasonable time at every tier. This moves the principal risk from the renderer to the store and its indexes.

| Operation | Scales with | Requirement |
| --- | --- | --- |
| Typing and editing in a loaded window | Window size, never manuscript size | Immediate at every tier |
| Jump to an outline node, character offset, or match | Index lookup | Immediate at every tier |
| Find across the whole manuscript | Index | Reasonable at every tier, including 10M |
| Replace across the whole manuscript | Match count | Reasonable, atomic, and recoverable; progress shown when long |
| Cold Book open | Index load, not text load | Reasonable at every tier |

Three indexes, all disk-backed and incrementally maintained on edit:

1. **Block index** — identity, order, cumulative offsets, and length. Serves window loading and offset jumps by binary search rather than by scanning.
2. **Full-text index** over block content, **CJK-aware**. Chinese has no word boundaries, so a substring-capable index such as a trigram tokenizer is required; a word tokenizer designed for space-delimited languages will not serve.
3. **Outline index** — headings and sections for navigation.

Illustrative latency numbers from the design interview are not accepted budgets. Implementation may calibrate concrete targets from the complete supported journeys and production observations without creating a separate performance gate.

**Consequence for the editor choice.** Because the editor only ever holds a bounded window, the library matters considerably less than the store. ProseMirror's medium confidence is correspondingly less critical, while paging and indexing remain principal implementation risks. They do not require a prerequisite spike; a concrete blocker may trigger only a bounded non-gating diagnostic.

### What this forces

These are consequences of the tiers, not preferences:

1. **The renderer never holds the whole manuscript.** The editor always operates on a bounded window of Manuscript Blocks. This single decision is what makes the 10M tier reachable at all.
2. **The authoritative document model lives in the AI7 service process**, backed by a store that pages by block rather than by whole document. A local embedded database is the expected shape.
3. **Whole-manuscript operations run in the service**, streaming over blocks — search, replace, statistics, verification passes, export. They are cancellable, report progress, and never run on the UI thread.
4. **No unbounded in-memory structures anywhere.** Indexes are disk-backed or explicitly bounded, at every layer.
5. **Memory is explicitly bounded through the 10M tier**, with no unbounded in-memory representation at any layer.

Because the editor only ever holds a bounded window, the 10M tier is met by the store and the windowing rather than by the editor library. That makes the editor choice more robust, not less.

### Exercising the behavior

These tiers remain product behavior. Where a complete provider-free supported journey exercises cold Book open, first editable view, keystroke-to-paint latency, navigation, whole-manuscript search, save/checkpoint, or export, the behavior stays inside that same journey rather than creating a separate performance or editing-sufficiency gate.

Per-operation latency budgets are deliberately not set here. Any later calibration uses generated public-synthetic corpora and production observations; private or real manuscript material never enters repository or hosted-CI evidence.

## Shell: Electron

AI7 is TypeScript and Node, and Harness is Node, so a Node runtime ships regardless. Electron is the accepted shell. The implementation plan must select and pin the exact Electron version, its bundled Node version, the Supported Development Host matrix, and one package-manager version after checking the accepted Harness engine range and the public package metadata together.

Rejected alternatives: **Tauri** would add a Rust toolchain and still need a Node sidecar, since Harness cannot run in Rust — two runtimes to avoid one. **Direct WebView2 hosting** means writing native glue for a problem Electron already solves.

The predecessor used Electron 43 for this same application shape, and portable-folder packaging with Electron is well established. The cost is roughly 200 MB portable, affordable now that no Python interpreter ships.

### The ABI risk is smaller than recorded

The register carried "Electron/native dependencies conflict with Harness Node/package stack" as High. The exact-version plan must verify the chosen Electron-bundled Node against the accepted Harness engine range and the exact selected package subset. Excluding generic sandbox and shell packages removes much of the native surface, but the committed lockfile and selected dependency metadata—not this design document—determine the actual compatibility claim.

## Topology: three processes

| Process | Role |
| --- | --- |
| **Electron main** | Thin shell: window lifecycle, file pickers, single-instance lock, data-root resolution, sync-root detection warning |
| **Electron renderer** | AI7 UI and editor, with `contextIsolation` enabled and `nodeIntegration` disabled |
| **AI7 service** | Separate Node process hosting AI7 domain services and the composed Harness runtime. This is the one local AI7 authority |

The service is separate rather than living in Electron main for four reasons:

1. **UI responsiveness under parallel Runs.** Question 31 requires multiple concurrent Runs; a busy agent loop must never block paint.
2. **Crash isolation.** A provider or Harness failure must not take down an editor holding unsaved text, which serves Question 23's no-silent-loss obligation directly.
3. **Independent service control and diagnosis.** The same service is directly drivable for focused local diagnosis and process-control hooks. The product E2E journey and current tracer still launch and traverse the renderer, Electron main, service, composed Harness runtime, and domain boundary; service-only execution never substitutes for that path.
4. The Question 31 concurrency governor, usage observation, and optional explicit Run Budget Ceiling enforcement get a natural home; Issue #8 Batch 3 later fixed the default ceiling at `unset` and kept Provider Account Limits external.

**IPC uses stdio or a private platform-local adapter, such as a Windows named pipe when needed. No TCP listener.** The macOS carrier remains an adapter decision and creates no new authority or process. The register carries "Harness web server is exposed beyond loopback" as Critical; never opening a socket removes that structurally rather than configuring it away, following the same reasoning as Question 30's dependency-graph argument.

## Editor foundation: ProseMirror

| Accepted requirement | Why ProseMirror serves it |
| --- | --- |
| Stable, extensible structure | A schema-validated node tree maps onto Manuscript Blocks (ADR 0006) |
| Exact selection and range capture | Positions are first-class, so Task Intents, findings, quotations, proposals, and Effects anchor precisely |
| Chinese IME, punctuation, typography | Mature composition handling; this is where weaker editors fail |
| Annotations without corrupting text | Decorations overlay without mutating the document |
| Proposal Branch compare and apply | Steps and transforms map onto proposal diffs |
| Tables, notes, inline styles | Established implementations rather than invention |

Rejected: **Slate**, for known IME fragility that is disqualifying in Chinese-first work; **CodeMirror 6**, an excellent text engine built for code rather than structured documents; and a **custom editor**, which is what the predecessor's 26,484-line renderer was and what Question 23 explicitly rejected. **Lexical** is the credible alternative with strong IME handling, but a thinner ecosystem for tables and comment anchoring. TipTap remains available later as a layer above ProseMirror.

**Windowing is what makes this work at scale.** Each loaded window is its own ProseMirror document with its own coordinate space, mapped to global Manuscript Block identities. Whole-manuscript navigation uses a lightweight outline that never materializes text.

ProseMirror over bounded windows is accepted. Concrete schema, paging, and IME behavior is refined through the applicable complete vertical journey; a separate scale spike is not a prerequisite or gate.

## UI/UX owner

The accepted [V2 UI/UX baseline](../docs/ui-ux-v2/README.md) owns layout, visual design, interaction patterns, information architecture, proposal/comment presentation, and onboarding, subject to the accepted constraint that AI7 does not adopt the Harness web client. ProseMirror remains the renderer's editor foundation.

## Question 34 decision

Accepted with owner revisions:

- long Chinese manuscripts are a required feature with three binding scale tiers at 500K, 1M, and 10M Chinese characters;
- windowed display is accepted rather than merely tolerated, so the binding performance constraint is whole-manuscript index time for find, replace, and jump rather than render time;
- the renderer never holds a whole manuscript, the authoritative model lives in the service over a paging store, and whole-manuscript operations stream in the service;
- Electron is the shell; implementation planning pins its exact version, bundled Node compatibility, Supported Development Host matrix, and one package-manager version;
- three processes, with a separate AI7 service holding domain services and the Harness runtime;
- IPC over stdio or a named pipe, never a TCP listener;
- ProseMirror is the accepted editor foundation over bounded windows; and
- interaction design is owned by the accepted V2 UI/UX baseline.

See [ADR 0024](../docs/adr/0024-electron-shell-with-isolated-ai7-service.md) and [ADR 0025](../docs/adr/0025-windowed-editing-over-a-paging-manuscript-store.md).
