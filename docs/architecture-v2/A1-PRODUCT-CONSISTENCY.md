# Retained A1 product consistency

Status: **noncanonical design reference; compacted and non-gating**

The owner has accepted Windows and macOS as one AI7 product under ADR 0028. The former A1 packet's evidence counts and proof programme remain retired, while its product-semantics and native-variation discipline now apply across both supported platforms. Windows zip-portable and NSIS are Windows channel mechanics, not the definition of product scope.

Product consistency is judged by domain identity, authority, state transition, user-visible outcome, and negative guarantees—not pixels, source trees, package shapes, or evidence counts.

## Stable invariants

| ID | Shared V2 invariant |
| --- | --- |
| **I-01** | The product is exactly AI7: one Chinese-first professional literary-publishing Standalone product on Windows and macOS, with Word excluded from V1. |
| **I-02** | AI7 business and domain records remain authoritative; DeepSeek Harness technical history correlates only through Execution Bindings and Harness Execution Spans. |
| **I-03** | Exact Book/deliverable/revision/scope, provider processing, budget, capabilities, expected outcome, and Effect classes are understandable before Run Authorization. |
| **I-04** | Run Authorization, execution approval, Effect Approval, Proposal Decision, Review Decision, Public Release Permission, and Effect Receipt never collapse. |
| **I-05** | Textual fidelity never becomes factual truth; Reference Integrity, Claim Support, and Factual Verification remain separate. |
| **I-06** | Generated manuscript changes are proposal-first and exact-pin-bound; apply is atomic; journal, checkpoint, and recovery records remain distinct. |
| **I-07** | Each deliverable owns immutable revisions and workflow state; gates, review, signoff, Milestone/Publication Version, destination-independent package identity, local export, maintenance, and public release retain separate authority and proof. Native rename/cancel/replace presentation never changes AI7's approval-before-commit, per-file receipt, or ambiguity semantics. |
| **I-08** | Editorial Learning is not Model Training; explicit eligibility and lineage govern reuse; quality feedback never establishes factual correctness. |
| **I-09** | Manuscripts remain outside repositories and hosted CI; Editorial Runs receive AI7 Capabilities rather than generic shell/filesystem/network or coding defaults. |
| **I-10** | Long-manuscript editing keeps no-silent-loss fidelity, bounded rendering, service-streamed whole-manuscript operations, and the 500K/1M/10M design targets. |
| **I-11** | Parallel Runs, pause/cancel, clarification, Task Outcome, Resume/Retry/Redo/Replay, partial outcomes, and ambiguity stops retain their exact identity consequences. |
| **I-12** | Chinese IME, native keyboard conventions, focus, zoom/reflow, non-color meaning, and applicable Windows and macOS assistive technology preserve every supported journey. |
| **I-13** | Material channel or CPU differences are disclosed before reliance and never weaken I-01–I-12. |

## Permitted native/channel variation

Window chrome, menus, shortcuts, file pickers and existing-target rename/cancel/replace presentation, installation flow, data-path presentation, secret-store prompts, font fallback, and CPU artifact may vary when the same AI7 command, record transition, authority, fidelity, privacy, recovery, and accessibility outcome remains.

A difference is not “native variation” if it changes Book or manuscript authority, hides silent loss, weakens scope, changes an Effect or receipt, removes a core journey, or introduces a lower support tier without disclosure.

## Retained journey frame

The historical [A1 Evidence Crosswalk](./A1-EVIDENCE-CROSSWALK.md) remains a useful inventory of import/fidelity, long-manuscript editing, task authorization, execution/continuation, evidence/factual review, proposals/conflicts, workflow/delivery, recovery/concurrency, learning, Series/Cross-project work, onboarding, and accessibility/IME journeys.

Its 79-row and 14-journey counts, exact-source mapping, candidate dispositions, and missing-evidence lists are historical reference only. They do not define V2 completeness, CI, or proof. Where the crosswalk says macOS had no admitted journey, that is a historical evidence observation and no longer a product-scope statement.

## V2 consequence

The [Architecture](./ARCHITECTURE.md) and [Harness Integration](./HARNESS-INTEGRATION.md) preserve these semantics while replacing the former conditional capability-closure path. The current [Decision Queue](./DECISION-QUEUE.md) has no product-consistency choice blocking V2.
