# AI7 — Project Overview

A synthesis of everything the design interview accepted, written to be checked against expectation rather than to record decisions. The authoritative records are `AGENTS.md`, `docs/adr/`, the context files, and `kick-in/`.

Design interview: **36 questions, all resolved or explicitly deferred. 26 ADRs.**

---

## 1. What AI7 is

**AI7 is a Chinese-first, Windows-only desktop editorial workbench for professionals in leading literary publishing houses in mainland China.**

It wraps agentic work into an editor's text-editing workflow. The intended user is a literature professional, not a computer expert — so the product never asks them to authorize something they have no basis to judge, and never requires filesystem literacy to reach their own work.

The product display name is exactly **AI7**. Harness is the execution foundation and never appears as branding.

### The primary story

> As an editorial professional in a leading Chinese literary publishing house, I use one Windows desktop workspace to do multi-aspect work across a Book, its sources, and its deliverables. I can inspect evidence, reasoning, plans, and proposed changes; I keep publication authority and recovery history; and unpublished material never reaches a public channel without my permission.

### What it produces

A Book produces a **family of texts**, not just an edited manuscript: manuscripts, promotion articles, news reports, and review articles. Each carries its own workflow, because a manuscript can be in proof correction while its promotion article is still drafting.

---

## 2. The product thesis

**AI7 does not train a model.** It uses replaceable Foundation Models behind an AI7-owned Editorial Intelligence Layer built from professionally supervised knowledge. The durable advantage lives outside model weights — in governed sources, memory, policies, provenance, and evaluation — so it survives changing providers.

Three layers, and none substitutes for another:

| Layer | Supplies |
| --- | --- |
| **Foundation Model** | General capability. Replaceable. No weights owned |
| **Harness Agent Behavior** | How an agent assembles context, plans, selects tools, coordinates subagents, records sessions |
| **AI7 Editorial Intelligence** | Professional knowledge, exact sources, rubrics, memory, authority, quality standards |

Success is **Editor-comparable Delivery Quality plus measurable workload reduction** — two numbers, never one.

---

## 3. What is deliberately excluded

| Excluded | Why |
| --- | --- |
| **Microsoft Word integration** | Standalone-only V1. Word returns only if the editing gate fails *and* a separate ADR shows live integration is the proportionate remedy |
| **LLM training or fine-tuning** | The thesis is governed knowledge, not weights |
| **The legacy UI and editor** | The predecessor's 26,484-line renderer was rejected as "nearly unusable"; it is negative evidence, not a baseline |
| **Python** | The legacy Python had zero third-party dependencies and handled DOCX with stdlib zip and XML. Nothing required it |
| **Generic agent tools in editorial work** | No shell, roaming filesystem, or arbitrary network reaches an editorial Run |
| **Legacy production data** | Nothing migrates except API credentials, reviewed mock-provider evidence, and selected test sample Books |
| **Ubuntu as a target** | Windows only. Ubuntu may appear as a CI runner if separately justified |

---

## 4. The domain model

### Book is the authority; deliverables own their workflow

A **Book** is the source, privacy, and mutation authority. Each **Editorial Deliverable** runs its own Workflow Instance against a versioned Workflow Profile, composing seven phases that may overlap, reopen, or be skipped with a recorded reason.

Four scopes, deliberately distinct:

1. **Book** — normal authority for sources and mutation
2. **Series** — an explicit richer-sharing exception; members share governed Series Knowledge and a read scope, but every mutation stays targeted to one Book and revision
3. **Cross-project** — explicitly selected Books, read-only by default
4. **House Editorial Memory** — derived corpus-wide patterns, never raw cross-Book text

The rule that holds it together: **task source scope and learning scope are separate things.** Corpus-wide adaptation flows through governed memory and never silently exposes another Book's raw text.

### Text is authoritative for what it says, not for whether it is true

An imported manuscript revision is the **Textual Source of Record** — authoritative for the exact words present, never a truth oracle for its assertions. AI7 identifies factual and semantic errors through evidence-bearing review and expresses fixes as exact-revision **Correction Proposals** rather than silently rewriting.

Three statuses are recorded independently: **Reference Integrity**, **Claim Support**, and **Factual Verification**. Unresolved and conflicting evidence is preserved rather than collapsed. Foundation Model knowledge may raise questions or guide research but never counts as evidence by itself.

### Manuscript history

Stable **Manuscript Blocks**, immutable reconstructable **Revisions**, text-only **Branches**, per-branch durable **Edit Journals**, meaningful **Checkpoints**, and independently verified **Recovery Snapshots**.

All model-generated changes begin on **Proposal Branches**. Apply is atomic and exact-pin-bound: identical or non-interacting changes may merge automatically, while same-block conflicts require explicit editor resolution. A model-composed resolution remains a proposal.

### Authority is never a single word

"Approval" was split into six records plus proof, because one word cannot safely mean all of them:

**Run Authorization** · **Execution Grant** · **Proposal Decision** · **Review Decision** · **Effect Approval** · **Public Release Permission** — and separately, **Effect Receipt**, which is the only thing that proves something actually happened.

One interaction may create more than one record. No decision or grant is evidence that an Effect committed.

---

## 5. How the system is built

### Composition

AI7 composes the **full Harness engine** — planning, context assembly, tool pipeline, subagents, sessions, replay — behind a **narrow tool surface**. Those are separable, which is how "full capability" and least privilege coexist.

An editorial Run receives domain-shaped capabilities only: read a source revision, retrieve passages, propose a change, gather evidence, draft a deliverable. Never processes, paths, or endpoints.

**Learn the framework; do not clone the product.** Harness is built for agentic coding; AI7 serves literary publishing. Adopt the composition machinery, reject the coding-agent purpose, default presets, default tool set, and web surface. *Adopting a framework is not adopting its defaults.*

### Execution authority

**AI7 schedules; Harness converses.** Harness owns the single agent-loop implementation — turn structure, tool dispatch, in-turn retry, subagents, Session events. AI7 owns which Runs exist, workflow state, continuation, concurrency, budget, Effects, and model-free background work.

Parallel Runs across multiple Books, plus background analysis and learning, are **required behavior**. Many instances of one loop are not a second loop.

Two ledgers, one causal graph: the **AI7 Task Ledger** holds business truth; the **Harness Session Ledger** alone holds model messages, turns, tool calls, and technical events. They join through Execution Bindings without copying transcripts.

### Runtime and shape

TypeScript and Node throughout. Harness consumed as **exactly pinned npm packages** — only the subset AI7 needs, never the `@deepseek-ai/dsh` CLI aggregate, because *not depending on a package is a stronger guarantee than not wiring it*.

Three processes: a thin **Electron main**, a **renderer** holding UI and editor, and a separate **Node service** holding domain services and the Harness runtime. IPC over stdio or a named pipe, never a TCP listener.

Ships as a **zip portable folder and an NSIS installer**. In the portable channel the Agent Data Root lives inside the AI7 folder, so an installation is self-contained; the Protected Secret Store always stays outside, because a portable folder is designed to be copied.

### Scale

Long Chinese manuscripts are a **required feature**, in Chinese characters:

| Tier | Requirement |
| --- | --- |
| under 500K | No sensible performance degradation |
| to 1M | No critical performance issue; progress shown on long operations |
| to 10M | No crash, no unresponsiveness, no data loss |

Windowed display is accepted, so the binding constraint is **index time** — find, replace, and jump — not render time. Typing latency depends on window size and never on manuscript size.

### One authority, many projections

The **Manuscript Revision** is the sole authority. The display window, lexical index, outline, and retrieval chunks with embeddings are **disposable projections**, each free to choose boundaries suited to its consumer — chunks serve models, the editor reads ordinary text.

The requirement is consistency across forms, not a shared primitive: every projection records its derivation revision, rebuilds from the authority alone, invalidates by text-range overlap, tombstones deletions, and is never served stale as current. Re-derivation cadences at Manuscript Checkpoints.

Retrieval returns **candidates, never truth**. Only Exact Fetch against the pinned revision yields authoritative text.

---

## 6. How AI7 improves itself

**Editor decisions are the oracle** for taste, style, and editorial judgment — and never for factual correctness.

Three signal families: explicit feedback, editor-authored content as a style reference, and decision/version differences. Five metrics: verbatim acceptance, revision distance, survival to delivery, dissatisfaction by dimension, and workload displacement measured as phase-weighted edit volume. Per-task time tracking is rejected.

**AI7 must operate at zero data.** No sample threshold blocks operation or proposal; sample size gates auto-activation alone.

An agent may propose a revision to **anything** — prompts, Policy Documents, even composition. Activation is tiered, and **capability expansion never self-activates**:

| Layer | Activation |
| --- | --- |
| Agent Behavior Assets | Auto only for non-expansive calibration inside an approved envelope |
| Policy Documents | Developer review, always |
| Composition | Developer review, ships in a release |

The line: **a prompt may shape quality but may never grant authority.** Editorial users never see these assets — *hidden is permitted, silent is not.*

Improvement claims need the two-sided gate: fixed-corpus replay for regression, production metrics for real gain.

---

## 7. Privacy

**Privacy is an egress boundary, not an identity boundary.**

Any authorized person may read a manuscript locally, and Quality Signals may retain manuscript excerpts locally. What is controlled is every automated path off the machine.

- **Sending manuscripts to a configured model provider is permitted** — it is the basic feature of AI7, controlled processing, never public release.
- **Manuscripts never enter any repository**, public or private, in history or working tree.
- They never enter hosted CI, build artifacts, distributable fixtures, corpora, or the shipped product.
- Public channels stay gated on Public Release Permission.

---

## 8. How it gets built and verified

**Verification is two workflows**, `pr` and `release`, each a single job on `windows-2025`. `pr` is the only required gate, provider-free, targeting ten minutes. A Ubuntu lane, nightly tier, Test Catalog, and quarantine registry are each deferred behind a named trigger — machinery arrives when a concrete problem appears.

**Repository development uses three agent roles**: a Commander that dispatches and is sole integrator, Workers that write only their own branch, and an independent Reviewer at a task class at least equal to the work reviewed, cross-provider by default. Operating rules never depend on which model is running; Layer B is the only provider-specific policy surface, while actual dispatch logs are evidence rather than policy.

**First implementation** is a throwaway store-and-index spike at 500K/1M/10M, then a read-only tracer: open a Book, import a DOCX, view it in the windowed editor, ask a source-grounded question, and have the citation resolve to an exact highlighted block range — against a thirteen-point exit gate.

---

## 9. What is still genuinely open

Not questions, but things a reader should know are unsettled:

| Open | Status |
| --- | --- |
| **Retrieval strategy** — lexical, vector, or hybrid | Deferred to the spike. Lexical is stronger for Chinese than commonly assumed and costs no model call |
| **Editor library confidence** | ProseMirror at *medium* confidence. Windowing reduces how much this matters, but a spike should confirm |
| **Per-operation latency budgets** | Proposed as calibration only; to be fixed against measurement |
| **Code signing certificate** | Deferred until explicitly requested. Unsigned builds are a known SmartScreen adoption cost |
| **Windows sandbox enforcement** | Landlock is Linux-only. Whether the Windows path genuinely enforces the Agent Data Root must be verified before the boundary is called *enforced* rather than *intended* |
| **Question 16 scope** | The answer was "mostly okay" with one correction; whether the other four content/evidence classes were endorsed was never itemized |
| **UI/UX** | Reserved for a separate session by design — layout, interaction, information architecture, renderer framework |

---

## 10. The ten sentences that carry the most weight

1. Text is authoritative for what it says, never for whether it is true.
2. A prompt may shape quality but may never grant authority.
3. Not depending on a package is a stronger guarantee than not wiring it.
4. Adopting a framework is not adopting its defaults.
5. Privacy is an egress boundary, not an identity boundary.
6. Editor decisions are the oracle for taste, never for facts.
7. Hidden is permitted; silent is not.
8. A user who cannot assess whether an action is safe must never be asked to authorize it.
9. One authority, many projections — consistency across forms, not a shared primitive.
10. Add machinery when a concrete problem appears, not in advance.
