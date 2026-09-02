# Current checkpoint

## What's done

- Issue #176's single product commit has been rebased from old `dev@37347d6962984618732ca3aeb251dd100b430009` onto exact current `dev@012d9e330a66f46cc288b24b9ef7e16962c3d960` in the isolated `feat/176-editorial-workspace-sidecar-revisions` worktree. The local candidate contains the independent-review repairs and normalized subject; Draft PR #177's unchanged pre-rebase remote head remains `5865bbcf6248b141c55732e401e0fd65fbb6be2d` until final local validation closes.
- Owner binding amendment https://github.com/zhouy1017/ai7-harness/issues/176#issuecomment-5517169002 supersedes only the obsolete Actions-usage-read conditions. Usage is Owner-monitored and is not a development, Ready, Gate, or integration precondition; every paired-Gate, failure-to-Draft, privacy, Provider/recording, lifecycle, and `main` boundary remains.
- The existing `EditorialWorkspaceProfileStore` remains the only behavior owner and keeps its three-method `inspect(bookId)` / `install(bookId)` / `enable(bookId)` interface. The implementation adds only the authorized SQLite v12→v13 route, two frozen canonical sidecar definitions, append-only exact-Book pins, Revision 1 migration pins, fresh direct Revision 2 enablement, explicit Revision 1→2 append, strict startup validation, service protocol v14, existing-card presentation, synchronized J-15 behavior, and J-12's schema assertion.
- Definition and pin rows are update/delete guarded, every writable connection enables and verifies recursive triggers, and startup rejects a connection that cannot enforce those guards against conflict replacement. Startup accepts only exact Revision 1, Revision 2, or Revision 1→2 histories with canonical pin times and native enablement bindings; causal order is revision-defined and does not assume a monotonic host clock. Canonical reproduction remains fixed at 588/660 bytes and the accepted SHA-256 digests.
- Rebase conflict resolution semantically retains Issue #184's J-12 public ready/missing projections, stable opaque Credential Reference, setup-Node no-raw-read rule, and pinned Electron Node-mode cleanup while applying Issue #176's schema-v13/sidecar/J-15 documentation. No whole-file side was selected.
- The integrated Issue #178 code remains authoritative: J-12 public focus/cleanup, bounded `ServiceClient` stop, renderer completion-frame cancellation, Electron close repair, and J-01/controller/run-all/workflow paths are preserved outside the exact authorized #176 deltas.

## What's next

- Re-verify the completed, repaired candidate's exact twelve-path branch diff plus every overlap invariant against current `dev`.
- Run fresh exact-head Windows `doctor -> bootstrap -> build -> e2e:all` with the repository-pinned Node/pnpm/Electron inputs. Confirm J-01/J-02/J-08/J-12/J-15 and cleanup residue; old-head completion is diagnostic history only.
- While PR #177 remains Draft, force-push with explicit lease against remote head `5865bbcf6248b141c55732e401e0fd65fbb6be2d`, update its closure to the final exact head and preserved #178/#184 owners, then make one normal Ready transition for a paired Windows/macOS Gate.
- Integrate only after the unchanged exact head passes both platforms. Then run Issue #176's scoped lifecycle closure before refreshing Issue #47.

## Key decisions

- Active revision is fixed-domain logic: explicit Revision 2 pin, otherwise explicit Revision 1 pin, otherwise none. No `latest`, generic revision chooser, update, downgrade, rollback, or catalog mechanism exists.
- Legal per-Book pin histories are Revision 1 only, Revision 1 then Revision 2, or fresh Revision 2 only. Revision 2 changes only two eligible current-Book readable-scope kinds; it grants no actual read, Task, Plan, Run, Provider, credential, network, Effect, Enrollment, or Apply authority.
- J-12 should differ from current `dev` only by schema 12→13, `ServiceClient` only by protocol 13→14, and renderer only inside the sidecar presentation. Application, J-01, controller, run-all, and workflow must remain byte-identical to current `dev`.
- Provider calls, execution-time secret resolution, exact `sample1` recording, fixture admission, publication, release, and `main` promotion remain outside autonomous work.

## Unresolved matters or blockers

- No known authority or implementation blocker remains. Fresh exact-head Windows completion and the paired Hosted Gate are still required before integration.
- Issue #47 remains blocked until Issue #176 and its lifecycle close. The later recording remains a separate human-attended action with fresh contemporaneous confirmation.

## Safe Resume Prompt

```text
Resume Issue #176 from the rebased local candidate in the isolated issue-176-sidecar-revisions worktree on Draft PR #177. Retain #184's nonsecret J-12 wording, #178's product/E2E repairs, and the review fixes for conflict-replacement immutability and wall-clock rollback. Verify the exact twelve-path diff and critical blob invariants, then run fresh exact-head Windows doctor -> bootstrap -> build -> e2e:all. With zero owned residue, force-push only while Draft using explicit lease against 5865bbc, update the PR closure, and permit one normal paired Gate. Do not query usage, call a Provider, resolve an execution secret, record sample1, admit a fixture, publish, release, or promote main.
```
