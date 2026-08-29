# Current handoff

Issue #40's implementation candidate is `6123fa0b0cfc6f2050045d746ee337e31380270f` against exact base `origin/dev@46357022800eb5ce233ca57061b03e1a7f2c8aeb`. Commander completion validation is green; the fixed-base Standards and Spec reviews remain. The Worker did not push, change GitHub state, or operate Actions.

## Current route

- Reimport preparation, identity resolution, commit planning, and committed-result replay use the existing cooperative-job owner with bounded progress, cancellation, and retry. Partial/cancelled work is not comparison, resolution, attempt, or commit authority; dirty-journal checkpoint creation, branch switch, and reviewed comparison persistence share one final atomic boundary.
- Preparation now builds exact staged/current/lineage occurrence facts in 64-row cooperative batches in the authority connection's disk-backed TEMP store. Mapping/deletion pages use complete-key occurrence seeks and the dirty-checkpoint path uses a unique `(work_id, block_id)` index, eliminating correlated whole-manuscript counts from a nominal batch. The unused synchronous checkpoint and mapping-visitor bypasses are removed.
- Comparison/resolution aggregates keep normal operations bounded while startup still streams and verifies exact block bindings, ordered digests, identity consequences, fidelity/degradation evidence, lineage links, result Revision truth, and immutable record proof.
- Reimport commit reparses and compares staged content cooperatively, plans exact identities and derived rows in transient batches, rechecks captured authority, and only then persists its attempt and crosses one immediate non-cancellable atomic cutover. Acknowledged cache-miss replay hashes in fixed batches; cache-hit replay is a bounded 1/1 terminal receipt. Legacy source/reimport results without presentation-only receipt fields remain reconcilable.
- Book history uses deterministic total-order keyset pages. Renderer pages replace rather than accumulate, all durable history remains navigable, response size fails closed, and commit completion carries only an exact bounded receipt.
- Full-text mapping/candidate surfaces remain bounded. Exact globally unambiguous moves may preserve identity automatically; changed or competing identity consequences remain explicit and persisted. No generic diff engine, merge framework, parallel store, ledger, or commit path was added.
- Protocol/readiness is exact version 10. The accidental recovery-authority dirty-checkpoint column is removed; v9→v10 remains the sole additive schema successor.
- Commander completion validation passes pinned Windows doctor, bootstrap, TypeScript `--noEmit`, the build owner's verified clear-output rebuild, full J-01, J-02, and J-08. J-01 now also proves a 260-repeated-block dirty-checkpoint preparation reaches intermediate progress, cancels and retries cleanly, and produces exactly 521 unresolved mappings on a bounded page. No hosted run, green hosted Gate, or substitute Gate is claimed.
- J-01, J-02, and J-08 are admitted local journeys under the current CI boundary; hosted Gate execution alone is waived under ADR 0050. No hosted run, green hosted Gate, or substitute Gate is claimed.
- After integration, the separate Issue #40 documentation lifecycle sweep remains next. Issue #42 and Issue #88 remain `ready-for-human` pending the Owner's explicit new-journey Gate routing policy, independently of Actions usage reset.

## Safe next action

Commander: commit this checkpoint, fix the exact Issue #40 branch-head candidate, and run fixed-base Standards and Spec reviews against `origin/dev@46357022800eb5ce233ca57061b03e1a7f2c8aeb`. If both are clear, integrate only through the authorized path, then perform the separate lifecycle sweep. Keep Issue #42 and Issue #88 `ready-for-human`; do not create a new gate, operate Actions, or widen this change into Provider, export, release, publication, or generic merge work.
