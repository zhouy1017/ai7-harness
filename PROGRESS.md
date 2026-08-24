# Progress

## What's done

- Confirmed the candidate worktree clean on `docs/4-v2-architecture-candidate` at the required start `38f47ea762ff93275b5a5474caae7603792c0544`.
- Consumed only Clarification 0005 (`docs/architecture-exploration/clarifications/0005-dsh-first-model-routing-and-plugin-admission.md`) from exact Commander commit `5693a5f444f0fb0daaa630444acc18932b0df391` as the new decision input, per the T3 dispatch at control commit `80f2bf667f4671b776c6e159e0014c07d728e07c`.
- Rewrote the V2 candidate from Codex-first to DSH-first across `docs/architecture-v2/{README,ARCHITECTURE,MIGRATION,ASSUMPTIONS,DECISION-QUEUE,GLOSSARY}.md` and `docs/architecture-v2/domain/execution/CONTEXT.md`.
- Replaced `docs/architecture-v2/CODEX-INTEGRATION.md` with `docs/architecture-v2/HARNESS-INTEGRATION.md`: the same ledger, capability, Effect, provider, egress, and lifecycle contracts restated as an in-service DSH composition boundary rather than a Codex protocol adapter, plus package/plugin pinning rules.
- Replaced `docs/architecture-v2/adr/0001-codex-first-ai7-owned-architecture.md` with `docs/architecture-v2/adr/0001-dsh-first-deepseek-primary-architecture.md`, and added `docs/architecture-v2/adr/0002-admit-and-pin-third-party-dsh-plugins.md`.
- Made the two Codex-specific references in `docs/architecture-v2/A1-PRODUCT-CONSISTENCY.md` vendor-correct (I-02) and repointed its integration link to `HARNESS-INTEGRATION.md`.
- Defined and indexed Codex Interaction Model Reference, Fast Interaction Role, Main Editorial Role, Difficult Escalation Role, Frontier Model Role, Third-Party DSH Plugin, Plugin Admission Snapshot, and Local Plugin Pin; retired Development Reference Framework, Codex Secondary Development, and Codex Desktop-like Interaction Reference.
- Removed the last superseded six-part DSH pin-bump verification programme from `docs/architecture-v2/HARNESS-INTEGRATION.md` and `docs/architecture-v2/adr/0001-dsh-first-deepseek-primary-architecture.md`; pin bumps now use only applicable Windows E2E journeys and observed-bug regressions as standing verification.
- Left `docs/architecture-v2/A1-EVIDENCE-CROSSWALK.md`, canonical root architecture records, control documents, source, dependencies, tests, and workflows untouched.
- Affected paths are exactly: `PROGRESS.md`; `docs/architecture-v2/{README,ARCHITECTURE,HARNESS-INTEGRATION,MIGRATION,ASSUMPTIONS,DECISION-QUEUE,GLOSSARY,A1-PRODUCT-CONSISTENCY}.md`; `docs/architecture-v2/domain/execution/CONTEXT.md`; added `docs/architecture-v2/adr/{0001-dsh-first-deepseek-primary-architecture,0002-admit-and-pin-third-party-dsh-plugins}.md`; deleted `docs/architecture-v2/CODEX-INTEGRATION.md` and `docs/architecture-v2/adr/0001-codex-first-ai7-owned-architecture.md`.
- Requested routing: Claude Code / `claude-opus-5` / high. Actual routing: Claude wrote most of the bounded unit at a reported cost of `$4.3264755`, then a fresh HTTP 429 stopped the session before staging or commit; GPT-5.6 Sol / `xhigh` completed the same-class fallback, removed the remaining contradiction, and prepared the atomic commit.

## What's next

- Present the DSH-first candidate to the owner through the Commander. No independent review was requested or performed.
- After explicit owner acceptance, the Commander may integrate the canonical context, glossary, ADR, standing-rule, and design-note dispositions. Product implementation, package selection, GitHub search, and plugin admission all still require separate authorization.

## Key decisions made

- DeepSeek Harness is the sole production Primary Agent Harness, composed in-process inside the AI7 Node service behind the AI7-owned `PrimaryAgentHarness` boundary. No AI7 second loop, Codex runtime, or automatic harness fallback exists.
- DeepSeek is primary but not exclusive: every configured model, including an optional alternative frontier provider, runs through the same loop, Provider Resolution Plan, Plan Envelope, credential brokering, scope, budget, and egress gate. Provider fallback exists; harness fallback does not.
- The four accepted Model Role defaults are recorded exactly: V4 Flash / Fast Interaction, V4 Pro High / Main Editorial, V4 Pro Max / Difficult Escalation, and V4 Pro Max / Frontier with explicit alternative configuration permitted. No model becomes factual authority.
- Codex is reduced to the non-runtime Codex Interaction Model Reference; every present-tense claim of Codex as dependency, process, session owner, adapter target, provider invoker, fallback, or source-build baseline is removed.
- The canonical DSH composition rules are retained: full engine behind a narrow tool surface, exactly pinned package subset with a committed lockfile, no `@deepseek-ai/dsh` CLI aggregate, no `^`/`~`/branch/mutable-tag/`latest`, AI7-owned scheduling without Harness `schedule`/`jobs`/workflow packages, the AI7 Capability Facade, dual grant enforcement, two ledgers, and no generic shell/filesystem/network tool.
- Missing behavior is implemented cheaply in order: AI7-owned adapter or capability implementation, then a documented DSH extension seam, then — only for an identified need — an admitted third-party plugin. Forking the generic loop is an owner decision, not an implementation choice.
- ADR 0002 records need-based GitHub discovery, license compatibility, at least six stars, at least four plugin-related non-merge commits, a newest qualifying commit within the prior 30 calendar days, standalone-default-branch versus monorepo directory/manifest counting, a dated Plugin Admission Snapshot, an immutable Local Plugin Pin with exact version/commit/digest, an AI7-controlled local store plus committed manifest and lockfile, no automatic update, explicit one-version-at-a-time upgrade, and retained rollback.
- A third-party plugin is a code-bearing Capability Implementation or composition dependency, never a Task Skill, provider, credential, policy, grant, or brand; capability expansion never self-activates.
- Migration preserves and reshapes the DSH baseline instead of removing it; ADR 0020 is retained and confirmed rather than superseded, and ADRs 0011/0017/0021/0024 are unchanged in substance.
- The only standing engineering CI surface remains Windows E2E functional completeness and observed-bug regression. No capability audit, proof ladder, source probe, plugin evaluation, plugin CI gate, or formal review gate was created.
- The decision queue now holds only genuine future owner triggers: generic-loop fork, Primary Agent Harness replacement, plugin admission exception, platform/surface expansion, product-authority expansion, and code signing.

Resume Prompt: Present the DSH-first, DeepSeek-primary V2 candidate to the owner for acceptance; keep Codex reference-only and begin no canonical integration, GitHub search, package pinning, plugin admission, or implementation without separate authority.
