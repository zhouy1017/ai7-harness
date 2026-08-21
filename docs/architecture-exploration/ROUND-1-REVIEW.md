# Round 1 Architecture Review

Status: **independent main-baseline review complete; candidate-handoff delta complete**
Reviewed baseline: `main@c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9`
Review task: `01a02278-cdc5-7c81-a08d-490b8b76bc26`

This is a Commander-curated synopsis of the independent Reviewer's final report. It is not an accepted v2 architecture and does not copy the task transcript.

## Review integrity

- Detached `HEAD`, local `main`, and `origin/main` all matched the requested commit.
- The Reviewer reported a clean worktree and no files, branches, issues, commits, PRs, or external artifacts created.
- It did not read prohibited transcripts, legacy repositories, other task worktrees, or Harness source.
- Evidence was separated into `verified`, `open`, `candidate`, and `inference`.
- Dispatch: Architecture Reviewer | OpenAI | `gpt-5.6-sol` | `ultra` | T3-par | authorship-independent and contamination-clean; `same-provider review — independence reduced`.

## V1 assumption groups

The Reviewer found the following load-bearing groups on canonical `main`:

| Group | Assumptions that remain canonical at the reviewed base |
| --- | --- |
| Product | AI7 branding; Chinese-first professional publishing use; Windows Standalone V1; Word excluded; four Editorial Deliverable families; no LLM weight training; proprietary distribution and controlled predecessor reuse. |
| Domain | Book/revision mutation authority; governed Series/Cross-project/House memory; textual fidelity separate from truth; stable manuscript revision/recovery model; named decisions and Effect proof; Plan Envelopes; separate Task Skill/capability/authority layers; separate Task and Harness ledgers. |
| Runtime | Electron main, isolated renderer, separate Node/Harness service; private local IPC; TypeScript/Node; one Harness loop; full composition engine behind a narrow editorial surface; exact pinned subset rather than the CLI aggregate. |
| Platform | Windows-only target; zip portable and NSIS; Windows data-root, credential, SmartScreen, and `windows-2025` evidence assumptions. |
| Security/privacy | Manuscripts and derivatives excluded from repositories/hosted CI; configured model calls are controlled processing; Agent Data Root plus Run Source Scope are intended layered boundaries; secrets stay outside portable data; capability exclusion should be structural. |
| Verification | Provider-free `pr` and `release`; generated synthetic evidence; request fingerprinting; store/index and tracer spikes before product implementation; retrieval, editor confidence, and latency budgets remain evidence-gated. |
| UI/editor | Renderer is non-authoritative; bounded manuscript windows and service-backed global operations; ProseMirror is medium confidence; users see editorial objects and named states rather than files/security jargon; detailed UI was deliberately open at the base. |

## First-order redesign tensions

1. **Windows-only V1 versus one Windows+macOS product.** This crosses platform scope, IPC, credentials, storage, isolation, packaging, signing, lifecycle, release evidence, and UI conventions.
2. **Real Agent Data Root confinement versus unverified enforcement.** If OS confinement is not real, trust shifts to capability/service guards and may change process and plugin boundaries.
3. **Audited `rc.5` versus selected `rc.6`.** The running artifact's composition, guards, Session/replay behavior, dependency closure, and ABI must be audited directly.
4. **Open UI architecture versus binding domain semantics.** UI state that collapses scope, named authority, proposal/application, or receipt semantics is an architecture defect rather than a visual issue.
5. **Bounded windows versus professional editing and fidelity.** Global anchoring, IME, comments/revisions, structures, undo, and DOCX round trip remain spike-sensitive.
6. **Self-contained portability versus secrets, egress, and cross-OS data.** “Portable” needs one explicit meaning per supported channel.
7. **Windows-only evidence versus a cross-platform product claim.** Every supported target needs its own truthful build, lifecycle, input, confinement, and distribution evidence.

## Proposed v2 principles

These are proposals for exploration:

1. Promote nothing from a candidate freeze implicitly.
2. Preserve semantic authority above platform mechanisms.
3. Define one product contract before choosing platform adapters.
4. Claim only demonstrated security.
5. Audit the exact artifact that will run.
6. Keep the renderer non-authoritative.
7. Treat UI/UX as architecture evidence, mapping actions to records, authority, failures, and recovery.
8. Remain bounded at every scale-sensitive layer.
9. Make capability exclusion structural through dependency absence, OS controls, service guards, and Run Source Scope.
10. Give each supported platform its own evidence.
11. Permit platform-specific implementations, never silent platform-specific semantics.
12. Freeze only after spikes exercise failure and recovery paths.

## Inheritance recommendation

### Keep

- Chinese-first AI7 editorial purpose and Standalone boundary;
- Book/Series/Cross-project/House-memory authority separation;
- deliverable workflows;
- textual fidelity versus factual verification;
- manuscript revisions, proposals, atomic apply, and recovery;
- named decisions, Effects, receipts, and ambiguous-outcome stop;
- Plan Envelopes, Task Skill/capability separation, and two ledgers;
- one Harness loop with AI7 scheduling;
- scale tiers, bounded rendering, and disposable projections;
- privacy/egress and manuscript exclusion;
- full Harness behavior engine behind domain capabilities; and
- TypeScript/Node unless evidence establishes a bounded exception.

### Revalidate

- Windows-only product scope;
- Electron three-process topology and IPC on every candidate OS;
- Windows-specific packaging, storage, credential, and adoption mechanics;
- Windows-only `pr`/`release` evidence; and
- the UI/UX candidate against canonical state and platform contracts.

### Reject

- legacy UI/component inheritance and whole-manuscript rendering;
- treating `rc.5` and `rc.6` as equivalent evidence;
- claiming Agent Data Root OS confinement is already enforced;
- `@deepseek-ai/dsh` aggregate or generic shell/filesystem/network tools; and
- embedded Python, a second loop implementation, or legacy production-data migration absent an explicit superseding decision.

### Spike

- exact `rc.6` package subset and seams;
- per-platform process/filesystem confinement;
- store/index/retrieval strategy and 500K/1M/10M evidence;
- ProseMirror anchoring, Chinese IME, fidelity, and accessibility; and
- cross-platform data, secret, packaging, update, and integrated tracer behavior.

## Exploration sequence

The Reviewer recommended this dependency order:

1. Admit and provenance-check both candidate freezes.
2. Disposition every V1 ADR and standing rule.
3. Define the exact Windows+macOS product promise and permitted native differences.
4. Establish the truthful security boundary per OS through adversarial evidence.
5. Revalidate process topology, IPC, crash/restart, concurrency, backpressure, and headless control.
6. Define data-root, secret, copy/backup, update/downgrade, and channel semantics.
7. Audit the exact Harness package subset and `rc.5→rc.6` seam delta.
8. Run store/index/retrieval scale evidence.
9. Revalidate editor/global anchors/IME/fidelity/accessibility.
10. Map the UI candidate to exact domain records, projections, commands, authority, and recovery.
11. Prove import/export preserve/degrade/reject behavior.
12. Define the smallest honest per-platform verification and release evidence.
13. Run an integrated architecture tracer on every accepted target.
14. Submit the coherent candidate to an independent T3 challenge.

## Freeze exit summary

V2 cannot freeze until platform/channel parity is explicit; claimed isolation is evidenced or truthfully reduced; topology and lifecycle are explicit; data/secrets/update/recovery are decided; the exact Harness subset is audited; long-manuscript and editor evidence passes; UI actions map to canonical authority and receipts; document fidelity is classified; every release artifact has owned evidence; an integrated tracer passes per target; critical risks are owned; and an independent T3 Reviewer verifies the final evidence chain.

The first report ran before either structured Worker handoff was admitted. The Commander later sent only audited handoff conclusions for the completed [candidate delta review](./CANDIDATE-DELTA-REVIEW.md); no task transcript or active worktree was used.
