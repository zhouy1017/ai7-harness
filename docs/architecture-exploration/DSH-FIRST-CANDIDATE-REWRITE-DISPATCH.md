# DSH-first V2 candidate rewrite dispatch

Status: **authorized bounded Worker task**

Prepared: **2026-08-24**

## Binding and ownership

- Repository role / task class: **Worker / T3 architecture-document rewrite**.
- Required first attempt: **Claude Code / `claude-opus-5` / high**.
- Same-class fallback after a fresh observed Claude unavailability or quota-exhaustion result only: **GPT-5.6 Sol / `xhigh`**.
- Candidate branch / worktree: `docs/4-v2-architecture-candidate` / `C:\Users\Chooo\.codex\worktrees\1649\ai7-harness`.
- Exact starting head: `38f47ea762ff93275b5a5474caae7603792c0544`; the worktree and index must be clean before writing.
- Exactly one Worker writes this branch. The Worker never merges, pushes, publishes, searches GitHub, downloads a plugin, installs a dependency, or takes another external action.

## Sole decision input

Consume only [Clarification 0005](./clarifications/0005-dsh-first-model-routing-and-plugin-admission.md) from exact Commander commit `5693a5f444f0fb0daaa630444acc18932b0df391` for the new decisions. From the candidate worktree, read it with:

```powershell
git show 5693a5f444f0fb0daaa630444acc18932b0df391:docs/architecture-exploration/clarifications/0005-dsh-first-model-routing-and-plugin-admission.md
```

Do not consume the Commander/user transcript, another task transcript, or moving control-branch files. Candidate files and their already-cited canonical sources may be read to preserve accepted AI7 constraints and document coherence.

## Write boundary

The Worker may change only:

- `PROGRESS.md`;
- `docs/architecture-v2/README.md`;
- `docs/architecture-v2/ARCHITECTURE.md`;
- `docs/architecture-v2/CODEX-INTEGRATION.md`, which should be replaced by `docs/architecture-v2/HARNESS-INTEGRATION.md`;
- `docs/architecture-v2/MIGRATION.md`;
- `docs/architecture-v2/ASSUMPTIONS.md`;
- `docs/architecture-v2/DECISION-QUEUE.md`;
- `docs/architecture-v2/GLOSSARY.md`;
- `docs/architecture-v2/domain/execution/CONTEXT.md`;
- `docs/architecture-v2/A1-PRODUCT-CONSISTENCY.md`, only where its two current Codex-specific references must become vendor-correct and link to the renamed integration file;
- `docs/architecture-v2/adr/0001-codex-first-ai7-owned-architecture.md`, which should be replaced by `docs/architecture-v2/adr/0001-dsh-first-deepseek-primary-architecture.md`;
- a new `docs/architecture-v2/adr/0002-admit-and-pin-third-party-dsh-plugins.md`.

Do not change `A1-EVIDENCE-CROSSWALK.md`, canonical root architecture records, control documents, source code, dependencies, tests, workflows, or any other path.

## Required end state

1. **One loop:** DeepSeek Harness is the sole production Primary Agent Harness. AI7 schedules and owns business/domain/authority state; DSH owns the generic technical agent loop. No AI7 second loop, Codex runtime, automatic harness fallback, or dual technical authority remains.
2. **Provider boundary:** DeepSeek is primary but not exclusive. Every configured model—including an optional alternative frontier provider—runs through the same DSH loop and the AI7 Provider Resolution Plan, Plan Envelope, credential, scope, budget, and egress boundaries.
3. **Model defaults:** preserve the exact four accepted rows from Clarification 0005: V4 Flash Fast Interaction, V4 Pro High Main Editorial, V4 Pro Max Difficult Escalation, and Frontier Model Role defaulting to V4 Pro Max while permitting explicit alternative configuration. No model becomes factual authority.
4. **Codex boundary:** Codex remains only the Codex Interaction Model Reference and engineering reference. Preserve Electron/ProseMirror and AI7-owned UI, service, domain capabilities, Effects, ledgers, provider egress, and interaction semantics. Remove present-tense claims that Codex is a shipped dependency, process, technical Session owner, adapter target, provider invoker, fallback, or source-build baseline.
5. **DSH composition:** retain the canonical full-engine/narrow-tool-surface, selected exact-package subset, no CLI aggregate, AI7 scheduling, AI7-owned capability facade, dual grants, two ledgers, and no generic shell/filesystem/network tool rules. Missing product behavior may be implemented cheaply through AI7-owned adapters, capabilities, or DSH extension seams; a mature third-party DSH plugin is optional only under the new policy.
6. **Third-party plugins:** record need-based GitHub discovery, open-source/license compatibility, at least six stars, at least four plugin-related non-merge commits, newest qualifying commit within the prior 30 calendar days, standalone/default-branch versus monorepo/directory-or-manifest counting, dated Plugin Admission Snapshot, immutable Local Plugin Pin, exact version/commit/digest, AI7-controlled local store plus committed manifest/lockfile, no range/branch/mutable-tag/`latest`, no automatic update, explicit one-version-at-a-time upgrade, and retained rollback.
7. **Authority:** classify a third-party plugin as a code-bearing Capability Implementation or composition dependency, never a Task Skill, provider, credential, policy, grant, or brand. Capability expansion never self-activates.
8. **Migration/development plan:** stop describing migration as removal of DSH. Preserve and reshape the DSH baseline, add the accepted provider roles, admit plugins only when needed, and keep Codex reference material non-runtime. No implementation is authorized.
9. **Assumptions and decisions:** replace Codex-runtime assumptions and future Codex/DeepSeek reversal questions with DSH-specific bounded assumptions and only genuine future owner triggers. Do not create capability audits, proof ladders, source probes, plugin evaluations, or formal review gates.
10. **ADR/terms:** replace candidate ADR 0001 with the DSH-first decision and add separate ADR 0002 for plugin admission/versioning. Define and index Codex Interaction Model Reference, the four Model Roles, Plugin Admission Snapshot, Local Plugin Pin, and Third-Party DSH Plugin without implementation detail in `CONTEXT.md`.

Historical A1 evidence and control records may still say Codex-first when clearly labeled historical; active architecture, navigation, assumptions, migration direction, decision queue, ADRs, context, and glossary must not contradict Clarification 0005.

## Deliberate omissions

- No web/GitHub search, source audit, plugin selection, package inspection, dependency installation, prototype, implementation, test, E2E execution, capability score, artifact probe, formal review, or proof task.
- Do not add a plugin-specific CI gate. The standing future CI surface remains Windows E2E complete journeys plus regressions for observed bugs.
- Do not edit canonical `main`, merge, push, open a pull request, or create implementation issues.

## Return contract

1. Update candidate `PROGRESS.md` with affected paths, next action, key decisions, requested/actual binding if known, and a one-sentence Resume Prompt.
2. Commit one atomic documentation unit with a lowercase Conventional Commit subject under 72 characters and the Claude model co-authorship trailer.
3. Return the final commit SHA, exact changed/deleted/added paths, a concise decision summary, and any unresolved contradiction. Do not request or perform an independent review.
