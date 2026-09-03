# Current checkpoint

## What's done

- Issue #47 remains bound to `feat/47-record-provider-denied-authorization` at exact base `dev@013959a5c0e018f22a0cba9933b3622c2219629d`; Draft PR #190 is Commander-owned. The current exact validated implementation head is `173b2f617bf98b570e976abed32e3372841266d4`; the Worker has not pushed or changed pull-request state.
- The permanent J-03 runner first produced the payload-safe RED at `6fa072681a1bfe527a010ab04b91a98eb59ebbfa`. Schema-v14/protocol-v15 product implementation landed at `894929ea950c261d85686c761c47743dd549f65f`, and review remediation landed at `4e2d261cc8f58cbf5e1956b7af0eed63e9a2aefd`.
- One deep `TaskAuthorizationStore` on the existing `ai7.sqlite` owns exact SQL, canonical JSON and SHA-256 links, immutable rows, idempotency, migration, startup semantic validation, and the small inspect/prepare/authorize surface. The existing bounded Manuscript checkpoint owner now also owns exact `Task Input / 任务输入`, shares one per-branch concurrency map with reimport, and reuses a clean current Revision without creating an empty one.
- Product availability now requires exact sample1 primary-Manuscript lineage, the exact installed native carrier plus enabled Revision 2 sidecar, and fixed missing opaque credential metadata. Frozen records still reopen from immutable rows. Main reconstructs renderer mutations from trusted fields so a foreign renderer `bookId` cannot override the sender-owned current-Book route.
- The frozen Run Source Scope independently identifies the exact Book, primary Manuscript, Task Input Revision, and Revision digest; Source Version remains unreadable lineage evidence. The Artifact Pin includes the exact native carrier digest and Revision 2 sidecar digest. The fixed Main Editorial DeepSeek binding, empty fallback, missing opaque credential readiness, public-or-synthetic category, unset budget, and trusted development-ci Provider Processing v1 denial remain unchanged.
- The Book workbench exposes only preparation and `记录本次运行授权（不派发）`; terminal state is exactly `已记录授权 · 未派发`. Later edits, restart, and configuration changes cannot retarget or start it, and no Provider, Session, scheduler, payload, egress, network, model, or Effect surface exists.
- Permanent J-03 now proves the negative prerequisite state, exact scope/carrier projection and UI, sender-owned cross-Book routing, real sample1/import/setup/Revision 2/edit/prepare/authorize/restart behavior, J-14 IME/focus/200%/forced-colors behavior, zero activity, and idempotence. Cancellation has mutation safety points, bounded current/acquiring-browser interruption, confirmed disconnect before root deletion, and fail-closed protected-store cleanup.
- At `4e2d261`, the pinned Windows toolchain build and permanent J-03 passed. The first `bb768d7` full sequence closed at `J-15/restart-persistence`; `ce6144b` corrected that same fixture's exact v12 cleanup for the new empty task-ledger tables. Follow-up review then required per-mutation cancellation points, sticky fail-closed browser close handling, and the real visible prepare action plus bounded cross-Book idempotent retry; `300f78f` implemented those, and `173b2f6` added the final pre-acceptance cancellation point.
- Exact head `173b2f617bf98b570e976abed32e3372841266d4` passed Windows 11 x64 `doctor` → `bootstrap` → `build` → `e2e:all` with pinned Node 24.18.1/pnpm 11.24.0. The resolved Journey set J-01/J-02/J-08/J-12/J-15/J-03 all passed and produced `LOCAL_COMPLETION/all/pass`.
- Four old J-03/J-15 temporary roots and one root left by a deliberately interrupted local J-02 run were removed after exact-parent/no-reparse/no-process checks. The unrelated older J-02 root was left untouched. At the validated completion boundary, J-03/J-15 root counts, owned process count, and dependency/runtime junction count were zero.
- `README.md`, `docs/development/source-checkout.md`, `docs/agents/ci-test-boundaries.md`, and `docs/agents/incremental-development.md` describe the current six-Journey J-01/J-02/J-08/J-12/J-15/J-03 projection and the provider-denied boundary. No ADR history was changed.

## What's next

- Commander verifies the current remote `dev`, pushes this branch, updates Draft PR #190, and owns review/Ready plus required paired Hosted Gate observation.
- Any rebase, integration, publication, release, or `main` promotion remains separately Commander/Owner-routed; the Worker performs no further product mutation.

## Key decisions

- Task authorization remains one immutable record-only ledger, not a generic Task framework or execution path. A recorded authorization has no dispatcher surface and cannot auto-start.
- Readable scope is an exact four-part selection of Book, primary Manuscript, Task Input Revision, and Revision digest. Source Version is evidence only, while both native carrier and sidecar identities are digest-pinned.
- J-03 observes only product projections. Its one synthetic secret is written and removed through existing supported product paths, is never read back or output, and is scanned only after confirmed product closure. Cleanup preserves the root whenever browser disconnect or protected-store removal is unconfirmed.

## Unresolved matters or blockers

- No product-scope, Provider, credential-authority, or structural-budget blocker is known.
- No product-scope, local-validation, Provider, credential-authority, or structural-budget blocker is known. Hosted Gate evidence is not claimed by this local result and remains Commander-owned.

## Safe Resume Prompt

```text
Commander: receive Issue #47 from validated implementation head 173b2f617bf98b570e976abed32e3372841266d4 plus its final routing-doc commit. Confirm the Worker's final docs-only exact-head Windows sequence, then own push, pull-request review/Ready handling, and required paired Hosted Gate observation. Do not treat local completion as Hosted evidence or enter Provider/secret-read/session/scheduler/payload/egress/model/Effect paths.
```
