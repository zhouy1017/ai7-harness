# Current checkpoint

## What's done

- Issue #40's post-repair local candidate implements the bounded sole-primary-Manuscript reimport outcome in the existing protocol, main/preload/client, renderer, SQLite/store, and J-01 owners against exact base `dev@46357022800eb5ce233ca57061b03e1a7f2c8aeb`; it is pending Commander review and commit.
- Exact same-Book owned lineage produces a three-way comparison; absent verified lineage remains available as the conservative two-way `来源关系未确认` path. Target, relationship, source-version result, mappings, and final commit remain explicit choices.
- Changed completion atomically creates one Source Version/provenance result, one Manuscript Reimport Record, and one descendant Manuscript Revision. No-change records exact `未发现稿件变化` evidence without an empty Revision.
- SQLite v9 advances only through additive fail-closed v10 in the same authority, with relationship/operation rebuilds, persisted comparison/resolution/fidelity/reimport facts, exact three-result-kind exclusivity, bounded digest-indexed scans, semantic/startup tamper validation, and foreign-key validation.
- Comparison and identity selection use full-text bounded page replacement rather than whole-Manuscript materialization. Only globally unambiguous exact matches preserve identity automatically; ambiguous edits, moves, insertions, deletions, and competing identities require one persisted explicit consequence.
- J-01 covers verified and unconfirmed changed/no-change results, no-change lineage restart, duplicate-identity resolution that returns to no-change without an empty Revision, 260-block bounded page behavior, degraded fidelity acceptance/restart, dirty-journal checkpointing, exact reviewed-reimport recovery after original source-path loss, staged-object loss with mismatch rejection and all-choice-reset exact reselection, prepared-attempt recovery, after-commit recovery, uncertain fail-closed handling, tamper rejection, and immutable direct-record proof.
- The exact pinned Windows TypeScript/build boundary and full provider-free J-01 pass after the generated `dist` output was cleared by the repository's closed-output build owner.

## What's next

- Commander: inspect the exact Issue #40 diff and local validation evidence, then take the authorized integration path if it remains acceptable.
- After Issue #40 integrates, run its separately scoped documentation lifecycle sweep before selecting another implementation Issue.
- Issue #42 and Issue #88 remain `ready-for-human` on the one unresolved new-journey Gate routing policy. That policy decision is separate from Actions usage reset and must not operate the disabled workflow.

## Key decisions

- Lack of verified lineage does not block reimport. Verified lineage is accepted only from an exact Source Version owned by the selected Book and already bound to that Manuscript's accepted revision history.
- Reimport reuses the existing import draft, commit-attempt, commit-result, manuscript, source/provenance, recovery, and direct-record owners; it creates no generic diff engine, merge owner, parallel ledger, store, or commit path.
- The dirty-journal safety fixed point is a narrow bounded-store checkpoint, not a Milestone or recovery decision.
- Source-only and first-Manuscript semantics remain unchanged. Provider/network/credential/export/release/publication authority remains absent.

## Unresolved matters or blockers

- No Issue #40 implementation blocker is known.
- The next product frontier is blocked on the Owner's exact new-journey Gate routing policy: J-12 for Issue #42 and J-15 for Issue #88 cannot be admitted under ADR 0049 by inference. Actions reset neither supplies nor postpones that policy decision.
- Hosted Actions remain disabled and were not operated. `Hosted E2E Functional Gate: temporarily waived under ADR 0050 because Actions usage remained exhausted; workflow 342459594 was disabled_manually with no queued or active run; no hosted run, green Gate, or substitute Gate is claimed.`
- J-02 and J-08 remain optional diagnostics and were not promoted to gates.

## Safe Resume Prompt

```text
Commander: inspect the post-repair Issue #40 local candidate pending review and commit against exact base dev@46357022800eb5ce233ca57061b03e1a7f2c8aeb and its pinned Windows doctor/bootstrap/tsc/build/J-01 evidence. If the bounded reimport semantics and exact v9→v10 authority remain acceptable, commit and continue through the normal integration path, then run the separate lifecycle sweep. Keep Issue #42 and Issue #88 ready-for-human until the Owner explicitly decides new-journey Gate routing. Do not operate Actions or widen the standing gate surface.
```
