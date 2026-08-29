---
status: accepted
---

# Preserve native DSH artifacts behind AI7 authority sidecars

This ADR records the Owner-approved native-artifact direction for Issue #86. It is repository-current only when read from an exact integrated `dev` commit containing this revision; elsewhere it remains accepted-but-unintegrated. It authorizes no discovery, installation, dependency change, executable admission, Provider call, product implementation, release, or `main` action.

## Decision

AI7 preserves the native identity, manifest, dependency and version lineage of DSH Skills, Plugins, Bundles, Profiles and Agent Presets. A **DSH Skill** is the canonical semantic instruction unit. A DSH Plugin or Bundle may package and distribute Skills, composition and optional code; a Profile or Agent Preset may compose them. AI7 does not retain a second Task Skill manifest/package/runtime hierarchy beside those native carriers.

AI7 attaches a separately versioned, non-destructive authority and compatibility sidecar concept to an exact native artifact revision. The sidecar records source and digest pins, applicable user or Book scope, declared AI7 Capability/data/Provider/credential/Effect requirements, compatibility disposition, audit lineage and rollback relationships. It is not another instruction format, executable artifact, live grant, Run Authorization, Background Analysis Enrollment, Effect Approval or Apply authority. The exact final record name and serialization remain implementation-facing details.

Self-contained presentation, in-memory or artifact-local behavior may remain native to DSH. Any operation that reads or changes AI7 business state, unpublished material, credentials, outbound data or an Effect must cross the AI7 Capability Facade and its exact authority checks. Native identity never weakens that boundary.

## Workflow definition and durable instance seam

DSH-native artifacts own versioned Workflow definitions and technical execution logic. AI7 remains the sole owner of every durable Workflow Instance, Workflow Phase/Gate state, Signoff Record, scheduling decision and deterministic business transition. An AI7-facing Workflow Profile label, if retained, is only a projection or selector over one exact native definition; it is not a parallel executable package or a second workflow authority.

Issue #38 narrows this carrier decision for the built-in Manuscript baseline only: the exact carrier is the read-only declarative native DSH Profile `manuscript-editorial@1.0.0`, whose native identity is derived from its directory basename, with exact raw-carrier digest, explicit empty `dsh.profile.bundles`, and no dependency/script/executable behavior. Its npm manifest metadata remains separately named `@ai7/manuscript-editorial-profile`; that package metadata is not the native Profile identity. AI7 separately pins the projection `ai7.manuscript.editorial.zh-CN@2.0.0`. Every resulting Workflow Instance pins both exact identities and digests while AI7 retains all durable workflow state and transitions.

Issue #88 separately narrows staged admission to exactly one declarative native DSH Profile revision: the sole source carrier is `config/native-artifact-sources/editorial-workspace-profile/package.json`; its native identity/version is `@ai7/editorial-workspace-profile@1.0.0`; and the carrier is exactly the UTF-8, no-BOM, LF-terminated 263-byte `package.json` whose SHA-256 is `ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d`. The source directory, covered by the AI7 root license, contains only that `package.json`: no `cordis.patch.yml`, dependency, Bundle, hook, script, executable, native code or extra file. Acquisition uses one concrete read-only bundled-local-directory adapter for this configured carrier only; it fails closed by verifying the exact regular-file set and digest, rejecting symlinks, path escape, extra files and byte drift, then atomically retaining the pinned bytes under the selected Agent Data Root. Installation first completes in a durable disabled state; a separate explicit action may enable only this exact revision for one exact user-selected Book after showing its exact revision, provenance, compatibility and Authority Ceiling. This is a one-revision allowlist, not a reusable trust tier: it grants no generic catalog-source interface, file-picker import, network fetch, Plugin discovery, dependency installation, update checking, reconciliation, Artifact Update Rule or `latest` movement; changed bytes fail acquisition and any successor revision requires later exact authority. The Authority Ceiling may require only the abstract Main Editorial Role, not the Fast Interaction Role, and grants no AI7 Capability, Capability Grant, readable Book/manuscript/source/data scope, Provider Binding, Provider call, credential, network use, Effect, Background Analysis Enrollment or Apply. Setup, acquisition, installation or enablement creates no Task, Run, Session, per-Run activation, recommendation or manuscript access. Disable or removal leaves AI7 operable and preserves the minimum immutable identity/version/digest/provenance and historical links required to explain prior pins. This narrowing authorizes no artifact implementation, adjacent Issue, Provider authority, executable Plugin admission, external execution, publication, release or `main` action.

This decision still selects no exact carrier mapping for external or user-authored Workflow definitions and does not admit DSH `schedule`, `jobs` or workflow packages into the product subset. Those packages remain excluded; AI7 continues to schedule Runs and own durable editorial workflow state.

## Foreign Skill import

Portable Claude-, Codex- or other Agent-Skill content keeps its core `SKILL.md` and resources where already DSH-readable. Import creates:

1. an immutable **Source Skill Snapshot** preserving exact original files, upstream identity, source format/version and digest;
2. a versioned **Imported Skill Working Revision** with its own local identity and digest, preserving portable content as exactly as possible and minimally mapping only host-specific tool, permission, hook, subagent, path, runtime or packaging semantics; and
3. the separate AI7 sidecar concept describing compatibility and declared authority requirements without granting them.

Every conversion produces a reviewable report that distinguishes preserved, deterministically mapped, review-required and unsupported elements. Unsupported or uncertain behavior remains blocked rather than guessed. Import alone neither installs nor enables the working revision and executes no artifact code.

## Update and rollback

Each upstream change becomes a new immutable Source Skill Snapshot. Reconciliation compares the prior source snapshot, the locally editable current working revision and the new source snapshot, preserving local edits and producing an inert provenance-bearing update candidate.

The executable working revision changes only through explicit adoption or a distinct, revocable **Artifact Update Rule**. Such a rule is limited to one selected trusted source and to imported-Skill changes that are conflict-free, validator-clean, semantically and operationally non-expansive. It does not apply to Policy Documents, core DSH package pins or code-bearing Plugin updates. New scripts, dependencies, tools, network use, Provider/data scope, permissions, host behavior, analysis contracts, schemas, reducers, budgets or schedules are expansive and always return to review.

Automatic checking reads configured-source metadata only and sends no Book content. Adoption appends working-revision and sidecar history. Rollback restores exact artifact revisions only; it never resurrects a revoked grant, Default Execution Rule, Artifact Update Rule, Background Analysis Enrollment or Run authority.

## Staged admission and activation

Catalog discovery, acquisition/pinning, compatibility or conversion validation, scoped enablement, per-Run activation and formal Manuscript Apply are distinct boundaries even when the UI offers one compact `install and enable` action for a compatible artifact.

- Discovery, acquisition and validation execute no artifact code.
- Native lifecycle hooks, dependency scripts or code requiring execution produce at least a `restricted` compatibility disposition until separately authorized executable admission and sandboxing exist.
- Installation and scoped enablement grant no manuscript access, Provider processing, credential resolution, network access, external Effect, background analysis or formal mutation authority.
- A foreground artifact may execute only inside an exact Run created for a newly user-initiated Task, directly authorized or matched by an active Default Execution Rule.
- A new autonomous background Provider dispatch requires a matching active Background Analysis Enrollment and still creates an exact frozen Run.
- DSH Session, Plugin membership, catalog visibility or recommendation grants nothing.

AI7 may expose pluggable catalog sources and native browse, search, install, update, disable, remove and rollback operations. No community directory is made authoritative by this decision, and the supported source set and adapter contract remain unresolved.

## Book-bound presentation and Apply

An admitted DSH composition may supply the inner experience of the Book-bound Agent Workspace, and a compatible admitted DSH UI Plugin may render there. The AI7 shell, exact Book and Active Work Object bindings, visible safety state, product records and direct return route remain AI7-owned. No native UI Plugin may replace the shell or create another Book, global chat root or authority path.

Every formal agent-originated Manuscript mutation—whether requested by a native Plugin, imported Skill, background analysis or any other agent path—uses the one AI7 Apply boundary. Apply is single-use and bound to one exact Book, base Manuscript Pin, diff and target set; it rechecks drift, requires explicit editor confirmation, commits atomically and records its own receipt or recovery state. No install, enablement, update rule, enrollment, Run, DSH Session or artifact may contain or inherit Apply authority. Direct human typing remains a separate human edit action.

## Supersession and retained obligations

- This ADR fully supersedes [ADR 0010](./0010-separate-task-skill-instruction-implementation-and-authority.md). It retains that ADR's non-authorizing-artifact principle, exact per-Run activation and independent AI7 enforcement, but retires the parallel Task Skill package/projection model.
- It fully supersedes [ADR 0042](./0042-admit-and-pin-third-party-dsh-plugins.md). Immutable identities/digests, license/notices, rollback and AI7 authority gates remain; development-only discovery, GitHub activity thresholds as the universal product admission owner, release-only activation, no shipped catalog and an absolute no-update posture do not.
- It partially supersedes [ADR 0008](./0008-use-deliverable-owned-workflow-profiles.md) only for the Workflow definition and technical-logic carrier. Deliverable ownership, durable Workflow Instances, phases, gates, artifacts, signoff and Effect-safe transitions remain unchanged.
- It partially supersedes [ADR 0017](./0017-full-engine-narrow-tool-surface.md) only where that ADR did not admit product-managed native artifact acquisition and scoped enablement. Those lifecycle operations may now exist behind the same AI7 boundary. The narrow editorial tool surface, excluded DSH scheduler/workflow packages, AI7-owned Runs and Workflow Instances, two non-user-escalatable capability profiles and dual capability enforcement remain unchanged.
- It partially supersedes [ADR 0018](./0018-tiered-activation-for-agent-authored-revisions.md) only for explicit or rule-bounded adoption of non-expansive imported-Skill updates. Policy Documents still require developer review under the stricter existing rule; composition/capability expansion never self-activates.
- It partially supersedes [ADR 0041](./0041-dsh-first-deepseek-primary-architecture.md) where that ADR routes all third-party artifact lifecycle through ADR 0042 or broadly lists Workflow definitions among AI7-owned implementation carriers. DSH remains the sole loop; AI7 retains every business and authority owner, the narrow Capability Facade and the exact core package-subset pin.

## Deferred details and stop boundary

Except for the exact built-in Manuscript Profile mapping and Issue #88's exact sole carrier/adapter selection recorded above, all other catalog sources and adapters remain unresolved; this decision does not choose any other source or adapter, closed-source admission, trust tiers, executable sandboxing, compatibility tests, state schemas, compact UI, external/user-authored Profile/Bundle mapping, core-package update policy, code-bearing automatic update, or any final sidecar/conversion/reconciliation/enablement/activation record name. Requiring one of those choices stops Issue #86 for the applicable Owner or later implementation brief.
