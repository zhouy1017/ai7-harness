# Git conventions

[Development lines](development-lines.md) owns line roles. [Orca dispatch](orca-dispatch.md) owns branch assignment, writer handoff, role permissions, PR release and wave integration. These rules govern Git formatting, validation references and release boundaries.

## Branches

Protected `dev` and `main` receive changes through PRs; direct pushes remain prohibited. Use the wave and Issue-bound slice names assigned by Orca dispatch. A slice targets its wave; final development integration targets dev. The [Change Brief](change-brief.md) fixes the bounded outcome and allowed paths.

## Commits

Use Conventional Commits: `type(scope): subject`.

| Type | Use |
| --- | --- |
| `feat` | User-visible capability |
| `fix` | Corrected behavior |
| `docs` | Documentation or design |
| `refactor` | Behavior-preserving change |
| `test` | Tests |
| `build` | Dependencies, pins or packaging |
| `ci` | Workflow |
| `chore` | Other maintenance |

Use an imperative lowercase subject, no trailing period, under 72 characters. Explain the reason in the body; name implemented decisions and meaningful tradeoffs.

Use truthful tool attribution for agent-authored commits. A Codex session may use `Co-authored-by: OpenAI Codex <codex@openai.com>`; a Claude Code session may use `Co-Authored-By: Claude <noreply@anthropic.com>`. Actual subscription channel, model and effort belong in the assigned task/Issue/PR records, not in a trailer claiming runtime-model verification.

## Pull requests and evidence

- Title describes the resulting change; body links the Issue and includes [Change closure](change-brief.md#pull-request-closure).
- Keep a PR Draft while its current candidate has unresolved authoring, repair or validation. Release and merge permissions are exclusively defined by Orca dispatch.
- Record checks at the final candidate's exact head and target base; changes invalidate evidence according to that rulebook.
- [CI and test boundaries](ci-test-boundaries.md) owns the applicable Local Verification Ladder, Journey admission, guest execution and provider-free hosted Gate. Documentation-only work uses the applicable documentation checks.
- [ADR 0058](../adr/0058-remove-actions-usage-observation-from-development-gating.md) excludes Actions usage, billing, balances and estimates from development gating. Read check conclusions needed for validation, not usage views.
- Existing workflow behavior is a runtime fact, not role authorization. The rulebook's runtime/CI readiness task owns adaptation to wave branches and released final candidates.

Use squash merges so each slice and final integration has a bounded closure record. The PR body carries its outcome and validation. A green check does not grant publication or `main` promotion authority.

## Branch and workspace retirement

After merge or abandonment, record the final commit and preserve needed work before retirement. Use Orca's documented managed-workspace lifecycle; do not replace it with raw worktree deletion. GitHub branch deletion and local workspace retirement are separate operations: verify both rather than assuming a merge command removed a checked-out branch. An abandoned branch's closing record retains its tip for Git recovery.

Run the scoped [document lifecycle](document-lifecycle.md) sweep at completion. Obsolete conflicting instructions are removed from the current tree; Git preserves history.

## Tags and releases

Reserved syntax is `vX.Y.Z` and `vX.Y.Z-rc.N`. [ADR 0093](../adr/0093-automate-nightly-packages-and-windows-version-tag-releases.md) supplies the Owner's standing scope for automatic native packaging after the paired nightly Gate and Windows-only publication of those exact artifacts when a matching version tag exists. Stable tags produce normal releases; RC tags produce prereleases, with unsigned Windows status disclosed in both. macOS releases are deferred indefinitely until the Owner explicitly requests resumption; signing readiness does not lift the hold. Unsigned macOS packages stay in nightly inspection artifacts and are excluded from GitHub Releases. [Versioning](../development/versioning.md) owns identity; [releasing](../development/releasing.md) owns the workflow. Creating/moving tags, signing/notarization, macOS publication and promotion to `main` remain separately scoped actions. No additional hosted Gate is created.

The Initial v1.0.0 Development Milestone Boundary remains the exact record defined by [ADR 0054](../adr/0054-defer-macos-evidence-until-after-initial-v1-0-0-development-milestone.md); its separately authorized consolidated platform re-entry remains required, with only ADR 0093's native nightly packaging and Windows publication excepted. Earlier PRs receive no retrospective evidence.

## Protected material and fixtures

[AGENTS](../../AGENTS.md#protected-material) and [project constraints](project-constraints.md) own manuscript and credential boundaries. Owner admission under [ADR 0043](../adr/0043-allow-public-samplebooks-in-repository-and-ci.md) is required for exact-root Public SampleBooks; location or an ignore exception alone grants nothing.

Necessary development calls and cache reuse follow [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md) and [ADR 0067](../adr/0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md). Raw Provider payloads remain outside Git. Repository fixture admission follows [ADR 0044](../adr/0044-use-sample1-as-compatibility-and-recording-baseline.md) and the applicable generation/review procedure; development authorization is not fixture, learning, export, publication or release authority.
