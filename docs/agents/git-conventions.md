# Git conventions

Binding for every agent and every human working in this repository. These rules exist so that dispatched work is uniform regardless of which agent or provider produced it.

## Branches

See [Development lines](./development-lines.md) for the authorized line roles and current protection facts.

`dev` is the long-lived development integration line. Start every task branch from current `dev` and target its pull request to `dev`. **Nothing is pushed directly to `dev` or `main`**, including by the Commander; both protected lines receive changes through pull requests.

`main` is the protected stable and release-promotion line. No task branch or pull request targets it unless the Owner has separately authorized that exact promotion. Frozen `design-doc@6895f02d2983865516d267809d8cdda77026f62c` is an allowlist source, not a branch to merge into development.

Branch names are `<type>/<issue>-<slug>`:

```
feat/42-manuscript-block-store
fix/108-stale-retrieval-hit
docs/17-glossary-collision-guard
```

- `<type>` is one of the commit types below.
- `<issue>` is the GitHub issue number. GitHub Issues is the canonical tracker, so work without an issue is work nobody can find later.
- `<slug>` is two to five lowercase words, hyphen-separated, describing the outcome rather than the method.

One issue, one branch, one pull request. One writable worker per branch, per the Repository Development Dispatch rules.

Before work is labeled `ready-for-agent` or dispatched, the Issue contains the applicable [Change Brief](change-brief.md). Mechanical T1 work may use the short form; every non-mechanical change uses the full authority, reuse, structural-budget, non-goal, consequence, and stop-condition form. A Worker never enlarges that brief itself.

## Commits

Conventional Commits: `type(scope): subject`.

| Type | Use for |
| --- | --- |
| `feat` | New user-visible capability |
| `fix` | Corrected behavior |
| `docs` | Documentation and design records |
| `refactor` | Behavior-preserving change |
| `test` | Tests only |
| `build` | Packaging, dependencies, pins |
| `ci` | Workflow changes |
| `chore` | Everything else |

Subject in the imperative, lowercase, no trailing period, under 72 characters. The body explains **why**, not what — the diff already shows what. State rejected alternatives when a choice was contested, and name any accepted decision the change implements or revises.

Agent-authored commits carry the co-authorship trailer for the model that wrote them.

## Pull requests

Pull requests open as Draft and remain Draft during authoring, debugging, review, rebase, and local validation. Workers never push or change pull-request state. Once the change is locally complete and target authority has been re-resolved, the Commander pushes the branch and changes the pull request to Ready. After successful post-boundary re-entry, that transition starts the one hosted E2E occurrence only when the exact workflow has been separately restored and is applicable; before the ADR 0054 boundary, Ready does not start disabled workflow `342459594`. A later push while an applicable occurrence is running starts the newest occurrence and cancels its superseded in-progress same-PR occurrence; avoid such pushes by returning failed or changing work to Draft first.

- Title matches the primary commit subject.
- Body links the Issue and states the user-visible outcome or exact non-product outcome.
- Body records only the Change Brief closure delta: planned versus actual structure, existing implementation reused, any new owner/dependency and why, journey/bug outcome or `N/A` for non-behavior work, migration/cleanup, unresolved matters, and archive-sweep result when a lifecycle node was triggered.
- For an implementation change affecting a supported Journey or observed-bug outcome, Local completion precedes Ready and the one logical E2E Functional Gate normally passes the same applicable Journey IDs on Windows and macOS. Before the exact Initial v1.0.0 Development Milestone Boundary, [ADR 0054](../adr/0054-defer-macos-evidence-until-after-initial-v1-0-0-development-milestone.md) independently permits Ready and merge from fresh exact-head Windows `doctor` → `bootstrap` → `build` → `e2e:all`, including for shared and macOS-native changes, regardless of whether [ADR 0053](../adr/0053-preserve-local-first-development-through-a-bounded-ci-degraded-mode.md)'s external condition remains active. A Windows product/bootstrap/build/Journey failure or unknown returns the pull request to Draft; missing macOS evidence is disclosed and deferred rather than represented as passing.
- Documentation-only and design-only changes do not create automated proof work. Lint, type-check, format, build, package, signing, release, same-SHA, or formal-review checks are not additional required pull-request gates.
- Independent review is optional and advisory. When review is requested, the Commander directly dispatches a fresh-context, strictly read-only, non-author Reviewer; a Reviewer may not dispatch, delegate to, or spawn another agent. Record the reviewed task class and bind the Reviewer at that class or higher.
- Record requested and actual Reviewer provider/model/effort, class-floor confirmation, independence, fallback status, and any exact fallback or same-provider reason. Cross-provider review is preferred, but Reviewer assignment does not inherit the Worker Claude-first order. A verdict must not become a pull-request (PR), CI, branch, exact-head, zero-finding, iterative re-review, or other proof gate.
- **Only the Commander merges.** Workers and Reviewers never do.

The E2E scenario admission, data, subject, and platform rules live in [`ci-test-boundaries.md`](ci-test-boundaries.md).

Before the Initial v1.0.0 Development Milestone Boundary, ADR 0054's integration route is independent of ADR 0053. When ADR 0053's exact CI-degraded conditions are active, the Commander also records every workflow-state, no-run, and external-condition activation fact. If that external condition resolves before the boundary, ADR 0054 remains active, the paired workflow stays disabled and unrun, and Windows Local completion still supplies the authorized Ready/merge route. ADR 0054 replaces the affected-platform Draft stop with the required Windows completion and truthful macOS deferral; a known macOS-only problem is recorded for re-entry and is not relabeled as passing. Integrate one product pull request at a time. Local completion and every authority, privacy, dependency, and Commander-only rule remain unchanged; no hosted run, paired-platform evidence, green Gate, substitute Gate, or single-platform Gate is claimed. Pure documentation, design, and CI-governance work follows its Change Brief's applicable local validation; optional advisory read-only review remains non-gating.

Before the Initial v1.0.0 Development Milestone Boundary, authoritative resolution of the recorded external condition does not end ADR 0054 or authorize workflow action. At the boundary the exception expires; after separately authorized Windows/macOS re-entry, every Ready but unmerged product pull request rebases and returns to the normal paired-platform lifecycle. Workflow `342459594` restoration or dispatch requires separate exact external-action authority. Do not probe, manually dispatch, automatically enable, replace, or retrospectively run the workflow.

**Squash merge.** Each task merge to `dev` is one complete task, so history reads as a sequence of finished outcomes rather than agent scratch work. The pull-request body becomes the squashed commit body. A `dev` to `main` promotion remains subject to its separate Owner authorization.

After merge, closure, or abandonment, run the applicable [documentation archive sweep](document-lifecycle.md). This is lifecycle maintenance, not an additional merge or review gate.

## Tags and releases

Reserved tag syntax is `vX.Y.Z` for releases and `vX.Y.Z-rc.N` for release candidates. This syntax is defined independently of automation and does not assert that a release workflow or `v*` trigger exists.

No release workflow is implemented or authorized by this baseline. Any release automation requires its own exact Owner authorization and task scope. Tags are created only by the Commander, only on `main`, and only after the separately authorized promotion path. Tagging or later release automation creates no separate release, receipt, packaging, signing, reproducibility, provenance, or same-SHA proof gate.

ADR 0054's temporary pre-boundary evidence rule cannot carry into release work. At the exact Initial v1.0.0 Development Milestone Boundary, complete the separately authorized consolidated Windows/macOS re-entry before any later product integration and before any `dev` to `main` promotion, `v1.0.0` tag, package, signing, notarization, publication, or release action. No prior pull request receives retrospective macOS evidence.

## Protected material and the narrow test-input exception

Credentials, secret values, private sample Books, and ordinary manuscripts or derivatives—including retrieval indexes and embeddings—never enter the repository. Document formats remain ignored by pattern everywhere by default.

[ADR 0043](../adr/0043-allow-public-samplebooks-in-repository-and-ci.md) permits only exact-root `SampleBooks/` files explicitly designated by the Owner through an authorized Issue and pull request to be tracked as provider-free local/hosted-CI test inputs. Placement in that directory alone is not authority. The `.gitignore` exception makes such an authorized commit technically possible; it does not admit a file. Public SampleBooks remain excluded from raw logs and uploaded artifacts, distributions, production learning, export, publication and public-release authority.

[ADR 0044](../adr/0044-use-sample1-as-compatibility-and-recording-baseline.md) creates the only live-provider exception: a future local, human-attended, one-call, exact-binding, no-fallback recording over exact `SampleBooks/sample1.docx` under Provider Processing v2. Raw request/response material remains outside Git. Only normalized, sanitized, rights-reviewed and human-reviewed fixture bytes may later be tracked through a separate authorized Issue and pull request; such a fixture never ships or enters learning, export, publication or release assets.
