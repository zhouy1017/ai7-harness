# Current checkpoint

## What's done

- Issue #176 / PR #177 integrated exact head `c21428bb7534865ea4069863e3ccd80150fa2a02` into `dev@7dec919ecb8a37d34dc8e450d52d7d2708d43726`. Gate run `33692616156` passed J-01, J-02, J-08, J-12, and J-15 on Windows Server 2025 x64 and macOS 15 arm64.
- The existing `EditorialWorkspaceProfileStore` now owns SQLite schema v13's two frozen `ai7.editorial-workspace-profile.authority` revisions and insert-only exact-Book pins behind its unchanged three-method interface; service protocol v14 and the existing renderer card expose the bounded lifecycle.
- The native 263-byte carrier remains unchanged. Revision 2 only makes the exact current Book's primary Manuscript Revision and Source Versions eligible to be requested; it grants no actual read, Task, Plan, Run, Provider, credential, network, Effect, Enrollment, or Apply authority.
- Every writable SQLite connection enables and verifies recursive triggers, canonical pin instants fail closed, and Revision 1→2 causality follows the fixed append path rather than host-clock monotonicity.
- Issue #178's Electron-main close/cancellation repair and Issue #184's nonsecret ready/missing credential proof, stable opaque reference, setup-Node no-raw-read rule, and pinned cleanup remain integrated.
- Issue #188 archives exactly the consumed Issue #176 root checkpoint. The outgoing `HANDOFF.md` remains in Git history; stable implementation, ADRs, policies, README/source-checkout, and Journey owners remain current. This lifecycle unit's own archive sweep is `none — current routing already closes the node`.

## What's next

- After Issue #188 integrates into the newest exact `dev`, re-resolve and refresh existing Issue #47 in place. Replace its historical target-qualified authority, Change Brief, structural budget, acceptance criteria, and labels before restoring `ready-for-agent`.
- Then create Issue #47's one branch/worktree and dispatch one writable Worker for only the bounded provider-free J-03 authorization outcome that consumes the exact Revision 2 Book pin.

## Key decisions

- Issue #47 authorizes an exact Task Intent and Plan Envelope without executing it. Issue #91 remains the sole later foreground execution owner.
- Usage is Owner-monitored and is not a development, Ready, Gate, or integration precondition. Paired-Gate, failure-to-Draft, privacy, Provider/recording, lifecycle, and `main` boundaries remain unchanged.
- Provider calls, execution-time secret resolution, exact `sample1` recording, fixture generation or admission, publication, release, distribution, and `main` promotion remain outside autonomous work. Recording still requires a separate action Issue and fresh contemporaneous human-attended confirmation.

## Unresolved matters or blockers

- No known blocker prevents the authorized in-place Issue #47 refresh after this lifecycle PR integrates.
- Issue #47 remains historical and `ready-for-human` until that exact refresh is complete; no Worker may use its old brief.

## Safe Resume Prompt

```text
Commander: after the Issue #176 lifecycle pull request is live on the newest exact dev, re-resolve and refresh the existing Issue #47 in place under ADR 0045, ADR 0055, and the Owner authorization at issue comment 5489351376. Replace its historical authority/base, structural budget, acceptance criteria, and labels before restoring ready-for-agent; then create its one task branch/worktree and dispatch one Worker for only the bounded provider-free J-03 authorization outcome. Consume the exact Revision 2 Book pin, preserve Issue #91 as the execution owner, and do not query usage, call a Provider, resolve a secret, perform sample1 recording, admit a fixture, publish, release, or promote main.
```
