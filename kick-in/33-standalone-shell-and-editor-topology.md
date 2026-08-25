# Standalone Shell and Editor Topology

Status: **accepted topology and scale targets; dedicated performance and editor-sufficiency gates are superseded by ADR 0027**

Scope: process topology and the editor's technical foundation. Interaction design, layout, visual language, and information architecture remain with the owner's separate UI/UX session.

## Manuscript scale is a required feature

Long Chinese manuscripts are not a stretch goal. The product must meet three tiers, **counted in Chinese characters**:

| Tier | Requirement | What it stresses |
| --- | --- | --- |
| **under 500K chars** | No sensible performance degradation. Editing feels the same as with a short document | Editor window, typing latency, navigation |
| **up to 1M chars** | No critical performance issue. Operations may be visibly slower, but nothing blocks work and long operations show progress | Store and index operations, whole-manuscript search, scroll to an arbitrary position |
| **up to 10M chars** | No crash and no unresponsiveness. The application opens, stays interactive, never hangs the UI thread, never exhausts memory, and never loses data. Degraded speed is acceptable; breaking is not | Store scale, memory ceiling, absence of unbounded in-memory structures |

For orientation: 10M Chinese characters is roughly 30 MB of UTF-8 text and, at typical Chinese prose paragraph lengths, somewhere between 50,000 and 100,000 Manuscript Blocks. The existing sample Books run 290K to 396K characters, so real material sits inside the easiest tier and the upper tiers are robustness headroom.

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

Proposed operation budgets, offered as calibration to confirm against the spike rather than as accepted figures: first match under one second at the 10M tier; jump under 200 milliseconds at any tier; typing latency within one frame and independent of manuscript size; replace showing progress beyond roughly two seconds while remaining atomic.

**Consequence for the editor choice.** Because the editor only ever holds a bounded window, the library matters considerably less than the store. ProseMirror's medium confidence is correspondingly less critical, and the spike's primary target becomes the paging store and its indexes rather than the editor.

### What this forces

These are consequences of the tiers, not preferences:

1. **The renderer never holds the whole manuscript.** The editor always operates on a bounded window of Manuscript Blocks. This single decision is what makes the 10M tier reachable at all.
2. **The authoritative document model lives in the AI7 service process**, backed by a store that pages by block rather than by whole document. A local embedded database is the expected shape.
3. **Whole-manuscript operations run in the service**, streaming over blocks — search, replace, statistics, verification passes, export. They are cancellable, report progress, and never run on the UI thread.
4. **No unbounded in-memory structures anywhere.** Indexes are disk-backed or explicitly bounded, at every layer.
5. **The memory ceiling is explicit and tested at the 10M tier**, not assumed.

Because the editor only ever holds a bounded window, the 10M tier is met by the store and the windowing rather than by the editor library. That makes the editor choice more robust, not less.

### Proving it

These tiers become explicit criteria in the Standalone Editing Sufficiency Gate, and an **early performance gate** proves them before the editor is built out rather than at the end. The operations to measure are cold Book open, time to first editable view, keystroke-to-paint latency inside a loaded window, navigation to an arbitrary position, whole-manuscript search, save and checkpoint, and export.

Per-operation latency budgets are deliberately not set here. They should be fixed against measurements from generated corpora at each tier plus the real 396K-character sample Book, rather than guessed in advance.

## Shell: Electron

AI7 is TypeScript and Node, and Harness is Node, so a Node runtime ships regardless. **Electron 43.4.0 bundles Node 24.18.1**, which satisfies the Harness engine requirement of `^22.19.0 || >=24` directly.

Rejected alternatives: **Tauri** would add a Rust toolchain and still need a Node sidecar, since Harness cannot run in Rust — two runtimes to avoid one. **Direct WebView2 hosting** means writing native glue for a problem Electron already solves.

The predecessor used Electron 43 for this same application shape, and portable-folder packaging with Electron is well established. The cost is roughly 200 MB portable, affordable now that no Python interpreter ships.

### The ABI risk is smaller than recorded

The register carried "Electron/native dependencies conflict with Harness Node/package stack" as High. Two findings reduce it: Electron 43's bundled Node already satisfies the Harness engines constraint, and the core packages AI7 selects are pure JavaScript — `dsh-agent-loop` depends only on `schemastery`. The native modules live in the sandbox and shell packages that Question 30 already excludes. The package-subset decision defused most of this risk as a side effect.

## Topology: three processes

| Process | Role |
| --- | --- |
| **Electron main** | Thin shell: window lifecycle, file pickers, single-instance lock, data-root resolution, sync-root detection warning |
| **Electron renderer** | AI7 UI and editor, with `contextIsolation` enabled and `nodeIntegration` disabled |
| **AI7 service** | Separate Node process hosting AI7 domain services and the composed Harness runtime. This is the one local AI7 authority |

The service is separate rather than living in Electron main for four reasons:

1. **UI responsiveness under parallel Runs.** Question 31 requires multiple concurrent Runs; a busy agent loop must never block paint.
2. **Crash isolation.** A provider or Harness failure must not take down an editor holding unsaved text, which serves Question 23's no-silent-loss obligation directly.
3. **Headless testability.** The same service is drivable without a GUI, which is exactly what Question 24's ten-minute `pr` gate and Question 35's tracer slice need. A service inside Electron main would force every test through an Electron harness.
4. The Question 31 concurrency and budget governor gets a natural home.

**IPC uses stdio or a Windows named pipe. No TCP listener.** The register carries "Harness web server is exposed beyond loopback" as Critical; never opening a socket removes that structurally rather than configuring it away, following the same reasoning as Question 30's dependency-graph argument.

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

Confidence here is **medium rather than high**. This is the one Question 34 choice that warrants a spike against the scale tiers before it is treated as settled.

## What remains with the UI/UX session

Layout, visual design, interaction patterns, information architecture, how proposals and comments surface, onboarding, and the renderer framework — subject to the already-accepted constraint that AI7 does not adopt the Harness web client.

## Question 34 decision

Accepted with owner revisions:

- long Chinese manuscripts are a required feature with three binding scale tiers at 500K, 1M, and 10M Chinese characters;
- windowed display is accepted rather than merely tolerated, so the binding performance constraint is whole-manuscript index time for find, replace, and jump rather than render time;
- the renderer never holds a whole manuscript, the authoritative model lives in the service over a paging store, and whole-manuscript operations stream in the service;
- Electron is the shell, with Electron 43's bundled Node satisfying the Harness engine requirement;
- three processes, with a separate AI7 service holding domain services and the Harness runtime;
- IPC over stdio or a named pipe, never a TCP listener;
- ProseMirror is the editor foundation, used over bounded windows, at medium confidence pending a scale spike; and
- interaction design remains with the separate UI/UX session.

See [ADR 0024](../docs/adr/0024-electron-shell-with-isolated-ai7-service.md) and [ADR 0025](../docs/adr/0025-windowed-editing-over-a-paging-manuscript-store.md).
