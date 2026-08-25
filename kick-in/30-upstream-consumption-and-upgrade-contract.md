# Upstream Consumption and the Upgrade Contract

Status: **accepted dependency direction; the separate upgrade-verification checklist is superseded by ADR 0027**

## Decision

AI7 consumes DeepSeek Harness as **exactly pinned public npm packages**, selecting only the subset its composition actually needs. It does not fork the monorepo, does not vendor source, and does not depend on the CLI aggregate.

## Registry evidence

The original evidence was checked 2026-08-17 against the npm registry, GitHub API, and pinned tree. Dist-tags are mutable observations rather than authority; the relevant tags were rechecked on 2026-08-25.

| Finding | Consequence |
| --- | --- |
| The 2026-08-17 audit observed the `@deepseek-ai/dsh-*` family through `0.1.0-rc.6` and supported one coherent exact-version subset | That dated observation supports the accepted `0.1.0-rc.6` baseline; implementation planning still checks every selected package's current immutable version metadata before locking |
| **Dist-tags drift and disagree across packages.** On 2026-08-25 `@deepseek-ai/dsh-agent-loop` reported `latest=0.1.0-rc.6`, `next=0.1.1-rc.2`; the excluded `@deepseek-ai/dsh` CLI aggregate reported `latest=next=0.1.1-rc.2` | A bare install, range, `latest`, or `next` is non-reproducible and may cross release-candidate eras. Dist-tags are discovery evidence only, never dependency authority |
| **The audited pin `0.1.0-rc.5` was never published.** The npm ladder skips it | The audited commit and the installable artifact are different things and must be recorded separately |
| **No git tags and no GitHub releases exist** — zero of each | There is no release channel to track and no deprecation signal to receive |
| `@deepseek-ai/cordis` publishes separately at `^4.0.1` | The plugin substrate is consumable independently of the Harness packages |
| Upstream is MIT, ~141k stars, `master`, last pushed 2026-08-13 | Active and fast-moving; expect churn at `0.1.0-rc.x` |

A methodological note for anyone repeating this check: `npm view <pkg> version` returns the mutable `latest` **dist-tag**, not a durable dependency decision or necessarily the highest published version. Inspect immutable version lists and all dist-tags as dated evidence, then keep the accepted version explicit in the manifest and lockfile.

## Four rules for pinning

1. **Exact versions only.** No `^`, no `~`, no `latest`. Commit the lockfile with integrity hashes.
2. **One coherent version across the selected subset.** The packages ship as a family; mixing eras is the specific failure this registry invites.
3. **The consumed baseline is `0.1.0-rc.6`.** `47f943859bef60e4160492346772ded9b24f765a` / `0.1.0-rc.5` remains the *audited* reference, but it is not installable. Record both and the delta; do not let design documents imply they are one artifact.
4. **Track upstream by commit and npm version.** With no tags, no releases, and unreliable dist-tags, the upgrade watcher is AI7's own responsibility.

## Take part of Harness, not all of it

AI7 depends on the specific packages its composition needs and **never on `@deepseek-ai/dsh`**, the CLI aggregate. That package transitively pulls `dsh-tool-bash`, `dsh-tool-pwsh`, `dsh-shell`, `dsh-tool-web`, and `dsh-terminal` — precisely the generic tool surface Question 29 excluded from an editorial Run.

The principle: **not depending on a package is a stronger guarantee than not wiring it.** If the generic tool packages are absent from the dependency graph, the narrow surface is a fact about what is installed rather than a configuration choice that a future composition edit could quietly reverse. It also shrinks the upgrade surface and the third-party notices obligation.

A first-cut classification, to be verified per package during implementation rather than treated as settled:

| Likely needed | Likely excluded |
| --- | --- |
| Agent core and loop, scope, session, system prompt | `dsh-tool-bash`, `dsh-tool-pwsh`, `dsh-bash-local`, `dsh-pwsh-local` |
| Bundle/preset/context composition, `@deepseek-ai/cordis` | `dsh-shell`, `dsh-terminal` |
| LLM adapters and credentials seams | `dsh-tool-web` and other generic network tools |
| Skill projection, guards and policies, persistence | `dsh-web-app`, `dsh-web-frontend` — AI7 ships its own surface |
| Agent-loop operation needed by the launchable product path | Generic filesystem tools, superseded by AI7 capabilities over the Agent Data Root |

Every inclusion needs a stated reason. A package that is merely convenient is not a package AI7 should depend on.

## Why not the alternatives

**Source fork.** 219 packages against a repository pushed four days before this decision. The merge burden is severe, and Question 29 does not require it: composition changes ship in a release after developer review, which needs configuration access rather than source access. The charter's existing rule stands — fork only after a documented seam gap.

**SDK or ACP boundary alone.** Question 29 accepted the full engine, and the provenance audit found SDK and ACP omit rich capabilities. Retained as a **fallback isolation seam**: `@deepseek-ai/dsh-sdk-client` is published, so retreating to a process boundary remains available if Electron or Node ABI conflicts force it, without re-architecting.

**Sidecar, or porting AI7 into Harness core.** Already rejected in the target architecture; nothing in this evidence changes that.

## Upgrade contract

A pin bump remains a dedicated pull request, one pin at a time. Under ADR 0027, it runs only the applicable supported E2E journeys and observed-bug regressions on Windows and macOS. The former separate six-point proof checklist—composed-configuration diff, capability-exposure diff, schema fixtures, fixed-corpus replay, notice-regeneration proof, and ABI gate—is superseded historical design and must not be recreated as standing gates.

Exact pins, the committed lockfile, capability restrictions, provenance, license review, and the obligation to maintain third-party notices in every build remain product and distribution requirements; removing their separate proof gates does not remove those obligations. Compilation alone does not authorize a pin bump.

## Supported-platform confinement exposure

The published native sandbox addons are `node-addon-landlock-run-linux-x64` and `-arm64`. **Landlock is Linux-only.** Windows and macOS therefore require different native mechanisms and neither mechanism is inferred from the Linux package.

ADR 0028 makes Windows and macOS supported product platforms. The Agent Data Root remains an intended platform boundary; AI7 capability and service facades are the enforceable product boundary on both. Native controls may add defence in depth only after their concrete design supports that statement, and their uncertainty creates no separate validation gate under ADR 0027.

## Question 30 decision

Accepted with owner revisions:

- exactly pinned public npm packages, no fork and no vendored source;
- only the subset AI7's composition needs, never the `@deepseek-ai/dsh` CLI aggregate;
- exact versions with a committed lockfile, one coherent version across the selected subset;
- consumed baseline `0.1.0-rc.6`, with `0.1.0-rc.5` retained as the audited-but-uninstallable reference;
- upstream tracked by commit and npm version, since no release channel exists;
- SDK or ACP retained as a fallback isolation seam; and
- a dedicated one-version-at-a-time upgrade pull request. Its former six-point verification contract is superseded by ADR 0027; only applicable supported E2E journeys and observed-bug regressions are standing CI.

See [ADR 0020](../docs/adr/0020-consume-pinned-harness-package-subset.md).
