---
status: superseded
---

# Admit and locally pin third-party DSH plugins

This historical development-only plugin-admission model is fully superseded by [ADR 0045](./0045-preserve-native-dsh-artifacts-behind-ai7-authority-sidecars.md). The body remains unchanged as decision history. Immutable identity/version/digest pins, license and notice obligations, rollback and AI7 authority gates remain applicable; GitHub activity thresholds as the universal product admission owner, release-only activation, no shipped catalog and the absolute no-update posture are not current after the successor is integrated.

This ADR is accepted as root ADR 0042 in the `dev` development baseline. It records the Owner's dependency-governance direction but does not select a plugin or independently authorize search, download, installation, implementation, or promotion to `main`.

It is separate from [ADR 0041](./0041-dsh-first-deepseek-primary-architecture.md) because harness assignment and dependency governance are different trade-offs: one decides who owns the loop, the other decides how outside code enters the composition and how upstream change is prevented from reaching AI7 silently.

## Context

AI7 composes DeepSeek Harness from a pinned package subset. Some composition or capability needs may already be solved by a third-party open-source DSH plugin. Reusing one is cheaper than reimplementing it, but an unmanaged plugin dependency imports another project's release cadence, abandonment risk, license obligations, and transitive dependencies into a product that must ship deterministically and must never widen its own authority by accident.

The preferred order of implementation remains unchanged: an AI7-owned adapter or capability implementation first, then a documented DSH extension seam, and only then a third-party plugin. A plugin is an option, never a default.

## Decision

### Need-based discovery

Development may search GitHub for a third-party DSH plugin **only** when an identified AI7 capability or composition need justifies it. Discovery is a development activity. It authorizes no installation, activation, capability expansion, or product network access, and it is never performed by a shipped AI7 runtime.

### Admission thresholds

A candidate is admissible only when a **Plugin Admission Snapshot**, dated on the development selection date, records all of the following:

1. The plugin is open source, and its license and notice obligations permit the intended AI7 use and distribution as an AI7-branded product.
2. The GitHub repository has **more than five stars**, operationally **at least six stars**, at snapshot time.
3. The plugin has **more than three qualifying updates**, operationally **at least four qualifying update commits** in total.
4. A **qualifying update** is a plugin-related **non-merge commit**. For a standalone plugin repository, count relevant non-merge commits on the default branch. For a monorepo, count only non-merge commits affecting the plugin directory or its manifest.
5. The newest qualifying update commit is dated **no earlier than 30 calendar days before the admission snapshot date**.

Repository-wide activity unrelated to the plugin does not satisfy the update requirement, and GitHub Release count is not the update measure. Star and activity figures are admission facts recorded once; they are never continuing runtime inputs, health checks, or scheduled re-measurements. Selecting a different upstream version requires a new admission snapshot.

### Immutable local version management

Every admitted plugin version receives an immutable **Local Plugin Pin** containing at least:

- stable plugin identity and upstream repository URL;
- selected package version when one exists;
- exact upstream commit SHA;
- exact source or package artifact digest/integrity value;
- admission-snapshot date and the star/update facts used for admission;
- license, provenance, dependency, and third-party-notice references; and
- the predecessor admitted pin, when one exists, for rollback.

AI7 development and production builds resolve only the admitted immutable artifact, through an **AI7-controlled local plugin store** plus the committed plugin manifest and dependency lockfile. Branch names, mutable tags, version ranges, and `latest` are forbidden, exactly as for the pinned DSH package subset.

AI7 performs no automatic upstream plugin update. An upgrade is an explicit, one-version-at-a-time development change that produces a new Plugin Admission Snapshot and a new Local Plugin Pin. The previous admitted pin remains available for rollback.

### Authority classification

A **Third-Party DSH Plugin** is a code-bearing **Capability Implementation** or a composition dependency. It is never a Task Skill, Policy Document, Model Provider, credential, Authority Ceiling, Effective Capability Grant, Run Authorization, or user-facing brand.

Consequently:

- A plugin may supply mechanism. It may not grant authority, and capability expansion never self-activates.
- Activation still requires the normal pinned deployment composition, reviewed and shipped in a release.
- Every plugin-provided operation reaching an editorial Run is still enforced twice: once at the DSH-facing tool guard, and independently at the AI7 Capability Facade against the exact Run, Plan Envelope, Run Source Scope, activation, grants, provider plan, and policy state.
- A plugin never bypasses the Provider Payload/Egress Gate, the Credential Broker, the Effect path, or the Task Ledger.
- No plugin may introduce a generic shell, process runner, roaming filesystem, arbitrary network, or developer-mode escalation into the Editorial Capability Profile. A plugin that can only be used by widening that surface is not admissible for editorial Runs.
- Plugin licenses and notices are added to the maintained third-party notices file in every build.

### Verification surface

Applicable user-visible behavior is covered only by the standing logical E2E complete-journey suite on Windows and macOS and observed-bug regressions. This decision creates **no** separate plugin or platform validation gate, scoring, audit, probe, capability matrix, or CI job.

## Consequences

- Upstream change cannot silently alter an AI7 build or installed composition.
- Rollback to the previous admitted pin is always available without a new admission process.
- The admission bar is deliberately low and mechanical: it filters abandoned and single-commit projects without becoming an evaluation programme.
- A needed plugin that fails a threshold is not a defect to be argued around. Implement the behavior in AI7, use a DSH seam, or return the exception to the Owner through the [Architecture V2 Decision Queue](../architecture-v2/DECISION-QUEUE.md).
- Plugin count is expected to be small or zero. Nothing in the architecture depends on any plugin existing.

## Rejected alternatives

- **Forbid third-party plugins entirely.** Rejected: it forces AI7 to reimplement solved composition work for no safety gain, given pinning and dual enforcement.
- **Allow ranges, branches, or `latest` for plugins.** Rejected: it reintroduces exactly the upstream-drift risk the pinned DSH subset already excludes.
- **Count GitHub Releases as updates.** Rejected by the owner: many healthy plugins never cut releases, so releases measure publishing habit rather than maintenance.
- **Count repository-wide commits in a monorepo.** Rejected: unrelated activity would let a dormant plugin inherit a busy repository's liveness.
- **Automatic upstream updates with a test gate.** Rejected: it creates a validation programme the minimal-verification decision excludes, and it makes builds depend on upstream timing.
- **Treat a plugin as a Task Skill or as its own capability grant.** Rejected: it would let installed code define its own authority.

## Authority and stop boundary

This decision derives from the source-qualified Clarification 0005 at exact Commander commit `5693a5f444f0fb0daaa630444acc18932b0df391`. That excluded exploration path remains Git history evidence only; this root ADR owns the current decision on `dev`.

It independently authorizes no GitHub search, plugin evaluation, plugin selection, download, installation, dependency change, source copy, prototype, product implementation, issue decomposition, pull request, push, merge, release, or `main` promotion.
