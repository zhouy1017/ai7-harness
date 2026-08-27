# Progress

## What's done

- Reverified the clean blocked-audit entry at `feat/43-bounded-editor@d036fd3b7de79dbd8985bc4033efde6ed5cb2c02`, parent `fc95016c6d0e61a6da261ed66df32a04611ea33f`. All previously committed Issue #43 repairs remain unchanged.
- Two fresh read-only T3 advisory reviews independently identified the same seven actionable findings. **Same-provider review — independence reduced:** both reviews used the available Codex provider class and are advisory evidence, not a new standing review gate.
- Performed a read-only audit of finding 1. `working_blocks.start_offset` and `manuscript_outline.start_offset` are persisted absolute prefix sums used by character/proportion navigation, search global positions, outline projections, milestone revision copying, and reopen validation. A length-changing edit near block 1 therefore changes nearly every later absolute offset and currently performs O(total blocks) row writes.
- Confirmed that no truthful window-bounded correction exists within the current persistence structure. Removing or deferring the successor updates leaves durable offsets stale; computing prefix sums at read time merely moves O(total blocks) work into navigation/search and contradicts the accepted persisted-offset and reopen truth. No product or test file was modified, and findings 2–7 were deliberately not continued behind this structural stop.

## Validation

- PASS read-only inspection of the edit, window, outline, search, milestone, history, migration, and derived-offset validation consumers in the existing bounded manuscript owner.
- PASS final clean-status verification at `d036fd3b7de79dbd8985bc4033efde6ed5cb2c02` before this checkpoint-only update.
- Official doctor/build/J-02 remains unavailable because exact pinned Node `24.18.1`, pnpm `11.24.0`, and the frozen dependency tree are unavailable. Nothing was installed or bypassed, and no official gate result is claimed.

## What's next

- The next action is an explicit Owner authorization and Change Brief structural-budget decision, not implementation. The Owner must authorize one of the two persistence expansions below before any Worker changes finding 1 or proceeds to findings 2–7.
- After that decision, the Commander may redispatch the same Issue/branch/Worker with the selected private persistence semantics and corresponding migration, admission, validation, and J-02 proof budget. Do not infer that authority from this checkpoint.

## Key decisions

- Finding 1 is an authority stop, not a local optimization choice. Exact absolute prefix sums cannot support bounded near-start length changes without an additional range/prefix representation or an explicit semantic replacement.
- The two possible authority expansions are:
  1. Add a private segmented, Fenwick, or range-delta SQLite structure, including forward migration, exact schema admission, reopen validation, transactional maintenance, and conversion of all offset consumers.
  2. Explicitly redefine and migrate `start_offset` persistence semantics and every consumer that currently assumes an absolute offset, with equivalent admission, validation, navigation, search, milestone, and recovery truth.
- Neither alternative may be silently implemented under the current structural budget. Branch-local schema work also remains non-integrable by number: later Commander replay order is `#37 -> #41 -> #43`, preserving #37 review-v4 behavior and #41 per-draft commit binding/attempt/ack truth.

## Unresolved matters or blockers

- **Blocking finding 1:** normal near-start length-changing edits are O(total blocks) because exact persisted absolute `start_offset` values for all successor working blocks and outline entries must be rewritten. Resolution requires one of the Owner-authorized structural expansions above.
- Findings 2–7 remain actionable and deliberately unmodified:
  2. Preserve cross-window selection/caret/scroll continuity when an endpoint is outside the 16-block overlap, and cover a non-overlap endpoint in J-02.
  3. Bound renderer exclusion memory, enforce and explain the accepted 1,000-exclusion limit, and prevent impossible reviewed sets.
  4. Bound every search page below the accepted UTF-8 protocol frame without changing match identity or truth.
  5. Fail closed when candidate v3–v5 data contains a Milestone without a Signoff Record; never fabricate Signoff evidence.
  6. Stream-recompute staged block, content, and structure digests before reopen/commit so same-length tampering cannot retain review identity.
  7. Boundedly recompute and compare undo/redo before/after digests at reopen/migration and before history application.
- No dependency, Provider, manuscript/fixture/artifact, process, public interface, new gate, external action, or integration work is authorized by this checkpoint.

## Resume Prompt

Resume only after the Owner has explicitly expanded Issue #43's Change Brief and selected either a private segmented/Fenwick/range-delta SQLite structure or an explicit migration of `start_offset` semantics and all consumers. Reverify the exact branch/HEAD and revised authority, then resolve finding 1 first and add near-start sustained-edit coverage in the existing J-02 gate before proceeding to the still-actionable findings 2–7. Preserve all committed repairs and the later integration order `#37 -> #41 -> #43`; do not enter `docs/archive/`, install, call Providers, add manuscript artifacts, create another gate/Issue/owner without authorization, push, open a PR, merge/rebase, release, or touch `main`.
