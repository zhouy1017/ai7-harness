# Clarification 0005 — DSH-first model routing and plugin admission

Status: **owner accepted for the V2 candidate; canonical integration and implementation remain pending**

Recorded: **2026-08-24**

Decision owner: **AI7 owner**

Record owner: **Repository Development Commander**

## Questions resolved

1. Which framework owns AI7's one production generic agent loop after DeepSeek V4 became the primary model family?
2. How are V4 Flash, V4 Pro High, V4 Pro Max, and an optional alternative frontier model assigned to provider-neutral Model Roles?
3. May development discover and use third-party open-source DSH plugins from GitHub, and what admission and version-management rules apply?
4. Does “more than three updates” mean GitHub Releases or plugin-related commits?

## Exact owner decisions

- Accept one DeepSeek Harness production loop, with DeepSeek as the primary but not exclusive model provider and Codex retained as the Interaction Model and engineering reference.
- Accept the recommended Flash/Pro/frontier role split.
- Configure the Frontier Model Role to DeepSeek V4 Pro Max by default.
- Permit need-based use of third-party open-source DSH plugins from GitHub when they have more than five stars, more than three updates, and a latest update no earlier than 30 days before the development selection date; manage plugin versions locally to prevent upstream updates from destabilizing AI7.
- Accept the recommended definition of an update as a plugin-related non-merge commit rather than a GitHub Release.

## Accepted production topology

1. **DeepSeek Harness is the one Primary Agent Harness.** It owns generic model conversation, context assembly, turn progression, model invocation, technical tool dispatch, streamed technical events, compaction, subagent mechanics where used, and in-turn recovery. AI7 retains Task, workflow, manuscript, source, policy, authority, Effect, provider-egress, budget, and business-ledger ownership.
2. **DeepSeek is primary, not exclusive.** Every model binding still enters through the same DSH loop and AI7-owned Provider Resolution Plan. An alternative provider never creates a second Harness, silent runtime fallback, or separate authority path.
3. **Codex is not a production runtime.** Codex remains the Codex Interaction Model Reference and an engineering reference for interaction patterns, host/runtime boundaries, extension design, and secondary-development ideas. AI7 copies no Codex Desktop branding, GUI source, layout, assets, coding presets, or coding-agent purpose.
4. **Electron and ProseMirror remain AI7-owned.** Changing the Primary Agent Harness does not replace the desktop shell, renderer, editor, domain services, or AI7 service process.
5. Clarifications 0001–0003 and the Codex-first clauses of Clarification 0004 remain historical evidence only. Clarification 0004's minimal-validation decision remains active.

## Accepted Model Role defaults

| Model Role | Default binding | Intended work |
| --- | --- | --- |
| Fast Interaction Role | DeepSeek V4 Flash | Quick interaction, low-risk candidate generation, and latency-sensitive assistance. |
| Main Editorial Role | DeepSeek V4 Pro High | Chinese long-form writing, editorial proposals, cross-source synthesis, factual research, and complex instruction following. |
| Difficult Escalation Role | DeepSeek V4 Pro Max | Difficult or unusually consequential work that exceeds the main role's expected capability. |
| Frontier Model Role | DeepSeek V4 Pro Max | Default frontier binding for challenge or explicitly authorized high-consequence work; the user may explicitly configure another eligible provider/model without changing the one-loop topology. |

These are default bindings, not factual authority. Model output remains a proposal or research lead; Factual Verification still requires admissible evidence, provenance, and exact fetch where applicable. Task Skills declare roles rather than provider names, endpoints, or credentials.

## Third-party DSH plugin admission

Development may search GitHub for a third-party DSH plugin only when an identified AI7 capability or composition need justifies it. Discovery does not authorize installation, activation, capability expansion, or product network access.

A candidate is admissible only when an admission snapshot taken on the development selection date records all of the following:

1. The plugin is open source and its license and notice obligations permit the intended AI7 use and distribution.
2. The GitHub repository has **more than five stars**, operationally **at least six stars**, at snapshot time.
3. The plugin has **more than three qualifying updates**, operationally **at least four qualifying update commits** in total.
4. A qualifying update is a plugin-related **non-merge commit**. For a standalone plugin repository, count relevant commits on the default branch. For a monorepo, count only commits affecting the plugin directory or its manifest.
5. The newest qualifying update commit is no earlier than **30 calendar days before the admission snapshot date**.

Repository-wide activity unrelated to the plugin and GitHub Release count do not satisfy the update requirement. The star and activity measurements are admission facts, not continuing runtime inputs. Selecting a different upstream version requires a new admission snapshot.

## Local version management

Every admitted plugin version receives an immutable Local Plugin Pin containing at least:

- stable plugin identity and upstream repository URL;
- selected package version when one exists;
- exact upstream commit SHA;
- exact source or package artifact digest/integrity value;
- admission-snapshot date and the star/update facts used for admission;
- license, provenance, dependency, and third-party-notice references.

AI7 development and production builds resolve only the admitted immutable artifact through an AI7-controlled local plugin store plus the committed plugin manifest and dependency lockfile. Branch names, mutable tags, version ranges, and `latest` are forbidden. AI7 performs no automatic upstream plugin update. An upgrade is an explicit, one-version-at-a-time development change that creates a new admission snapshot and Local Plugin Pin; the previous admitted pin remains available for rollback.

A third-party DSH plugin is a code-bearing Capability Implementation or composition dependency. It is never a Task Skill, Policy Document, Model Provider, credential, Authority Ceiling, Effective Capability Grant, or user-facing brand. Activation still requires the normal pinned deployment composition and dual capability enforcement. Applicable user-visible behavior is covered only by the standing logical E2E Functional Gate on Windows and macOS and the observed-bug regression policy; this decision creates no separate plugin or platform validation gate.

## Resolved V2 terms

**Codex Interaction Model Reference** (`Codex 交互模型参考`):
The non-runtime interaction and engineering reference from which AI7 may reinterpret task capture, context, progress, interruption, clarification, history, review, host boundaries, and extension ideas without adopting Codex branding, GUI code, coding defaults, or execution authority.

**Plugin Admission Snapshot** (`插件准入快照`):
The dated, immutable record of a third-party DSH plugin's repository identity, open-source license, GitHub stars, qualifying update commits, latest qualifying update date, selected version/commit, artifact identity, and notice obligations at the moment AI7 selects that version.

**Local Plugin Pin** (`本地插件版本锁定`):
The immutable AI7-controlled binding from one admitted plugin identity and version to its exact upstream commit, local artifact digest, manifest, lockfile entry, provenance, and rollback predecessor. It prevents upstream change from silently changing a build or installed composition.

## ADR qualification

Assigning the one production loop, model-role defaults, and provider boundary is hard to reverse and supersedes a coherent Codex-first candidate, so it requires a replacement candidate harness ADR. Third-party plugin admission and immutable local versioning address a separate dependency-governance trade-off and should receive their own candidate ADR rather than being hidden inside the harness decision.

## Canonical-integration and writer boundary

This record is an exact noncanonical owner input. It authorizes candidate design writing only. It authorizes no GitHub search, plugin download or installation, dependency change, source copy, prototype, product implementation, implementation issue decomposition, pull request, push, merge, release, or publication.

The Issue #4 Worker must consume this file from the exact Commander commit supplied in its brief, not from the Commander/user transcript. It may edit only `docs/4-v2-architecture-candidate` and must rewrite the coherent candidate around DSH-first topology, the accepted model routing, Codex's residual reference role, and the plugin admission/versioning policy. No formal review, source audit, capability scoring, prototype, or non-E2E validation follows.
