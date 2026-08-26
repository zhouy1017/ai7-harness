# Issue #36 sample1 degraded-import implementation handoff

Start with root [`AGENTS.md`](AGENTS.md), verify branch `feat/36-import-sample1-degradation`, current `HEAD`, and [`PROGRESS.md`](PROGRESS.md), then inspect live Issue #36 and its current Change Brief. This is the completed Worker handoff for the one bounded provider-free implementation outcome targeting `dev`; it grants no push, merge, release, Provider, fixture, export, full-J-01, Issue #37, `main`, or other external authority.

## Exact binding and input

- Base/target: exact clean `dev@1249ed8f1b4bc57a30fa95adf36ada1d7e89d9ae`; target `dev` only; never `main`.
- Requested Worker binding: `claude-opus-5@high`; actual: `gpt-5.6-sol@xhigh`; T3 same-class fallback because the Owner explicitly disabled local Claude.
- Immutable input: [`SampleBooks/sample1.docx`](SampleBooks/sample1.docx), regular non-symlink file, 29,550 bytes, SHA-256 `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483`.
- Toolchain used without repository changes: exact Node 24.18.1 and pnpm 11.24.0.

## Completed outcome

- The existing DOCX parser admits the exact sample1 terminal body-section shape, keeps it out of manuscript text, and produces the authoritative ordered eight-row fidelity projection with only `inline-styles:266` and `sections:1` degraded. Generic clean fidelity remains supported; other unsupported branches remain fail-closed.
- Protocol v2 and the existing prepare ingress accept only `acceptDegradation: boolean`. The first degraded review is a non-mutating preview with `reviewDigest:null`, the complete server-derived ordered set, and no commit. The one initially-unselected renderer checkbox sends only `true`; it cannot author keys or counts.
- Accepted finalization creates `ai7.new-book-import-review/2`, binding exact source identity, title, all eight rows, and the canonical current-import-only decision. Commit recomputes that digest from the authoritative snapshot.
- SQLite schema v2 reuses the existing degradation-decision owner. One transaction creates and verifies the review, eight categories, exactly one canonical decision, and the manuscript import record's exact decision link. Clean imports retain no decision.
- The forward v1→v2 migration recreates only the two constrained tables, preserves existing clean values/digests/IDs/null links, checks references before commit, and restores foreign-key enforcement on every path. Legacy v1 clean commit results are hydrated into the current projection without rewriting persisted JSON.
- The product UI exposes basename/bytes/SHA-256, full fidelity truth, acceptance state, degraded action wording, `含已接受的降级`, exact accepted items/counts, and linked fidelity-review/decision/import-record identities.
- The existing exact root J-01 journey now selects sample1 directly and covers the same renderer/main/separate service/composed dormant provider-free Harness/store/window/journal path, including the bounded 32-of-97 window and durable journal acknowledgement. It reads no product DB or manuscript text and retains/uploads/logs no manuscript payload, screenshot, trace, video, artifact, or SampleBook derivative; disposable external runtime state is deleted.

## Evidence

- RED: exact Node/pnpm `doctor`, `bootstrap`, and `build` passed; the first revised product-interface E2E exited 1 at payload-free `J-01/stage-target`. After the parser slice it advanced to payload-free `J-01/title-contract`.
- GREEN: exact `pnpm run e2e -- --journey J-01` exited 0 through the complete product path.
- Migration: a disposable diagnostic exercised the actual initializer; v1 clean review/category/import/legacy-result values were byte-for-byte unchanged, the null decision link remained null, `user_version=2`, foreign keys were restored/on, `foreign_key_check` was empty, `integrity_check` was `ok`, and a new degraded review→decision→import link succeeded. The script and data root were deleted; no gate was added.
- No dependency, workflow, topology, host, pin, Provider, credential, recording, fixture, export, release, or SampleBook change occurred.

## Safe next action

Commander may inspect the exact branch diff and commit, run the existing required validations, and decide whether to push/open the Issue #36 pull request against `dev` under separate external-action authority. Do not claim full J-01, broaden parser/import support into Issue #37, call a Provider, generate a fixture, touch `main`, or retain test runtime derivatives.

Archive sweep: no consumed working document or disposable diagnostic remains, and no lifecycle node requires an archive move. `PROGRESS.md` and this handoff are the only current routing documents updated by the Worker.
