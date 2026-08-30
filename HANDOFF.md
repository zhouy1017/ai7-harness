# Current handoff

Issue #42 is ready for the Commander's complete ordered validation on `feat/42-book-workbench-routes` from exact `dev@9b77b26c32da9a06018d943d47abaa8ccfc96076`. The bounded implementation and authority projections compile: service-derived exact Book/Revision routes; one main-owned Workbench per Book; one application arrival-order queue for effects and route application; immediate per-window route-request sequences for newest-route-wins/read freshness; bounded global sender claims for import drafts, recovery attentions, and import completions; exact per-window Manuscript/job/search/preview capabilities; pre-mutation existing-Book reservation across recovery and import/reimport; non-focus-stealing background state; full-chain validated immutable 32-block historical Revision reads; sender-owned native DOCX selection; truthful Product Data Location/reveal; real J-12; and ADR 0052's selected macOS profile.

Current evidence is green: strengthened J-12 proves stale editable reads cannot return after a newer exact Revision request, a second renderer cannot reacquire a globally pending import through `getImportStartup`, effect-before-route arrival order returns a classified durable success and applies the later exact Revision, and Book-A cannot read/write Book-B identities or reuse its opaque capabilities. J-08 preserves exact ineligible-snapshot typing and the recovery lifecycle; its controller now waits for the renderer's scheduled recovery-heading focus before sending Tab, while retaining the exact first-radio plus `:focus-visible` assertion. The Commander completed the uninterrupted Windows sequence `doctor -> bootstrap -> build -> J-01 -> J-02 -> J-08 -> J-12`, then used the existing canonical build owner to delete/regenerate only this worktree's exact `dist` and completed the clean `build -> J-01 -> J-02 -> J-08 -> J-12` rerun. All steps passed on Node 24.18.1/pnpm 11.24.0.

J-01 also permanently covers restart replay of an already acknowledged manuscript-reimport commit. Main uses a private read-only exact-proof preflight that cannot prime the verified-object cache; a wrong tuple is rejected without route/cache acquisition, a following valid replay remains queued, and deterministic failure unwinds only freshly reacquired authority while ambiguous outcomes retain it.

The global queue intentionally includes the sender-owned modal DOCX picker: selection/staging or cancellation resolves before later queued routes/effects, which fits the Issue's explicit native-selection boundary. Direct/source/reimport commit IDs are reserved before service mutation; newly acquired reservations roll back on classified deterministic service failure and remain only for timeout/stop/write/protocol/response ambiguity so idempotent recovery is not weakened. Atomic multi-attention/import-state claiming prevents rejected startup responses from leaving partial authority.

## Preserved boundaries

- Historical content comes from immutable revision block versions; canonical joins validate Book/source/Manuscript/Branch/parent/block ownership. Mutable working/editor state is excluded.
- Book Workbench routing is not Detached Manuscript Window transfer or Active Manuscript Surface Binding and never permits same-manuscript dual editing.
- No schema/migration, package/lock/dependency, workflow, URL/file association, custom/network root, credential/provider/Keychain operation, unbounded inventory, signing/notarization/upload/release, or `main` action is in scope.
- Workflow `342459594` remains `disabled_manually`; no hosted run or green paired-platform Gate is claimed.
- This Windows task has no real macOS 15 arm64 host and will not claim macOS evidence.

## Current route

Perform the final scoped status/document sweep; re-resolve exact `dev`, Issue #42, and workflow `342459594` as `disabled_manually` with zero queued/active run; commit the exact unit; run the mandatory fresh-context Standards and Spec advisory reviews; and address only real in-budget findings. Then create and integrate a Draft PR under ADR 0050 while keeping Actions disabled and never enabling, dispatching, or running the workflow.
