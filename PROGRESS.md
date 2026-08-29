# Current checkpoint

## What's done

- Issue #40's implementation candidate is `6123fa0b0cfc6f2050045d746ee337e31380270f` against exact base `origin/dev@46357022800eb5ce233ca57061b03e1a7f2c8aeb`; this checkpoint records its completed local validation and pending fixed-base review.
- Reimport uniqueness facts for staged, current, and verified-lineage blocks now build cooperatively in fixed 64-row batches in the existing authority connection's disk-backed TEMP store. Mapping and deletion batches use exact indexed occurrence seeks, including a unique dirty-checkpoint `(work_id, block_id)` seek; no nominal batch can hide a correlated whole-manuscript count scan.
- The unused synchronous `checkpointForReimport` and whole-mapping visitor bypasses were removed. The existing cooperative preparation interface, comparison digest, final atomic persistence boundary, protocol v10, and all accepted identity semantics remain unchanged.
- Reimport preparation, explicit identity resolution, commit proof/copy planning, and committed-result replay now deepen the existing `CooperativeJobOwner`: work advances in bounded batches with monotonic progress and cancellation, partial work is non-authoritative, dirty-journal checkpoint authority and the comparison finalize atomically, and cancelled work before the durable-attempt boundary preserves prior authority.
- Normal mapping resolution uses persisted bounded comparison aggregates and no longer performs a hidden whole-comparison scan before returning or finalizing the job. Exact comparison, resolution, fidelity, graph, and immutable-result truth remains fail-closed at v10 startup.
- Book history is a deterministic eight-event keyset page with bounded record reconstruction and frame enforcement. The renderer replaces pages without accumulation, older/newer navigation round-trips, and commit completion uses an exact bounded receipt rather than searching an overview page.
- Reimport commit reparses the staged object cooperatively, validates and plans exact identity/derived rows in bounded transient state, persists the durable attempt only after a final authority recheck, and immediately crosses one non-yield atomic cutover. Cancellation is available before that boundary; completion and idempotent replay return exact bounded receipts. Legacy source/reimport `result_json` without reconstructible receipt fields reconciles exactly.
- The misplaced dirty-checkpoint column was removed from recovery authority; it remains only on the reimport-comparison owner. Service protocol/readiness is now exact version 10.
- J-01 additionally covers 260 repeated blocks through a dirty-journal checkpoint, observes intermediate cooperative progress, cancels and retries without residual authority, and proves the exact 521 unresolved mappings on a four-row bounded page.
- Commander completion validation passes pinned Windows doctor, bootstrap, TypeScript `--noEmit`, the build owner's verified clear-output rebuild, full provider-free J-01, J-02, and J-08 with Node 24.18.1/pnpm 11.24.0. No hosted evidence is claimed and no Actions run was started or enabled.

## What's next

- Commander: commit this checkpoint, fix the new exact branch-head candidate, and run the required fixed-base Standards and Spec reviews before any publication or integration.
- After Issue #40 integrates, run its separately scoped documentation lifecycle sweep before selecting another implementation Issue.
- Issue #42 and Issue #88 remain `ready-for-human` on the unresolved new-journey Gate routing policy. That policy decision is separate from Actions usage reset and must not operate the disabled workflow.

## Key decisions

- Lack of verified lineage does not block reimport. Verified lineage is accepted only from an exact Source Version owned by the selected Book and already bound to that Manuscript's accepted revision history.
- Exact globally unambiguous identity may continue across a move. Competing or edited identity remains explicit and persisted; no fuzzy matcher or generic diff/merge owner was introduced.
- A completed dirty-journal safety checkpoint becomes authoritative only at the same atomic boundary that persists the reviewed comparison. Commit planning remains cancellable and transient until its separately durable attempt/final cutover boundary.
- Durable history remains fully navigable through total-order keyset pagination; no overview, renderer page, or commit result carries all revisions or reimport records.
- Source-only and first-Manuscript semantics remain unchanged. Provider/network/credential/export/release/publication authority remains absent.

## Unresolved matters or blockers

- No Issue #40 implementation or local-validation blocker is known; the fixed-base Standards and Spec reviews remain.
- J-01, J-02, and J-08 are admitted local journeys under the current CI boundary. Hosted Gate execution alone remains waived under ADR 0050; none is a substitute or newly created Gate.
- Hosted Actions remain disabled and were not operated. `Hosted E2E Functional Gate: temporarily waived under ADR 0050 because Actions usage remained exhausted; workflow 342459594 was disabled_manually with no queued or active run; no hosted run, green Gate, or substitute Gate is claimed.`
- The next product frontier is blocked on the Owner's exact new-journey Gate routing policy: J-12 for Issue #42 and J-15 for Issue #88 cannot be admitted under ADR 0049 by inference. Actions reset neither supplies nor postpones that policy decision.

## Safe Resume Prompt

```text
Commander: commit the Issue #40 checkpoint for implementation candidate 6123fa0b0cfc6f2050045d746ee337e31380270f against exact base origin/dev@46357022800eb5ce233ca57061b03e1a7f2c8aeb, then run fixed-base Standards and Spec reviews over the exact branch head. If both are clear, continue only through the authorized integration path and then run the separate lifecycle sweep. Keep Issue #42 and Issue #88 ready-for-human pending the explicit new-journey Gate routing decision, and do not operate Actions.
```
