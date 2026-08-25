# Progress

## What's done

- Issue #20 normalization is complete on `docs/20-v2-development-baseline` from exact `dev@6b827325ea888e1414f26b3e7f37ee33a7a9fff1`; the frozen provenance source remains exact `design-doc@6895f02d2983865516d267809d8cdda77026f62c`, and `main` remains unchanged at `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9`.
- The exact 182 source-tree paths are closed as 100 direct restores, 4 semantic promotions, 2 current-router rewrites, and 76 exclusions. The resulting branch diff is exactly the required 107 destinations with no missing or extra path. See [`docs/development/design-baseline-allowlist.md`](docs/development/design-baseline-allowlist.md).
- Of the 100 direct paths, 29 remain byte-identical to the frozen source and 71 carry individually recorded development-baseline normalization. Root ADR 0041/0042 own the two promoted architecture decisions; root [`GLOSSARY.md`](GLOSSARY.md) and [`docs/domain/execution/CONTEXT.md`](docs/domain/execution/CONTEXT.md) own the promoted terminology, with no competing package-local owners.
- Exclusion closure is exact: all 61 source-added excluded paths and 5 rename destinations are absent; all 10 source-modified exclusions, 5 paired rename originals, and base-owned `docs/agents/development-lines.md` retain their exact fixed-base blobs and remain outside the branch diff.
- Architecture, V2 UI/UX, context/glossary routing, `HANDOFF.md`, governance, npm exact-pin language, and active links now express the accepted `dev` baseline. Old Windows-only/two-workflow, extra proof, UI-not-started, request-fingerprint, grounded-Q&A-first-tracer, prerequisite-spike, private-sample-proof, and candidate-status claims are either explicitly superseded history or removed from current routes.
- The current authorized tracer is the bounded provider-free J-01 new-Book happy path: fresh checkout → public-synthetic DOCX → Review Before Import → atomic Book / primary Manuscript / initial Manuscript Revision / import records → bounded manuscript window → user-confirmed durable Edit Journal. It is explicitly not complete J-01.
- Final follow-up validation passes: 107 exact destinations; 182 source paths and the 61 A / 5 R / 10 M exclusion split; all 16 fixed-base retained blobs; 29 unchanged and 71 normalized direct-source blobs; 928 relative Markdown links and 7 anchors with zero failures; 42 root ADRs, 14 UI ADRs, 851 V2 requirements, 84 decisions, and 16 journeys with no duplicate identity; 184 unique root glossary entries; one canonical `Local Export Preparation` definition and route; exact `CLAUDE.md`; clean whitespace/conflict-marker checks; and unchanged fixed refs.
- Follow-up advisory review findings are repaired without changing the allowlist. The first repair group routes `Local Export Preparation` only to the root Execution owner, treats `247b7dac...` as frozen provenance rather than current authority, removes candidate/transient phase wording, and aligns the root handoff with the mandatory `AGENTS.md` → repository-state → `PROGRESS.md` entry order. Both originating reviews were same-provider review — independence reduced.
- The second repair group now fixes ADR 0041's plugin route, closes the 42-record root ADR index, excludes Harness `schedule`/`jobs`/workflow packages from the meaning of “full engine,” defines tag syntax without inventing release automation, and distinguishes accepted J-01 design branches from the smaller current tracer authorization. The manifest source-equality record is reconciled to 29 unchanged and 71 normalized direct blobs.
- The required follow-up Spec review found one remaining package-exclusion inconsistency in ADR 0021 and `kick-in/31`; both now state that Harness schedule, jobs, and workflow packages are absent and cannot drive even technical attempts. This repair remains inside paths already counted among the 71 normalized direct blobs.
- Final advisory review is complete: the Standards axis passed; the Spec axis's one finding was repaired and its re-review passed with no scope creep. Both follow-up axes were same-provider review — independence reduced; review remained advisory and created no new gate.

## What's next

- Commander reviews the exact two-commit Issue #20 branch head, creates the authorized pull request, and integrates it into `dev`; the Worker performs no push, PR, merge, release, or other external action.
- After integration, execute the separately scoped minimum Provider Processing and External Export policy-baseline Issue. Then create the implementation-planning Issue and complete Change Brief before implementing the bounded tracer.
- During implementation dependency/provenance planning, refresh the dated dist-tag observation in fixed-base `kick-in/01-source-provenance.md`; it was outside Issue #20's exact structural budget. Current accepted paths already record the 2026-08-25 registry drift and preserve exact `0.1.0-rc.6` as the non-mutable baseline.

## Unresolved matters or blockers

- Issue #20 has no unresolved matter or blocker. All requested follow-up findings are closed inside the existing 107-destination set.
- Concrete Provider Processing and External Export policies, any provider/model or export implementation, and implementation dependency/toolchain selection remain later authorized tasks. Their absence does not block completion of this documentation baseline, but it blocks the corresponding later product work.

## Key decisions made

- Exact path disposition—not merge order, file age, source status, or whole-branch history—controls normalization. No merge or cherry-pick of `design-doc` history occurred.
- Source-added and rename-destination exclusions remain absent; source-modified exclusions and paired old rename paths retain fixed-base blobs. Exclusion never means deleting an already base-owned current document.
- `dev` is the long-lived development integration target, `main` is the separately authorized stable/release-promotion line, and `design-doc` is frozen provenance only. These are repository workflow rules, not AI7 product concepts.
- Provider Processing, External Export, Public Release Permission, and `dev`→`main` promotion remain separate authorities. This documentation unit creates no provider/model call, export implementation, dependency, code, CI workflow, release, tag, publication, or `main` change.
- The accepted Harness subset baseline remains exact `0.1.0-rc.6`; npm dist-tags are mutable discovery evidence and never pin authority. Exact Node, Electron compatibility, package-manager version, and dependency provenance belong to the later implementation plan.
- Product behavior remains binding, but only one complete provider-free E2E journey supplies standing implementation evidence; Harness success, tool results, and Session events never become AI7 Effect Receipts.

## Resume Prompt

Commander: review and integrate the exact two-commit Issue #20 branch head into `dev`, then open the separately scoped Provider Processing / External Export policy-baseline work before implementation planning or tracer code.
