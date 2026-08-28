# Current checkpoint

## What's done

- Issue #38 is rebased onto exact `dev@61b751c050f856a16e268982684b1287007dddd6`. The native Profile, schema-v8 migration, standalone empty-Book path, exact-existing-Book first-Manuscript intake, record inspection, and bounded J-01 outcome remain within the refreshed Change Brief.
- The supported Windows task-local environment restored only the accepted exact pins: Node `24.18.1`, pnpm `11.24.0`, Electron `43.4.1`, and TypeScript `6.0.3`. `doctor` and `bootstrap` passed; the Electron carrier SHA-256 is `c2ef9a5f65472c34d14bd3e67b7d14e66b0c01f124aba45263d6a4232160e13a`.
- Local failures were resolved inside existing owners: the persisted fidelity plan now rejects `undefined`; Book summary state remains the exact literal union; preload transports service failures through a frozen serializable `{code,message}` envelope because Electron drops custom `Error` properties across `contextBridge`; the renderer preserves exact messages and field routing; async duplicate-number evidence waits for the service response; and Book summary cards no longer reuse the recent-Manuscript semantic class.
- The unchanged required local loop passed: `build` then J-01, followed by clearing the exact `dist` output, rebuilding from an empty output root, and rerunning J-01. After the final corrections, that cleared-output `build` plus J-01 loop passed again. Optional risk-reduction runs of J-02 and J-08 also passed without changing either journey source.
- `git diff --check`, protected-path blob checks, manifest/sample hashes, and debug-residue checks passed. Package, lock, pin, dependency-artifact, workflow, exact `sample1`, J-02, and J-08 paths remain byte-identical to the target. The native manifest remains 1,033 bytes with SHA-256 `fc337a46d41a88a6f4d7bad7fc7b6846fe4b973e84776722ec126906a7b1d3ff`; `sample1` remains 29,550 bytes with SHA-256 `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483`.
- The optional fresh, independent, strictly read-only T3 advisory review reported 0 Standards findings and 0 Spec findings. It is advisory only and does not create an exact-head or zero-finding gate.
- Live pre-push state: workflow `342459594` is `disabled_manually` with 0 queued and 0 in-progress runs; PR #110 remains open and Draft; `origin/dev` remains exact `61b751c050f856a16e268982684b1287007dddd6`; remote feature head remains `1b34c810727d78e3a56a7c1420c62d1e537a9ed1`.

## What's next

- Commit the bounded local corrections and this routing, then update remote `feat/38-native-workflow-profile` only by exact force-with-lease against `1b34c810727d78e3a56a7c1420c62d1e537a9ed1`.
- Refresh Draft PR #110's lowercase title/body with the exact base/head, local outcomes, planned-versus-actual closure delta, and ADR 0050 disclosure.
- Immediately before Ready and again before merge, re-resolve exact `origin/dev`, confirm workflow `342459594` remains `disabled_manually` with no queued or in-progress run and no authoritatively confirmed reset, then integrate one waived product PR at a time. Verify that Ready creates no run while disabled.

## Key decisions

- ADR 0050 waives only the hosted paired-platform occurrence while Actions usage remains exhausted. Local completion, dependency/order/privacy rules, and Commander-only Ready/merge authority remain unchanged; no hosted run, green Gate, substitute Gate, or single-platform Gate is claimed.
- A frozen plain-data service-error envelope deepens the existing preload boundary and preserves error codes across Electron's documented context isolation; it adds no public API, dependency, Provider, or network authority.
- Separate Book-summary and recent-Manuscript semantic classes preserve both new J-01 navigation and unchanged J-02/J-08 meaning.

## Unresolved matters or blockers

- Reset status is external. Any authoritative confirmation of a fresh usable Actions allocation expires ADR 0050 immediately and stops this waived Ready/merge path.

## Safe Resume Prompt

```text
Commander: resume Issue #38 from exact dev@61b751c050f856a16e268982684b1287007dddd6 after its full Windows local loop, cleared-output rerun, and optional 0/0 advisory review passed. Commit only the bounded corrections plus current routing, verify remote feature head is still 1b34c810727d78e3a56a7c1420c62d1e537a9ed1, and force-with-lease the rebased branch. Refresh Draft PR #110 with the lowercase subject and exact ADR 0050 disclosure. Before Ready and merge, recheck origin/dev, workflow 342459594 disabled_manually, 0 queued, 0 in-progress, and no confirmed reset; verify Ready triggers no run, then squash-merge to dev. Stop immediately if reset is authoritatively confirmed or any authority/target fact drifts.
```
