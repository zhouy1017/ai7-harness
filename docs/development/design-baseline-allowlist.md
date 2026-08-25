# V2 development baseline allowlist

Status: **Issue #20 source/disposition record for the Owner-accepted `dev` development baseline**

## Fixed points and rule

| Role | Exact identity |
| --- | --- |
| Fixed development base | `dev@6b827325ea888e1414f26b3e7f37ee33a7a9fff1` |
| Frozen design source | `design-doc@6895f02d2983865516d267809d8cdda77026f62c` |
| Stable/release line held unchanged | `main@c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` |
| Work item | GitHub Issue #20, “Normalize the frozen V2 design into dev” |

Only the exact paths and dispositions below are admitted. The source commit supplies provenance, not merge authority: no merge or cherry-pick of `design-doc` history occurred, and file age, merge order, source status labels, or path presence did not decide authority. Every direct source file was first restored from the exact source blob and then individually reviewed; every semantic change after that restore is a normalization against the Owner instruction and fixed-base root authority.

The path accounting is exact:

| Source disposition | Source paths | Destination effect |
| --- | ---: | ---: |
| Direct copy, then normalize | 100 | 100 branch-diff destinations |
| Promote semantics into root owners | 4 | 2 new ADR destinations; the glossary/context semantics land in two destinations already counted above |
| Rewrite current routers | 2 | 2 branch-diff destinations |
| Exclude | 76 | 0 branch-diff destinations |
| **Frozen-source total** | **182** | **104 destinations from source dispositions** |
| Additional fixed-base normalization | — | 3 branch-diff destinations |
| **Exact Issue #20 destination set** | — | **107** |

`git diff -M` between the two fixed points also reports the base-only deletion of `docs/agents/development-lines.md`; it is not one of the 182 source-tree paths. Issue #18 owns that file, so this normalization retains its exact fixed-base blob and does not include it in the branch diff. This is the one additional source-vs-base line-governance difference outside the 182 source dispositions.

## Direct copy, then normalize — 100 source paths

For every path in this section:

- **source:** `design-doc@6895f02d2983865516d267809d8cdda77026f62c:<path>`;
- **destination:** the identical `<path>` on the Issue #20 branch for `dev`;
- **disposition:** restore the exact source blob, review it, then normalize status, authority, routing, and superseded claims where required;
- **reason:** it is part of the coherent Owner-accepted V2 architecture/UI baseline or a required root decision, context, governance document, or implementation runbook.

```text
docs/architecture-v2/README.md
docs/architecture-v2/ARCHITECTURE.md
docs/architecture-v2/ASSUMPTIONS.md
docs/architecture-v2/DECISION-QUEUE.md
docs/architecture-v2/HARNESS-INTEGRATION.md
docs/architecture-v2/MIGRATION.md
docs/ui-ux-v2/CONTEXT.md
docs/ui-ux-v2/DECISION-QUEUE.md
docs/ui-ux-v2/GLOSSARY.md
docs/ui-ux-v2/HANDOFF.md
docs/ui-ux-v2/MISSING-DESIGN-DECISION-MAP.md
docs/ui-ux-v2/README.md
docs/ui-ux-v2/adr/0001-user-approved-default-execution-rules.md
docs/ui-ux-v2/adr/0002-append-only-run-rewind.md
docs/ui-ux-v2/adr/0003-reverse-committed-apply-with-a-new-effect.md
docs/ui-ux-v2/adr/0004-use-tiered-progressive-evidence-assurance.md
docs/ui-ux-v2/adr/0005-project-signoff-as-a-user-facing-milestone-version.md
docs/ui-ux-v2/adr/0006-use-purpose-specific-document-representations.md
docs/ui-ux-v2/adr/0007-use-publication-version-as-public-release-permission-projection.md
docs/ui-ux-v2/adr/0008-authorize-exact-runs-for-deferred-connectivity-start.md
docs/ui-ux-v2/adr/0009-use-explicit-book-first-learning-eligibility.md
docs/ui-ux-v2/adr/0010-transfer-one-editable-manuscript-surface-between-windows.md
docs/ui-ux-v2/adr/0011-use-proposal-change-items-and-explicit-atomic-groups.md
docs/ui-ux-v2/adr/0012-extract-reusable-structure-without-instance-authority.md
docs/ui-ux-v2/adr/0013-use-latest-eligible-new-version-and-preserve-historical-pins.md
docs/ui-ux-v2/adr/0014-wait-by-default-and-stream-only-interactive-dialogue.md
docs/ui-ux-v2/information-architecture.md
docs/ui-ux-v2/interaction-spec.md
docs/ui-ux-v2/journeys.md
docs/ui-ux-v2/migration-from-v1.md
docs/ui-ux-v2/requirements.md
docs/ui-ux-v2/visual-direction.md
docs/adr/0002-book-series-cross-project-and-house-learning-scopes.md
docs/adr/0008-use-deliverable-owned-workflow-profiles.md
docs/adr/0012-exclude-legacy-production-data-migration.md
docs/adr/0013-ship-standalone-only-v1.md
docs/adr/0014-verify-on-one-windows-gate.md
docs/adr/0015-provider-neutral-development-dispatch.md
docs/adr/0017-full-engine-narrow-tool-surface.md
docs/adr/0020-consume-pinned-harness-package-subset.md
docs/adr/0021-single-execution-authority.md
docs/adr/0022-typescript-only-runtime.md
docs/adr/0023-portable-release-with-self-contained-data-root.md
docs/adr/0024-electron-shell-with-isolated-ai7-service.md
docs/adr/0027-concentrate-ci-on-e2e-functionality.md
docs/adr/0028-support-windows-and-macos-as-one-product.md
docs/adr/0029-keep-one-primary-manuscript-per-book.md
docs/adr/0030-compare-reimports-without-inventing-source-lineage.md
docs/adr/0031-persist-verified-import-staging-for-explicit-recovery.md
docs/adr/0032-materialize-task-input-before-exact-run-pinning.md
docs/adr/0033-default-run-budget-ceiling-to-unset.md
docs/adr/0034-require-explicit-resume-after-interruption.md
docs/adr/0035-require-explicit-book-targeted-source-acquisition.md
docs/adr/0036-promote-series-knowledge-through-explicit-review.md
docs/adr/0037-enforce-versioned-series-retrieval-exclusions-immediately.md
docs/adr/0038-separate-delivery-package-identity-from-local-export.md
docs/adr/0039-delegate-local-export-collisions-to-native-os-workflows.md
docs/adr/0040-preserve-post-designation-maintenance-as-versioned-cases.md
AGENTS.md
GLOSSARY.md
UBIQUITOUS_LANGUAGE.md
docs/domain/editorial/CONTEXT.md
docs/domain/execution/CONTEXT.md
docs/agents/README.md
docs/agents/change-brief.md
docs/agents/ci-test-boundaries.md
docs/agents/design-authority.md
docs/agents/document-lifecycle.md
docs/agents/git-conventions.md
docs/agents/incremental-development.md
docs/agents/issue-tracker.md
docs/agents/multi-session-design-workflow.md
docs/agents/project-constraints.md
docs/agents/source-checkout-buildability.md
docs/agents/triage-labels.md
kick-in/00-charter.md
kick-in/02-target-architecture.md
kick-in/03-keep-adapt-drop.md
kick-in/04-migration-workflow.md
kick-in/05-decision-map.md
kick-in/06-risk-register.md
kick-in/08-source-document-inheritance.md
kick-in/09-retained-development-workflows.md
kick-in/14-foundation-model-editorial-intelligence.md
kick-in/15-harness-agent-behavior.md
kick-in/16-policy-documents-and-feedback-ux-handoff.md
kick-in/25-standalone-word-surface-boundary.md
kick-in/26-tiered-verification-and-mock-provider-evidence.md
kick-in/27-repository-development-dispatch.md
kick-in/28-harness-capability-and-authority-boundary.md
kick-in/29-editorial-quality-metrics.md
kick-in/30-upstream-consumption-and-upgrade-contract.md
kick-in/31-single-execution-authority.md
kick-in/32-runtime-language-and-release-channel.md
kick-in/33-standalone-shell-and-editor-topology.md
kick-in/34-first-tracer-slice.md
kick-in/35-minimal-e2e-validation.md
kick-in/35-windows-macos-product-platform.md
kick-in/README.md
kick-in/decisions/README.md
```

## Promote semantics into root owners — 4 source paths

| Exact source path at `design-doc@6895f02` | Destination | Disposition | Reason |
| --- | --- | --- | --- |
| `docs/architecture-v2/GLOSSARY.md` | `GLOSSARY.md` | Semantically merge the architecture terms; do not retain the local file | Root glossary is the cross-context index; a package-local competing owner would make routing ambiguous |
| `docs/architecture-v2/domain/execution/CONTEXT.md` | `docs/domain/execution/CONTEXT.md` | Semantically merge the eleven architecture/execution concepts; do not retain the local context | The root Execution context is the canonical definition owner |
| `docs/architecture-v2/adr/0001-dsh-first-deepseek-primary-architecture.md` | `docs/adr/0041-dsh-first-deepseek-primary-architecture.md` | Restore, renumber, mark accepted on `dev`, and normalize source-qualified links/status | The hard-to-reverse DSH-first decision belongs in the root ADR sequence |
| `docs/architecture-v2/adr/0002-admit-and-pin-third-party-dsh-plugins.md` | `docs/adr/0042-admit-and-pin-third-party-dsh-plugins.md` | Restore, renumber, mark accepted on `dev`, and normalize source-qualified links/status | Plugin admission/pinning is a root architecture decision, not package-local authority |

The glossary and context destinations are already among the 100 direct paths, so these four source paths add only the two ADR destinations to the branch-diff set.

## Rewrite current routers — 2 source paths

| Exact source path at `design-doc@6895f02` | Destination | Disposition | Reason |
| --- | --- | --- | --- |
| `HANDOFF.md` | `HANDOFF.md` | Rewrite from the fixed-base governance plus accepted normalized baseline | Cold-start routing must point to current `dev`, active root owners, the policy/planning/tracer sequence, and no excluded history |
| `PROGRESS.md` | `PROGRESS.md` | Rewrite as the Issue #20 checkpoint | A frozen-branch or earlier-session progress record cannot be copied as current state |

## Explicit exclusions — 76 source paths

Exclusion has three exact status-dependent meanings:

- **61 source-added (`A`) paths:** remain absent.
- **5 source rename (`R`) destinations under `docs/archive/**`:** the new archive destinations remain absent, while each paired fixed-base `handoff20260817/**` source path remains at its exact `dev@6b827325` blob and is not in the branch diff.
- **10 source-modified (`M`) paths:** retain their exact `dev@6b827325` blobs and are not in the branch diff.

### Frozen V1 UI and prototype — 15 `A` paths

Destination is absent for every path. Reason: frozen V1 geometry, prototype/Figma handoff, UI plan, and artifacts are historical rather than the accepted V2 implementation baseline.

```text
docs/ui-ux/README.md
docs/ui-ux/V1-FREEZE-HANDOFF.md
docs/ui-ux/figma-handoff.md
docs/ui-ux/information-architecture.md
docs/ui-ux/interaction-spec.md
docs/ui-ux/prototype/NOTES.md
docs/ui-ux/prototype/README.md
docs/ui-ux/prototype/app.js
docs/ui-ux/prototype/index.html
docs/ui-ux/prototype/open.ps1
docs/ui-ux/prototype/styles.css
docs/ui-ux/requirements.md
docs/ui-ux/traceability.md
docs/ui-ux/usability-test-plan.md
docs/ui-ux/visual-system.md
```

### Architecture-exploration history — 33 `A` paths

Destination is absent for every path. Reason: dispatch packets, evidence attempts, control records, and candidate exploration are historical Git evidence, not current implementation-facing architecture.

```text
docs/architecture-exploration/A2-ARTIFACT-PROBE-DISPATCH.md
docs/architecture-exploration/A2-CLOSURE-SUBJECT-DECISION.md
docs/architecture-exploration/A2-CONTRACT-REWORK-DISPATCH.md
docs/architecture-exploration/A2-DISPATCH.md
docs/architecture-exploration/A2-EVIDENCE-MAPPING-CORRECTION.md
docs/architecture-exploration/A2-EXACT-ARTIFACT-DISCOVERY-DISPATCH.md
docs/architecture-exploration/A2-EXACT-ARTIFACT-EVIDENCE.md
docs/architecture-exploration/A2-REWORK-DISPATCH.md
docs/architecture-exploration/A2-STATIC-ARTIFACT-PROBE-EVIDENCE.md
docs/architecture-exploration/A2-STATIC-ARTIFACT-PROBE-RETRY-EVIDENCE.md
docs/architecture-exploration/A2-STATIC-EVIDENCE-RESCORE-DISPATCH.md
docs/architecture-exploration/A2-TOOL-SURFACE-EXTRACTOR-QUALIFICATION-DISPATCH.md
docs/architecture-exploration/A2-TOOL-SURFACE-PATH-DISCOVERY-ATTEMPT-EVIDENCE.md
docs/architecture-exploration/A2-TOOL-SURFACE-PATH-DISCOVERY-DISPATCH.md
docs/architecture-exploration/A2-TOOL-SURFACE-PATH-DISCOVERY-RETRY-ATTEMPT-EVIDENCE.md
docs/architecture-exploration/A2-TOOL-SURFACE-PATH-DISCOVERY-RETRY-DISPATCH.md
docs/architecture-exploration/A2-TOOL-SURFACE-SOURCE-AUDIT-DISPATCH.md
docs/architecture-exploration/A2-TOOL-SURFACE-SOURCE-AUDIT-EVIDENCE.md
docs/architecture-exploration/CANDIDATE-DELTA-REVIEW.md
docs/architecture-exploration/CODEX-EXTENSION-SEAMS.md
docs/architecture-exploration/CODEX-HARNESS-DIRECTIVE.md
docs/architecture-exploration/CONTROL.md
docs/architecture-exploration/DSH-FIRST-CANDIDATE-REWRITE-DISPATCH.md
docs/architecture-exploration/KNOWN-PROBLEMS.md
docs/architecture-exploration/PACKET-MANIFEST.md
docs/architecture-exploration/REVIEW-PACKET.md
docs/architecture-exploration/ROUND-1-REVIEW.md
docs/architecture-exploration/V2-DISPATCH.md
docs/architecture-exploration/clarifications/0001-primary-agent-harness-role.md
docs/architecture-exploration/clarifications/0002-codex-gap-closure-and-dsh-reentry.md
docs/architecture-exploration/clarifications/0003-accept-bounded-unsupported-codex-risk.md
docs/architecture-exploration/clarifications/0004-minimal-validation-and-design-first.md
docs/architecture-exploration/clarifications/0005-dsh-first-model-routing-and-plugin-admission.md
```

### Frozen-design control records — 4 `A` paths

Destination is absent for every path. Reason: freeze, recovery, and review control records describe the source line and do not belong in the active development baseline.

```text
docs/design-doc/FREEZE-BASELINE.md
docs/design-doc/README.md
docs/design-doc/RECOVERY-OBJECT-DISPOSITIONS.md
docs/design-doc/REVIEW.md
```

### Archive additions and renames — 10 paths

These five `A` destinations remain absent because Git history plus this manifest is sufficient; no archive copy is needed:

```text
docs/archive/README.md
docs/archive/agent-guidance-baseline-2026-08-25/HANDOFF-before-compaction.md
docs/archive/agent-guidance-baseline-2026-08-25/INDEX.md
docs/archive/agent-guidance-baseline-2026-08-25/PROGRESS-before-compaction.md
docs/archive/agent-guidance-baseline-2026-08-25/migration-workflow-before-compaction.md
```

These five `R` destinations remain absent, and the paired base-owned originals remain byte-identical to `dev@6b827325`:

```text
handoff20260817/KICKOFF-PROMPT.md -> docs/archive/agent-guidance-baseline-2026-08-25/handoff20260817/KICKOFF-PROMPT.md
handoff20260817/PROJECT-OVERVIEW.md -> docs/archive/agent-guidance-baseline-2026-08-25/handoff20260817/PROJECT-OVERVIEW.md
handoff20260817/SESSION-HANDOFF.md -> docs/archive/agent-guidance-baseline-2026-08-25/handoff20260817/SESSION-HANDOFF.md
handoff20260817/STATE-RECONSTRUCTION.md -> docs/archive/agent-guidance-baseline-2026-08-25/handoff20260817/STATE-RECONSTRUCTION.md
handoff20260817/raw-conversation.md -> docs/archive/agent-guidance-baseline-2026-08-25/handoff20260817/raw-conversation.md
```

### Additional non-current paths — 14 paths

These four `A` paths remain absent:

```text
docs/architecture-v2/A1-EVIDENCE-CROSSWALK.md
docs/architecture-v2/A1-PRODUCT-CONSISTENCY.md
kick-in/36-phase-0-exit-review.md
kick-in/37-v1-platform-freeze-handoff.md
```

Reason: the A1 proof/crosswalk artifacts and phase/freeze handoffs are non-current control history, not implementation authority.

These ten `M` paths retain their exact fixed-base `dev@6b827325` blobs and do not appear in the branch diff:

```text
kick-in/11-cross-corpus-editorial-learning.md
kick-in/12-series-work.md
kick-in/13-learning-audit-and-eligibility.md
kick-in/17-source-generation-grounding-boundary.md
kick-in/18-manuscript-revision-and-recovery-boundary.md
kick-in/19-proposal-approval-effect-replay-boundary.md
kick-in/20-deliverable-workflow-and-artifacts.md
kick-in/21-bounded-plan-task-interaction.md
kick-in/22-task-skill-capability-trust-provider-boundary.md
kick-in/23-linked-task-and-harness-ledgers.md
```

Reason: their fixed-base forms remain current root-owned product/domain decision evidence; excluding the `design-doc` modifications does not authorize deleting or replacing base-owned policy/history documents.

## Additional fixed-base normalization — 3 destinations

| Destination | Source | Disposition | Reason |
| --- | --- | --- | --- |
| `CONTEXT-MAP.md` | `dev@6b827325:CONTEXT-MAP.md` plus accepted V2 routes | Normalize active context/spec routing and make the separate Provider Processing/External Export policy prerequisite explicit | The root context map must route current owners and must not imply provider/export authority |
| `docs/adr/0025-windowed-editing-over-a-paging-manuscript-store.md` | `dev@6b827325:docs/adr/0025-windowed-editing-over-a-paging-manuscript-store.md` plus accepted V2 supersession | Retain scale/windowing behavior while removing separate performance/sample-manuscript/editing-sufficiency proof gates | Product behavior remains binding inside applicable complete provider-free journeys |
| `docs/development/design-baseline-allowlist.md` | Issue #20 Change Brief and exact Git fixed points | Create this versioned source/disposition record | The 182-path decision and 107-destination result must remain human-reviewable and machine-checkable |

## Accepted-path normalization record

The accepted source files intentionally differ from their frozen blobs only in these bounded semantic categories:

1. **Development-line governance:** preserve Issue #18's `dev` integration target, protected `main` promotion line, Commander-only integration/external actions, and frozen-source-only `design-doc` role across `AGENTS.md`, Git/design/dispatch runbooks, `HANDOFF.md`, and `PROGRESS.md`.
2. **Authority promotion and routing:** mark the V2 architecture/UI packages as the accepted `dev` baseline; promote the two architecture ADRs to root 0041/0042; absorb local glossary/Execution semantics into root owners; remove active routes into excluded trees.
3. **Current verification boundary:** retain product behavior but supersede Windows-only, two-workflow, request-fingerprint, replay/package/performance/editor-sufficiency, private-sample, formal-review, and other separate proof programmes with the one logical provider-free complete-journey E2E boundary on Windows and macOS.
4. **Current implementation route:** replace “UI not started” and frozen-candidate handoffs with the accepted V2 UI/UX baseline and replace the old read-only grounded-Q&A first tracer with the bounded provider-free J-01 new-Book happy path, explicitly not complete J-01.
5. **Toolchain precision:** retain the accepted Electron/isolated-renderer/separate-Node-service/ProseMirror topology while leaving the exact Electron-bundled Node, Supported Development Host matrix, and single package-manager version to the separately authorized implementation plan.
6. **Privacy and authority:** use public-synthetic repository evidence only; do not turn real/private manuscripts into fixtures or proof inputs; keep Provider Processing, External Export, Public Release, and `main` promotion separately authorized.
7. **Mutable registry evidence:** retain the exact `0.1.0-rc.6` Harness subset baseline while recording the 2026-08-25 npm dist-tag drift in the accepted risk/ADR/runbook paths; mutable `latest`/`next` values never replace exact pins or provenance.

### Source-blob equality after normalization

Of the 100 direct-copy paths, 29 remain byte-identical to their frozen-source blobs and 71 intentionally differ after source restore and semantic review. The 71 normalized direct paths are exactly:

```text
docs/architecture-v2/README.md
docs/architecture-v2/ARCHITECTURE.md
docs/architecture-v2/ASSUMPTIONS.md
docs/architecture-v2/DECISION-QUEUE.md
docs/architecture-v2/HARNESS-INTEGRATION.md
docs/architecture-v2/MIGRATION.md
docs/ui-ux-v2/CONTEXT.md
docs/ui-ux-v2/DECISION-QUEUE.md
docs/ui-ux-v2/GLOSSARY.md
docs/ui-ux-v2/HANDOFF.md
docs/ui-ux-v2/MISSING-DESIGN-DECISION-MAP.md
docs/ui-ux-v2/README.md
docs/ui-ux-v2/adr/0001-user-approved-default-execution-rules.md
docs/ui-ux-v2/adr/0002-append-only-run-rewind.md
docs/ui-ux-v2/adr/0003-reverse-committed-apply-with-a-new-effect.md
docs/ui-ux-v2/adr/0004-use-tiered-progressive-evidence-assurance.md
docs/ui-ux-v2/adr/0005-project-signoff-as-a-user-facing-milestone-version.md
docs/ui-ux-v2/adr/0006-use-purpose-specific-document-representations.md
docs/ui-ux-v2/adr/0007-use-publication-version-as-public-release-permission-projection.md
docs/ui-ux-v2/adr/0008-authorize-exact-runs-for-deferred-connectivity-start.md
docs/ui-ux-v2/adr/0009-use-explicit-book-first-learning-eligibility.md
docs/ui-ux-v2/adr/0010-transfer-one-editable-manuscript-surface-between-windows.md
docs/ui-ux-v2/adr/0011-use-proposal-change-items-and-explicit-atomic-groups.md
docs/ui-ux-v2/adr/0012-extract-reusable-structure-without-instance-authority.md
docs/ui-ux-v2/adr/0013-use-latest-eligible-new-version-and-preserve-historical-pins.md
docs/ui-ux-v2/adr/0014-wait-by-default-and-stream-only-interactive-dialogue.md
docs/ui-ux-v2/information-architecture.md
docs/ui-ux-v2/interaction-spec.md
docs/ui-ux-v2/journeys.md
docs/ui-ux-v2/migration-from-v1.md
docs/ui-ux-v2/requirements.md
docs/ui-ux-v2/visual-direction.md
docs/adr/0012-exclude-legacy-production-data-migration.md
docs/adr/0014-verify-on-one-windows-gate.md
docs/adr/0017-full-engine-narrow-tool-surface.md
docs/adr/0020-consume-pinned-harness-package-subset.md
docs/adr/0021-single-execution-authority.md
docs/adr/0024-electron-shell-with-isolated-ai7-service.md
docs/adr/0027-concentrate-ci-on-e2e-functionality.md
AGENTS.md
GLOSSARY.md
docs/domain/editorial/CONTEXT.md
docs/domain/execution/CONTEXT.md
docs/agents/README.md
docs/agents/ci-test-boundaries.md
docs/agents/design-authority.md
docs/agents/git-conventions.md
docs/agents/multi-session-design-workflow.md
docs/agents/project-constraints.md
docs/agents/source-checkout-buildability.md
kick-in/00-charter.md
kick-in/02-target-architecture.md
kick-in/03-keep-adapt-drop.md
kick-in/04-migration-workflow.md
kick-in/05-decision-map.md
kick-in/06-risk-register.md
kick-in/08-source-document-inheritance.md
kick-in/15-harness-agent-behavior.md
kick-in/16-policy-documents-and-feedback-ux-handoff.md
kick-in/25-standalone-word-surface-boundary.md
kick-in/26-tiered-verification-and-mock-provider-evidence.md
kick-in/27-repository-development-dispatch.md
kick-in/28-harness-capability-and-authority-boundary.md
kick-in/29-editorial-quality-metrics.md
kick-in/30-upstream-consumption-and-upgrade-contract.md
kick-in/31-single-execution-authority.md
kick-in/33-standalone-shell-and-editor-topology.md
kick-in/34-first-tracer-slice.md
kick-in/35-windows-macos-product-platform.md
kick-in/README.md
kick-in/decisions/README.md
```

The four promoted source paths intentionally have no byte-identical same-path destination: their semantics are merged into the root glossary/context owners or renumbered into root ADR 0041/0042. `HANDOFF.md` and `PROGRESS.md` are intentional current-state rewrites. `CONTEXT-MAP.md`, root ADR 0025, and this manifest are the three fixed-base normalization destinations. These are all accepted-path source-normalization deviations; no other source path is admitted.

No Provider Processing Policy or External Export Policy is created here. The existing factual-verification and learning-eligibility Policy Documents remain root authorities; the two missing policy baselines are the next separately bounded Issue. No product code, dependency manifest, lockfile, workflow, prototype/Figma artifact, provider call, export implementation, release, tag, publication, or `main` change is admitted by this manifest.
