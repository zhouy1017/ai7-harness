---
status: accepted
---

# State the decision-layer and Run-liveness rules for every editor-facing surface

On 2026-09-07 the Owner drove the first live Provider Run, `S40/smoke/1` ([#307](https://github.com/zhouy1017/ai7-harness/issues/307)), and observed three defects of the same kind on the surfaces that carried it: the dispatch and authorization cards showed every technical identity at the same rank as the few facts an editor decides on (P3, [#304](https://github.com/zhouy1017/ai7-harness/issues/304)); for ninety seconds at a time the Run surface could not say whether the Run was alive (P4, [#305](https://github.com/zhouy1017/ai7-harness/issues/305)); and a status pill kept asserting `已进入调度器` after the Run had finished (P7, folded into #305). The Owner widened the first finding to every feature and page.

The frozen design references already say most of what is needed — calm surfaces with progressive disclosure (V2-UX-VIS-001), technical detail behind `查看技术详情` (V2-UX-COPY-007), no invented percentage (V2-UX-RUN-007), stall disclosure when updates stop (V2-UX-RUN-008) — but they say it as qualities and as prohibitions. Nothing states the rule a surface can be checked against: which facts belong to the layer an editor reads, which belong one step away, what a surface must show between two increments of Measured Run Progress, and how long a transient indicator may live. Under [ADR 0064](./0064-reweight-repository-development-toward-value-first-delivery.md) the references change only through an ADR that names the clause. This is that ADR.

## Decision

### The clauses this ADR changes

- `docs/ui-ux-v2/requirements.md` gains `## Decision layer and technical identity` (V2-UX-LAYER-001 to 008) after `## Microcopy, errors and technical disclosure`, and `## Run liveness` (V2-UX-LIVE-001 to 006) after `## Running activity`.
- `docs/ui-ux-v2/CONTEXT.md` gains three Language terms after **Measured Run Progress**: **Decision Layer** (`决策层`), **Technical Identity Layer** (`技术标识层`), and **Run Liveness Signal** (`任务存活信号`). `docs/ui-ux-v2/GLOSSARY.md` indexes them.
- `docs/ui-ux-v2/interaction-spec.md` `### Activity projection rules` gains two bullets binding the Run Activity Header to the liveness signal and the indicator lifetime.
- `docs/ui-ux-v2/README.md` records the direction as D-088.

No other clause moves. In particular the exact-disclosure requirements (V2-UX-REUSE-021, V2-UX-IMP-033, V2-UX-APREP-006/008), V2-UX-VIS-003, and V2-UX-COPY-011 stand unchanged; this ADR says where an exact identity sits, never whether it is disclosed.

### 1 · Two layers on every surface

Every editor-facing surface separates a **Decision Layer** from a **Technical Identity Layer**. The Decision Layer answers, in the product's editorial Chinese and in local time, what the surface is about, what an action will read, what it will produce, what it will not do, what it costs, and the one safe next action. The Technical Identity Layer carries digests, record identifiers, references, schema and version identifiers, and machine instants, closed by default behind one disclosure affordance per surface and opened without changing any state.

What may never be demoted: named non-effects, the Run Budget Ceiling state, the scope of reading and the Outbound Data Category, the exact blocker, the Provider decision, the consequence of the primary action, and any decision the editor must weigh before acting. Nothing leaves the record: every identity stays reachable, copyable, and unabridged.

### 2 · Vocabulary, time, and reach

A term of art appears in the Decision Layer in the form the glossary defines, and a bare English identifier is never a heading, label, or status there. Time in the Decision Layer is absolute local date and time, with relative time as a supplement; the ISO instant lives in the technical layer. A surface's primary actions are reachable without scrolling at every scroll position — the workbench's `打开稿件`, `打开另一本图书`, and `返回图书列表` sat below several screens of analysis output on 2026-09-07, which is the case this clause exists for. Provenance collections render as counts with disclosure, never as inline identifier walls; a record whose fields are all empty renders as one line, never as one full-weight row per empty field.

### 3 · The Run Liveness Signal

Beside Measured Run Progress, while a Run executes, every Run surface shows a signal composed only of facts the system already holds: the current unit and the instant its attempt started, the last recorded Run Record transition, completed transmissions and their recorded usage, and the Provider attempt's own state. The reader computes elapsed time from a shown instant; the product never estimates a percentage or a remaining time. The signal is sampled — a changed fact reaches the surface within 2 seconds and the elapsed reading refreshes at least every 5 seconds — so "still alive" is answerable inside that interval, not only at unit boundaries.

The stale case is measured, not guessed: when the current step exceeds twice the longest completed step of this Run, or 3 minutes before any step has completed, the surface says `本步骤用时已超过通常水平`, shows the elapsed time and the last recorded transition, and offers only the safe actions valid for the state. It never claims the Run has died unless a recorded state says so. The first live Run measured about 90 seconds per unit with a longest unit near 150 seconds; the factor and the pre-measurement threshold are starting points, revisited as more Runs are measured.

A transient status indicator lives exactly as long as the state that produced it and never occludes content it does not own. The execution owner exposes the per-attempt state and timing as identities and instants only.

### 4 · Application order: rule, survey, then surfaces

The rule precedes application because applying a display principle wherever someone happens to look is how the scope-statement defects of #303 survived #291. The survey is the deliverable that makes the rule enforceable:

- **Inventory.** For each of J-01, J-02, J-03, J-04, J-08, J-12, and J-15, every screen and card the runner drives, listed by Journey stage, with the renderer function that builds it.
- **Verdict fields per surface.** Decision Layer content present and what is missing; values sitting at the wrong rank, named; primary actions reachable without scrolling; time format; bare English headings or labels; transient indicators and what ends them; verdict `conforming` or `non-conforming`; the Issue it routes to.
- **Delivery.** The survey is posted as a comment on #304 — a durable record beside the rule, not a new status owner — and every non-conforming surface receives its own Issue with its verdict carried over. Per-surface application then runs as T1 or T2 units against a rule that exists, each asserting in its Journey that the Decision Layer reads as specified and that the technical layer still carries the exact values the Journey pins.

The four renderer sites #303's sweep routed to #304 (`src/renderer/index.ts:2166`, `:2272`, `:2401`, `:2979`) are display and correctness defects at once; whichever unit fixes them derives the statement from the bound launch and moves it to its rank in one pass.

## Consequences

- `docs/ui-ux-v2/` is no longer silent between two increments of Measured Run Progress, and a surface can be checked against a rule instead of a taste. The exact-disclosure guarantees are untouched; what changes is rank and vocabulary.
- The liveness signal needs facts the execution owner already holds but does not project; #305's implementation exposes them as identities and instants, and J-04 asserts that a Run mid-unit is distinguishable from a Run that has stopped.
- The sampling interval and the stale factor are the first numbers this design has stated for liveness. They are defaults derived from one Run; a change to them is a change to V2-UX-LIVE-002 or 003 through an ADR, not a constant tuned in code.
- #304 and #305 stop being T3 design work and become a survey plus per-surface T1 and T2 units; the plan's rows 1c.1 and 1c.2 record that.

## Rejected alternatives

- **Hide technical identities from ordinary surfaces.** Rejected: V2-UX-VIS-003 and the exact-disclosure requirements exist because an editor sometimes needs the exact digest; the defect was rank, not presence.
- **An estimated percentage or spinner between increments.** Rejected, as V2-UX-RUN-007 already rejects it: motion the system cannot vouch for is the one thing this product must not show. Every composing fact of the liveness signal is something the system recorded.
- **A fixed stall timeout.** Rejected: ninety seconds is normal for this model and ten minutes is not, and the product can measure the difference from its own steps instead of guessing in advance.
- **Fix the pill, the timestamps, and the workbench actions one by one.** Rejected: P3, P4, and P7 are one defect — a surface asserting something not derived from current state or ranked by what an editor needs — and Phase 2 builds four families of new surfaces that would repeat it.

This decision governs presentation only. It changes no domain semantics, no Task, Run, Proposal, Effect, or export authority, no Provider Resolution Plan field, and no Journey's pinned values; it changes where those values sit and what else must be true beside them.
