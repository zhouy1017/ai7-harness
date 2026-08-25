# Upstream Consumption and the Upgrade Contract

Status: **accepted dependency direction; the separate upgrade-verification checklist is superseded by ADR 0027**

## Decision

AI7 consumes DeepSeek Harness as **exactly pinned public npm packages**, selecting only the subset its composition actually needs. It does not fork the monorepo, does not vendor source, and does not depend on the CLI aggregate.

## Registry evidence

Initial check: 2026-08-17 against the npm registry, GitHub API, and pinned tree.
Current-state refresh: 2026-08-21 against GitHub releases/tags and sampled
AI7-relevant npm packages.

| Finding | Consequence |
| --- | --- |
| At the initial check, all 219 packages under `packages/*/*` published under `@deepseek-ai/dsh-*` through rc.6 on a coherent family ladder | Package consumption is viable only when the selected subset is pinned to one exact version and verified again at intake |
| At the refresh, sampled AI7-relevant packages expose `next = 0.1.0-rc.8`; Session, sandbox-local, and credentials-local still expose `latest = 0.0.1-rc.1`, while agent-loop exposes `latest = 0.1.0-rc.6` | Neither `latest` nor `next` is an admission signal; a bare install, range, or dist-tag can select the wrong era |
| **The audited pin `0.1.0-rc.5` was never published.** The npm ladder skips it | The audited commit and the installable artifact are different things and must be recorded separately |
| GitHub now has pre-release tags/releases `dsh-v0.1.0-rc.7@99f6f02` and `dsh-v0.1.0-rc.8@141eb6f` | Tags/releases improve provenance but still do not change the AI7 pin automatically |
| `@deepseek-ai/cordis` publishes separately | The plugin substrate is versioned outside the Harness family and needs its own exact-lock evidence |
| Upstream remains a developer-preview `0.1.0-rc.x` line | Active and fast-moving; expect churn despite the newly visible release channel |

A methodological note for anyone repeating this check: `npm view <pkg> version` returns the `latest` **dist-tag**, not the highest published version. Reading it as the latter produces the false conclusion that the published set is version-incoherent. Use `npm view <pkg> versions` and `dist-tags` instead.

## Four rules for pinning

1. **Exact versions only.** No `^`, no `~`, no `latest`, no `next`, and no moving GitHub release name. Commit the lockfile with integrity hashes.
2. **One coherent version across the selected subset.** The packages ship as a family; mixing eras is the specific failure this registry invites.
3. **The consumed baseline is `0.1.0-rc.6`.** `47f943859bef60e4160492346772ded9b24f765a` / `0.1.0-rc.5` remains the *audited* reference, but it is not installable. Record both and the delta; do not let design documents imply they are one artifact.
4. **Track every upstream identity together.** Record GitHub tag/release, commit,
   npm version, dist-tags, and package integrity. None is admission authority by
   itself; the upgrade watcher remains AI7's responsibility.

## Take part of Harness, not all of it

AI7 depends on the specific packages its composition needs and **never on `@deepseek-ai/dsh`**, the CLI aggregate. That package transitively pulls `dsh-tool-bash`, `dsh-tool-pwsh`, `dsh-shell`, `dsh-tool-web`, and `dsh-terminal` — precisely the generic tool surface Question 29 excluded from an editorial Run.

The principle: **not depending on a package is a stronger guarantee than not wiring it.** If the generic tool packages are absent from the dependency graph, the narrow surface is a fact about what is installed rather than a configuration choice that a future composition edit could quietly reverse. It also shrinks the upgrade surface and the third-party notices obligation.

A first-cut classification, to be resolved per package by the mandatory Phase 0 candidate-subset and closure audit rather than treated as settled or deferred to implementation:

| Likely needed | Likely excluded |
| --- | --- |
| Agent core and loop, scope, session, system prompt | `dsh-tool-bash`, `dsh-tool-pwsh`, `dsh-bash-local`, `dsh-pwsh-local` |
| Bundle/preset/context composition, `@deepseek-ai/cordis` | `dsh-shell`, `dsh-terminal` |
| LLM adapters and credentials seams | `dsh-tool-web` and other generic network tools |
| Skill projection, guards and policies, persistence | `dsh-web-app`, `dsh-web-frontend` — AI7 ships its own surface |
| Headless execution for tests | Generic filesystem tools, superseded by AI7 capabilities over the Agent Data Root |

Every inclusion needs a stated reason. A package that is merely convenient is not a package AI7 should depend on.

## Why not the alternatives

**Source fork.** 219 packages against a repository pushed four days before this decision. The merge burden is severe, and Question 29 does not require it: composition changes ship in a release after developer review, which needs configuration access rather than source access. The charter's existing rule stands — fork only after a documented seam gap.

**SDK or ACP boundary alone.** Question 29 accepted the full engine, and the provenance audit found SDK and ACP omit rich capabilities. Retained as a **fallback isolation seam**: `@deepseek-ai/dsh-sdk-client` is published, so retreating to a process boundary remains available if Electron or Node ABI conflicts force it, without re-architecting.

**Sidecar, or porting AI7 into Harness core.** Already rejected in the target architecture; nothing in this evidence changes that.

## Upgrade contract

A pin bump is a dedicated pull request, one pin at a time, and must verify at minimum:

- the effective composed Cordis configuration diff, since a row override replaces a whole row and can silently drop upstream fields;
- the **capability exposure diff**, which is Critical under the Question 29 tool-surface boundary;
- session schema compatibility against stored fixtures;
- AI7 journey replay on the Question 24 fixed scenario corpus;
- regenerated third-party notices, per ADR 0016; and
- Node and Electron ABI compatibility.

Compilation is never acceptance. A green build alone does not admit a pin bump.

### Required pre-implementation baseline audit

The consumed `0.1.0-rc.6` baseline was accepted after the detailed architecture
audit of the `0.1.0-rc.5` source pin, but the rc.5-to-rc.6 delta has not yet been
audited against AI7's selected seams. That audit is a Phase 0 exit blocker; it
must first identify the candidate package subset and then cover its exact closure, composed Cordis configuration,
Session persistence/export-import, model-visible context logging, subagent
continuation, replay behavior, tool guards, platform-native dependencies, and
third-party notices.

Resolving and exercising the installed closure requires separately authorized
disposable audit environments on Windows and macOS. It does not authorize a
package manifest, lockfile, dependency installation, or bootstrap in this design
repository.

Upstream has since published GitHub pre-releases for rc.7 and rc.8, and sampled
npm `next` dist-tags now point to rc.8. Commit
`7e95a00c8a5eed37fc8d16487b6a1a9b772b075c` in the later line fixes replay
metadata/content misalignment for max-token tool-call sessions. This is relevant
evidence, not permission to upgrade. rc.7 or rc.8 may be considered only through
the dedicated pin-bump process above; no document may silently substitute either
for the accepted rc.6 baseline.

## Supported-platform sandbox exposure

The published native sandbox addons are `node-addon-landlock-run-linux-x64` and `-arm64`. **Landlock is Linux-only.** Windows sandboxing runs a different path through `dsh-pwsh-sandbox` and `dsh-sandbox-local`.

The audit now resolves the uncertainty: Harness explicitly reports Windows
filesystem enforcement as `partial`; its write-restricted mode does not restrict
reads, network access, or process visibility, and it retains documented ACL and
hard-link gaps. On macOS, the Harness Seatbelt backend reports full enforcement
of its file-write mode, but that vocabulary likewise does not restrict reads,
network, or process visibility and relies on deprecated `sandbox-exec`. Neither
backend proves AI7's complete Agent Data Root or egress contract.

Until a stronger per-platform mechanism is accepted and proven, AI7's narrow
Capability and service facades are the enforceable authority boundary and the
Harness sandbox is only limited additional confinement. A macOS App Sandbox and
a stronger Windows isolation mechanism are investigation candidates, not
accepted architecture. The exact candidate-package closure must also be resolved
and exercised in separately authorized disposable audit environments on both
platforms because native dependencies can enter through the chosen subset even
when the core loop is JavaScript.

## Question 30 decision

Accepted with owner revisions:

- exactly pinned public npm packages, no fork and no vendored source;
- only the subset AI7's composition needs, never the `@deepseek-ai/dsh` CLI aggregate;
- exact versions with a committed lockfile, one coherent version across the selected subset;
- consumed baseline `0.1.0-rc.6`, with `0.1.0-rc.5` retained as the audited-but-uninstallable reference;
- upstream GitHub tags/releases and commits tracked together with npm versions/dist-tags, with none treated as automatic admission;
- SDK or ACP retained as a fallback isolation seam; and
- a dedicated upgrade pull request with a six-point verification contract.

The 2026-08-21 platform revision adds two Phase 0 obligations without changing
that decision: audit rc.5-to-rc.6 before implementation, and prove the selected
package closure on Windows and macOS. The newly available rc.7/rc.8 pre-releases
remain outside the accepted pin. See [ADR 0027](../docs/adr/0027-support-windows-and-macos-as-one-product.md)
and the [Phase 0 exit review](./36-phase-0-exit-review.md).

See [ADR 0020](../docs/adr/0020-consume-pinned-harness-package-subset.md).
