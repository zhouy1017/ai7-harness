# AI7 V1 UI/UX freeze handoff

Status: **V1 freeze candidate/reference; exact-head review determines freeze eligibility; not canonical product or future-architecture authority**

## Freeze identity

- Base commit: `c8cbe26`
- Branch: `docs/2-ai7-ui-ux`
- Work item: GitHub Issue #2, `Design the complete AI7 V1 UI/UX`
- Candidate-freeze reason: preserve the already-materialized V1 design as a reviewable reference while the Commander resolves architecture across active branches.

No decision from another active branch has been imported or promoted here. Current domain records still outrank this package, and the Commander decides whether any part is later adopted, revised, or retired.

## Captured artifacts

| Artifact | Candidate/reference status |
| --- | --- |
| [Package map](./README.md), [requirements](./requirements.md), and [information architecture](./information-architecture.md) | Candidate V1 scope, 79 numbered requirements, Book-first/editor-first shell map |
| [Interaction specification](./interaction-spec.md) | Candidate view/state contracts and fourteen acceptance journeys (`J-01`–`J-14`) |
| [Visual system](./visual-system.md) | Candidate light-first Windows/CJK tokens, components, state semantics, accessibility, and microcopy |
| [Usability test plan](./usability-test-plan.md) | Planned owner walkthrough followed by 3–5 professional editors; no sessions run |
| [Traceability](./traceability.md) | 79/79 requirement mapping with implementation, spike, research, exclusion, and conflict flags |
| [HTML prototype](./prototype/README.md) | Throwaway synthetic A/B/C candidate shells and fact-verification-to-correction journey; no shell selected; not production code |
| [Figma handoff](./figma-handoff.md) | Six editable raw reference frames; no native component library or validated Figma prototype |

## Verification evidence for the freeze candidate

- `node --check docs/ui-ux/prototype/app.js` passed.
- Local Markdown links resolved across all 11 Markdown files in the candidate/reference package, including this handoff.
- Every requirement ID in `requirements.md` appeared exactly once in the traceability matrix: 79 requirements, 79 rows, no missing, extra, or duplicate ID.
- Browser checks covered all three variants at 1440×900, the overlay layout at 800×800, keyboard variant switching, semantic `del`/`ins` proposal markup, r7→r8 revision progression, and the applied Effect Receipt state.
- The final browser console check reported 0 errors, 0 warnings, and 0 total messages.
- Post-review browser checks confirmed the exact Plan Preview boundaries, `证据反驳` state, accessible pressed states, separate Proposal Decision/Effect Approval/Effect Receipt records, and the 800×800 overlay after correction.
- QA scratch under `.playwright-cli/` was moved out of the worktree and is not part of the branch.
- All fixtures are explicitly synthetic. No real manuscript, manuscript-derived artifact, credential, or private sample Book was added.
- All Standards and Spec review cycles disclosed `same-provider review — independence reduced`.
- Exact-head review of `f877816d9319d546417bfd34cc90676c8b4e7175` failed with seven bounded findings.
- Corrective head `67fc3b261b5ce2982b69e2ec42ac54bbd6d7f5ef` addressed those seven, then failed complete review with two Standards findings and one Spec finding.
- Amended head `6bdce59c490939d78076c1d9c0b014bfc34a28ee` addressed those three; its Spec review passed with zero findings and its Standards review failed with six hard findings.
- This local-history consolidation corrects only those six and replaces obsolete branch metadata with one candidate commit; it does not claim a final review verdict.
- Final freeze eligibility lives only in the Commander's exact-head review record for the consolidated immutable head, not in this handoff.

These checks establish artifact integrity only. They do not prove production persistence, performance, import/export fidelity, provider behavior, sandbox enforcement, ProseMirror suitability, accessibility conformance, or usability.

## Reusable reference material

The most portable design work is semantic rather than geometric:

- Book-first navigation with a distinct global attention/work queue;
- an editor-first central object, one contextual inspector, and a selection-aware task entry;
- exact Book, deliverable, revision, selection, source scope, and outbound-data context before authorization;
- separate `引证完整性`, `陈述支持`, and `事实核验` states;
- separate Run Authorization, Proposal Decision, Review Decision, Effect Approval, Effect Receipt, signoff, and Public Release Permission;
- proposal-first mutation, exact-pin drift/conflict handling, and decision-versus-outcome-proof language;
- durable 修订日志, 稿件修订检查点, recovered work, and Recovery Snapshot distinctions;
- restart-safe clarification, pause/cancel, Resume/Retry/Redo/Replay, partial outcome, and ambiguous external Effect states;
- Chinese IME, keyboard, high-contrast, evidence-return-focus, and long-manuscript windowing journeys; and
- owner walkthrough followed by 3–5 professional-editor sessions with zero critical semantic misunderstanding as the gate.

Reuse these as questions and test hypotheses. Do not assume their present screen placement, platform mechanism, or visual treatment survives architecture migration.

## Assumptions and likely V2 incompatibilities

This branch was derived from the V1 base's Windows-only assumptions: Electron, a three-process local topology, ProseMirror over windowed manuscript projections, Windows file pickers and data locations, zip portable plus NSIS channels, Windows scaling/high contrast/Narrator, and Simplified Chinese Windows IMEs. Those assumptions materially shape onboarding, navigation density, focus rules, data-location notices, packaging states, accessibility checks, and the prototype viewport matrix.

The platform architecture outside this candidate/reference branch is an explicit dependency, not something this package settles. If an active branch changes target platforms, shell/runtime, renderer/editor, process or IPC boundaries, packaging, data-root behavior, provider surfaces, or Book/workflow authority, the Commander must treat the affected UI/UX as needing re-derivation. In particular:

- cross-platform work cannot inherit Windows paths, NSIS/portable choices, Narrator-only checks, native-dialog behavior, or DPI assumptions unchanged;
- a non-Electron or differently partitioned shell must revalidate background-work isolation, crash/recovery, focus, and progress behavior;
- a different editor/store contract must revalidate windowing, selection pins, whole-manuscript navigation, proposal decoration, and IME composition; and
- a changed domain or authority model must update requirement IDs and traceability before reusing screens.

Two contradictions already visible at the candidate base remain Commander dependencies: earlier editor-facing Policy Document activation conflicts with current developer-only review/visibility rules, and superseded portable-only text conflicts with the later zip-plus-NSIS decision. This package excludes the former UI and follows the latter for V1 without claiming either choice governs another branch.

No exact cross-branch comparison was performed while capturing this candidate. Any additional contradiction with the active architecture branch remains unknown until the Commander compares the branches explicitly.

## Migration cost and open questions

Likely migration cost:

- **Low** for requirement vocabulary, authority distinctions, journey IDs, negative guarantees, and usability gates when the domain model remains stable.
- **Medium** for information architecture, state tables, microcopy, and visual tokens when the product remains a desktop Book/editor workbench but shell mechanics change.
- **High** for the HTML/CSS/JavaScript prototype and imported Figma frames; both are throwaway references, not component implementations.
- **High** for Windows-specific onboarding, packaging, accessibility, IME, and viewport behavior if V2 becomes cross-platform or changes desktop technology.

Open questions for the Commander:

1. Which candidate requirements remain valid after comparison with the active architecture branch?
2. Is Variant A still the shell hypothesis, or should all A/B/C geometry be discarded while retaining semantic journeys?
3. Which Windows-only assumptions remain V1 requirements, and which become platform adapters or V2 exclusions?
4. What shell, editor, store, process, packaging, and data-root decisions supersede the candidate dependencies?
5. How should the Commander dispose of the earlier Policy Document contradiction while preserving the current developer-reviewed, editorially hidden rule?
## Commander promotion boundary

The only next action is exact-head review for the Commander, followed—only if both axes pass—by Commander comparison and an explicit promotion decision. Do not extend A/B/C, add screens, resume Figma or research, or treat this candidate/reference branch as architecture authority.
