# Clarification 0003 — Accept bounded unsupported Codex risk

Status: **owner accepted for the V2 candidate; canonical integration, exact artifact selection, technical closure, A3, and implementation remain pending**

Recorded: **2026-08-23**

Decision owner: **AI7 owner**

Record owner: **Repository Development Commander**

## Question

May AI7 continue toward a production Primary Agent Harness based on Codex App Server even while OpenAI explicitly describes that surface as experimental and unsupported for production workloads?

## Recommended answer presented

**U2 — accept the unsupported status as a bounded, explicit risk.** Require one obtainable exact artifact, an AI7-owned deep adapter boundary, a fail-closed protocol/schema fingerprint gate, no silent upgrade, release and compatibility evidence, and a stated exit plan. Treat the answer as authority for further evidence and candidate design only, not as a dependency selection or implementation authorization.

## Exact owner answer

> U2

## Accepted interpretation

1. The OpenAI support classification remains an evidence fact. Owner acceptance does not relabel an Experimental surface Proven, supported, stable, or production-ready.
2. The accepted exception is narrow: it covers the vendor support classification of one exact Codex App Server artifact. It does not accept missing capabilities, undocumented behavior, experimental optional fields, `dynamicTools`, plugin APIs, WebSocket, schema drift, security defects, or any other Unknown/Experimental matrix row by implication.
3. Harness Capability Closure remains a technical evidence result, while production admissibility is a separate owner decision. If every technical capability is eventually Proven but the support label remains the sole unresolved maturity fact, the candidate may report **technically closed with Accepted Unsupported Dependency Risk**; it must not report an unqualified closure pass.
4. The exception cannot attach to moving `main`, a research-only commit, “latest,” or the currently installed CLI merely because it runs. A2 must identify one exact published release, package version, or binary that AI7 can actually obtain and ship, with its source identity and protocol/schema identity.
5. The minimum controls are an AI7-owned Primary Agent Harness Module, exact artifact and schema fingerprints, fail-closed drift handling, no silent or floating upgrade, deterministic compatibility and journey gates, isolated storage/process lifecycle, documented rollback or replacement, and a maintained exit plan.
6. Fingerprint mismatch, an unmitigated security issue, inability to reproduce/package the artifact, failure of a load-bearing capability test, or material widening of the unsupported surface suspends production admissibility. It does not trigger automatic upgrade, retry, DeepSeek fallback, or a second agent loop.
7. This answer does not prove Codex capability closure or a Codex Capability Gap, select Codex for production, reopen DeepSeek runtime comparison, choose adapter versus patch/fork maintenance, enter A3, or authorize implementation.
8. A later coherent V2 candidate must expose this risk and its exit conditions explicitly for final owner acceptance; it may not bury them in a dependency lockfile, prompt, or internal implementation note.

## Resolved V2 term

**Accepted Unsupported Dependency Risk** (`已接受的不受支持依赖风险`):
An explicit owner decision that permits continued evaluation—and later candidate use—of one exact vendor-unsupported dependency under named fail-closed controls and exit conditions. It changes production risk appetite, not the dependency's factual maturity or the evidence score of unrelated capabilities.

The Issue #4 Worker must add this candidate term to the owning execution context and bilingual glossary without weakening the existing Harness Capability Closure definition.

## Consequences for A2

- `DQ-A2-01` is resolved as U2.
- A2 may continue only under a separate Commander brief after the exact closure subject is selected and identified.
- The matrix must keep evidence maturity and owner risk acceptance in separate fields or records. No Experimental or Unknown row becomes Proven merely because this clarification exists.
- The unsupported-status blocker can be dispositioned only for the exact artifact and mandatory safeguards. Every other exit test remains independently binding.
- A3 still requires a selected or decision-ready exact executable/process/protocol/tool/network surface; this clarification alone does not provide one.

## ADR qualification

This is hard to reverse because it permits a production architecture to depend on an explicitly unsupported vendor surface; surprising without context because the same vendor recommends the surface for deep integration; and the result of a real schedule, control, and support trade-off. The Worker must incorporate it into the existing candidate harness ADR and keep exact dependency pinning or maintained source changes for separately evidenced decisions.

## Canonical-integration and writer boundary

This record is an exact noncanonical owner input. It edits no canonical product promise and authorizes no dependency install, source download or copy, prototype, implementation, pull request, push, merge, release, or external publication. The Commander owns this immutable record. The Issue #4 Worker must consume the exact Git object supplied by the Commander, cite it, and write resulting candidate context, glossary, ADR, matrix, risk, and architecture changes only on `docs/4-v2-architecture-candidate`, never from the Commander/user transcript.
