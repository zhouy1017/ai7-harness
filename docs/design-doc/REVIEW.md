# Design-doc advisory review record

Status: **owner-requested two-axis advisory review; not a formal gate; `same-provider review — independence reduced`**

This record covers the `design-doc` aggregate at Issue #7 base `9b3e949ac02ac1bd1b283c1d3c7db958733dda09` and the bounded documentation repairs authorized from that review. It does not accept candidate packages into `main`, authorize implementation, or claim an independent re-review of the repair commit.

## Standards

### S-01 — Historical A2 records advertised stale current gates

- **Finding:** Five retained A2 dispatch/evidence files still said work was pending, blocked, or awaiting exact-head review even though the bounded work completed and the source/artifact proof programme was later retired.
- **Commander disposition:** Repair only their top-level status lines to truthful historical completed-or-retired wording. Preserve the evidence bodies, exact objects, scores, limitations, and historical stop boundaries; create no current proof gate.

### S-02 — Current routers lagged the aggregate state

- **Finding:** `HANDOFF.md` reported 26 rather than 28 root ADRs, said the Phase-0 exit review had not run, left UI/UX reserved despite formed V1/V2 packages, and did not record Issue #6 integration. `PROGRESS.md` also retained Issue #6 as awaiting integration and left historical Codex-first key-decision wording unqualified.
- **Commander disposition:** Correct current routing and the latest checkpoint, retain chronology, explicitly mark the old Codex-first key-decision lines superseded, and state the current topology as one DSH production loop with DeepSeek primary but non-exclusive and Codex retained only as an Interaction Model and engineering reference.

### S-03 — Integrated CI boundary still described itself as a Worker candidate

- **Finding:** `docs/agents/ci-test-boundaries.md` still said it awaited Commander integration after Issue #6 had already entered `design-doc` through merge commit `9b3e949ac02ac1bd1b283c1d3c7db958733dda09`.
- **Commander disposition:** Record it as the accepted implementation boundary under accepted ADR 0027 on `design-doc`, while stating that aggregate integration is not `main` acceptance or implementation authorization.

### S-04 — Three V2 UI/UX ADRs lacked candidate status

- **Finding:** UI/UX ADRs 0011, 0012, and 0013 had no frontmatter and could be mistaken for canonical accepted root ADRs even though their package remains candidate-only.
- **Commander disposition:** Add explicit `status: candidate` frontmatter. Do not promote their decisions into `main` or alter their content.

### S-05 — Historical agent commits lack required co-author trailers

- **Finding:** Commits `0bcc784a704c4169e930dff33cea09a37633023e`, `ec26b70ad9a60cdfb046ca57ef441a38962e73ee`, and `7ecb8add6351764644aefc981dadcdfaef999746` are missing the model co-author trailer required by `docs/agents/git-conventions.md`.
- **Commander disposition:** Record this as known historical Standards nonconformance and do not rewrite it. All three commits are shared ancestors preserved by the owner-requested aggregate; rewriting them would change imported source history, invalidate exact object references and descendants, and defeat `design-doc`'s history-preservation purpose. No archive ref is needed. Every future agent-authored commit must carry the correct model `Co-Authored-By` trailer.

## Spec

### P-01 — Retained design notes reopened verification programmes superseded by ADR 0027

- **Finding:** Current wording in `kick-in/06-risk-register.md`, `kick-in/08-source-document-inheritance.md`, `kick-in/29-editorial-quality-metrics.md`, and `kick-in/30-upstream-consumption-and-upgrade-contract.md` still required a six-point pin-upgrade proof, tiered/mock-provider validation, a separate two-sided Behavior Evaluation Gate, or an early performance gate.
- **Commander disposition:** Make those clauses explicitly superseded historical design or route applicable behavior to supported E2E journeys and observed-bug regressions. Preserve Quality Signals, behavioral goals, long-manuscript targets, exact pins, provenance, licensing, and third-party-notice obligations.

### P-02 — Agent Data Root overclaimed whole-process confinement

- **Finding:** The canonical Execution definition said the agent genuinely had filesystem permission only inside the Agent Data Root, stronger than the accepted Windows/macOS confinement evidence supports.
- **Commander disposition:** Define the Agent Data Root as the intended platform filesystem boundary with Run Source Scope nested inside. Until a concrete platform mechanism supports a stronger claim, capability/service facades are the enforceable boundary and no whole-process OS isolation is assumed. Keep `GLOSSARY.md` as an index/collision guide rather than a duplicate definition owner.

### P-03 — V2 UI/UX simplified Plugin admission semantics

- **Finding:** The requirements and information architecture reduced Clarification 0005 to `>5 stars / >3 updates / within 30 days`, omitting qualifying-commit, standalone/monorepo, and immutable-pin rules.
- **Commander disposition:** Restore the exact thresholds and counting semantics: at least six stars; at least four qualifying plugin-related non-merge commits; newest qualifying commit no earlier than 30 days before selection; relevant default-branch commits for a standalone repository; only plugin-directory or manifest-affecting commits for a monorepo; and no mutable branch, tag, or `latest` as a Local Plugin Pin. Add no new UI surface.

### P-04 — All declared aggregate source heads are genuine ancestors

- **Finding:** No ancestry defect. The declared heads `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9`, `960689172bcf54eb3f27b57045a4ce4e9f20695d`, `587d6455f6a578d3df8a39f534ec7a057c07a18c`, `b5cb8d3e51cb64552352c7f90335534580bfdb51`, `247b7dacb267ba2f4076ca8461c95e5f0508b343`, and `b903bbf515d9e6c23f48ee520911dfca7256b1af` are all ancestors of the Issue #7 base.
- **Commander disposition:** Retain the aggregate ancestry and source histories unchanged; no history edit or archive ref is warranted.

### P-05 — Harness pin and model routing are materially consistent

- **Finding:** No blocking divergence. The consumed Harness baseline remains exactly `0.1.0-rc.6`; Model Roles remain provider-independent; the current production topology is one DSH loop, DeepSeek-primary but non-exclusive, with the accepted Flash/Pro High/Pro Max defaults and Codex outside the production runtime.
- **Commander disposition:** Retain those semantics and repair only stale router wording. Do not install dependencies, discover Plugins, or create a second loop.

### P-06 — Proposal-card and atomic-group semantics are materially consistent

- **Finding:** No blocking divergence. The V2 package keeps one Manuscript-anchored Proposal Card identity per independently reviewable Proposal Change Item and permits indivisible disposition only through an explicitly named Atomic Proposal Change Group.
- **Commander disposition:** Retain the candidate semantics unchanged; add only the missing candidate status metadata to ADRs 0011–0013.

### P-07 — Windows and macOS remain one product

- **Finding:** No blocking divergence. Active architecture, CI boundary, and V2 UI/UX treat Windows and macOS as one AI7 product with shared domain, authority, journeys, data meaning, and user-visible outcomes while allowing explicit native mechanics.
- **Commander disposition:** Retain ADR 0028 and the one logical cross-platform E2E Functional Gate. Do not infer unresolved macOS mechanics from Windows or create per-platform certification gates.

### P-08 — Scope creep

- **Finding:** None. The repair is documentation-only and does not add product implementation, source copying, dependency installation, prototype/Figma work, a validation programme, `main` acceptance, or external action.
- **Commander disposition:** Keep the change bounded to the named review findings and lightweight documentation checks.
