# Large-manuscript read and write baseline

Measured for [#1557](https://github.com/zhouy1017/ai7-harness/issues/1557), round [#1540](https://github.com/zhouy1017/ai7-harness/issues/1540), plan [#1516](https://github.com/zhouy1017/ai7-harness/issues/1516) §11. It is the baseline [ADR 0105](../adr/0105-fold-the-storage-baseline-undo-by-editor-step-and-upgrade-in-app.md) §6 measures R5 against. Taken on `dev@d1f1f79e4` plus the lane's slices (0.7.2 Alpha, schema 116, protocol 204), no product change.

## Method

The script is `tests/service/large-manuscript-baseline.bench.ts`. Its `.bench.ts` name keeps it out of every ladder layer; its one entry point is

```
pnpm exec vitest run --config tests/service/large-manuscript-baseline.vitest.config.ts
```

on a test guest. `AI7_BASELINE_SIZES` (default `2000,15000,46000`) and `AI7_BASELINE_REPS` (default 7) narrow a run. The runner names only whole layers, so the guest runs used a throwaway branch that pointed `test:service` at that configuration and fixed the sizes; the branch was never merged.

- **Manuscript.** The five Public SampleBooks are read through the product parser, concatenated in file order (2,933 blocks per cycle: `sample1`, 《朝花夕拾》, 《呐喊》, 《老残游记》, 《儒林外史》) and repeated cycle by cycle to exactly N blocks. From the second cycle on a `Title` is written as `Heading1`. The DOCX goes through the product's import path (stage, review, commit) into a fresh data root per size. One mark is seeded on every 100th body paragraph, alternating 批注 and 修改建议, through `createEditorialMark`. Only `SampleBooks/` text is read, and no text is printed.
- **Paragraph length decides the bytes.** Body paragraphs average 112.7 graphemes at 2,000 blocks (only the first three books are in), 196.1 at 15,000 and 194.3 at 46,000. The ~48.5 MB of the plan is for ~46,000 paragraphs of about that length; a manuscript of shorter paragraphs writes less per rewritten row, and a longer one more.
- **Operations**, each through the `EditorialStore` method the service calls:

  | Operation | Store call |
  | --- | --- |
  | split | `flushJournalEdit` with `structure: split`, at grapheme 10 |
  | join | `flushJournalEdit` with `structure: merge`, putting the split back |
  | typing | `flushJournalEdit`, one inserted grapheme |
  | save revision | `saveMilestone` (`stage-archive`) |
  | window, middle / start | `getManuscriptWindowAt` with `proportion 0.5` / `start` |
  | offset → position | `getManuscriptWindowAt` with `character` = half the graphemes |
  | position → offset | `getManuscriptWindowAt` with `block` = the middle paragraph |
  | entry position read | `readManuscriptEntryPosition` |
  | outline, first page / whole book | `getOutline` (first page; all pages by cursor) |
  | whole-book mark list | `inspectProposalWorkspace` with `resultId: null` (every mark's proposal item of the branch) |

  Split and join run at two places: **start** is the first body paragraph (every later row is rewritten: the worst case) and **middle** is the body paragraph at about half the block count. Neither carries a mark. A split is followed by the join that puts it back.
- **Write-ahead bytes.** The store's connections run `wal_autocheckpoint = 0` (`configureDatabase`) and the script starts no checkpoint worker, so nothing checkpoints during an operation. Before each measured operation the store's own idle checkpoint (`checkpointAfterResponse(true)`: PASSIVE, then TRUNCATE) empties the log to 0 bytes; the bytes written by the operation are then the size of `<data root>/store/ai7.sqlite-wal` right after it. Each figure is cross-checked against the frame count of `PRAGMA wal_checkpoint(NOOP)` on a separate connection: size = 32 + frames × (page size + 24), page size 4,096. The check held for every measured value. Reads therefore start with an empty log and a warm page cache; they wrote 0 bytes.
- **Time** is `process.hrtime.bigint()` around the single store call (the `saveMilestone` call includes forming its recovery object).
- **Repetitions.** One discarded warm-up round, then 7 measured rounds; a round runs every operation in the order of the table. Median and minimum–maximum are reported.
  The warm-up round of each operation is also printed, as its first invocation (Issue #1654). It runs on the one bench store the earlier rows already used, not on a fresh store; an operation that leaves history behind, such as 全部替换 and its undo, can grow round by round from it. `AI7_BASELINE_ONLY=mark-list` measures only the whole-book mark list.
- **Machine.** Background test guest, Windows 11 25H2, 6 vCPU, 4 GB, Node 24.18.1, one guest per run (the guest runner queue gives a run the guest alone). Run A (2,000 and 15,000): `ai7-testbed-01-nat`, receipt `20261118-111159-e4ba973e8cf45f5f2ff53d1d8b7fff351f3630a4.json`. Run B (46,000): `ai7-testbed-02-nat`, receipt `20261118-120738-9711b16aace6bf02d31dc21da057f735f0ebf45d.json`. The two runs are on different guests; timings can differ a little between guests, the WAL bytes do not.

## Result

Counts and tables are produced by the script's own output (`AI7_BASELINE_RESULT` lines), not tallied by hand.

| size (blocks) | heading | body paragraph | title | graphemes | mean per body paragraph | marks | import s |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2000 | 73 | 1924 | 3 | 217340 | 112.7 | 15 | 0.8 |
| 15000 | 677 | 14319 | 4 | 2817496 | 196.1 | 124 | 9.2 |
| 46000 | 2082 | 43914 | 4 | 8559754 | 194.3 | 380 | 28.4 |

Time in ms, write-ahead bytes in MiB (1 MiB = 1,048,576 bytes); median, then (minimum–maximum) of 7 rounds.

| operation | position | 2000: median ms (min–max) | 2000: WAL MiB (min–max) | 15000: median ms (min–max) | 15000: WAL MiB (min–max) | 46000: median ms (min–max) | 46000: WAL MiB (min–max) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| split | start | 23.93 (23.26–31.79) | 1.627 (1.615–3.092) | 244.00 (218.55–363.09) | 15.972 (15.964–16.235) | 628.93 (601.91–755.69) | 48.486 (48.478–50.171) |
| join | start | 24.89 (23.50–26.15) | 1.615 (1.607–1.796) | 237.87 (218.76–324.63) | 15.964 (15.960–16.180) | 643.70 (614.88–728.61) | 48.470 (48.458–48.698) |
| split | middle | 15.55 (15.18–16.08) | 1.002 (0.982–1.061) | 143.85 (127.53–180.41) | 8.723 (8.691–9.151) | 358.43 (335.00–405.12) | 24.510 (24.482–24.699) |
| join | middle | 15.99 (15.58–17.17) | 1.002 (0.978–1.045) | 141.52 (129.97–181.51) | 8.687 (8.683–10.141) | 359.48 (332.99–458.12) | 24.482 (24.475–27.249) |
| typing | middle | 9.00 (7.68–16.67) | 0.126 (0.114–1.226) | 19.86 (18.01–27.01) | 0.153 (0.145–0.259) | 41.47 (36.37–44.13) | 0.169 (0.157–0.338) |
| save revision | - | 118.85 (109.79–123.37) | 1.741 (1.721–1.760) | 1229.30 (1200.69–1531.94) | 16.644 (16.624–16.679) | 3975.29 (3600.78–4073.04) | 50.356 (50.293–50.379) |
| window (middle, proportion) | middle | 1.54 (1.26–1.60) | 0.000 (0.000–0.000) | 1.97 (1.88–2.83) | 0.000 (0.000–0.000) | 2.07 (1.87–2.30) | 0.000 (0.000–0.000) |
| window (start) | start | 0.94 (0.81–1.24) | 0.000 (0.000–0.000) | 1.07 (0.91–2.46) | 0.000 (0.000–0.000) | 1.03 (0.81–1.28) | 0.000 (0.000–0.000) |
| offset→position (window by character) | middle | 1.14 (0.98–1.23) | 0.000 (0.000–0.000) | 1.45 (1.21–2.48) | 0.000 (0.000–0.000) | 1.33 (1.17–1.90) | 0.000 (0.000–0.000) |
| position→offset (window by block) | middle | 1.05 (0.87–1.33) | 0.000 (0.000–0.000) | 1.37 (1.04–2.13) | 0.000 (0.000–0.000) | 1.18 (1.03–1.47) | 0.000 (0.000–0.000) |
| entry position read | middle | 0.15 (0.12–0.21) | 0.000 (0.000–0.000) | 0.20 (0.14–0.25) | 0.000 (0.000–0.000) | 0.17 (0.14–0.25) | 0.000 (0.000–0.000) |
| outline, first page | start | 1.47 (1.41–2.26) | 0.000 (0.000–0.000) | 1.59 (1.41–2.59) | 0.000 (0.000–0.000) | 1.45 (1.37–1.56) | 0.000 (0.000–0.000) |
| outline, whole book | - | 2.07 (1.89–2.44) | 0.000 (0.000–0.000) | 20.12 (19.43–36.11) | 0.000 (0.000–0.000) | 62.69 (58.10–69.95) | 0.000 (0.000–0.000) |
| whole-book mark list (proposal workspace) | - | 0.98 (0.86–1.13) | 0.000 (0.000–0.000) | 3.58 (2.80–4.22) | 0.000 (0.000–0.000) | 7.48 (6.95–8.18) | 0.000 (0.000–0.000) |

## Findings

- **The plan's figure is confirmed.** A split or a join at the first body paragraph of a 46,000-block manuscript writes **48.49 MiB** (median; 50.8 decimal MB) to the write-ahead log, about 12,340 frames. The plan's "~48.5 MB" is MiB. A split or join in the middle writes 24.5 MiB, about 51 % of that (55 % at 15,000).
- **It is linear in the block count.** The start split writes 1.07 MiB per 1,000 blocks at 15,000 and 1.05 at 46,000 (0.81 at 2,000, where paragraphs are shorter); the cost is the rows after the edit: `shiftPositions` updates every later `working_blocks` and `manuscript_outline` row, and `rebuildOffsetNodesFrom` writes every later offset node again.
- **ADR 0105 §6's growth target** ("less than 2× from the smallest size to the largest") is judged on this table's start rows: today 48.49 / 1.63 = 29.8× for a 23× larger manuscript.
- **Saving a revision writes as much as a structural edit and takes seconds.** 50.36 MiB and 3.98 s at 46,000 (16.64 MiB and 1.23 s at 15,000): `snapshotWorkingRevision` copies every block. ADR 0105 §6 sets no target for it; R5 should know that it is the same size as the split it removes.
- **Typing is small and nearly flat in bytes** (0.13 → 0.15 → 0.17 MiB) but its time grows (9.0 → 19.9 → 41.5 ms): it is the "typing" the R5 target holds to within 10 %.
- **The reads write nothing and are flat or near-linear:** the windows, the offset / position lookups and the entry-position read stay near 1–2 ms at every size; the first outline page too. The whole outline walk (all pages) grows with the heading count, 2.1 → 20.1 → 62.7 ms; the whole-book mark list grows with the marks, 1.0 → 3.6 → 7.5 ms (15, 124 and 380 marks).
- **Spread.** The minimum is within about 10 % of the median in time for the structural rows, the maximum is one round up to about 50 % above it; the bytes of a structural edit vary by well under 1 % except for single rounds that wrote 1–3 MiB more (typing at 2,000 blocks 1.23 MiB, split at the start 3.09 MiB, join in the middle at 46,000 27.2 MiB).

## Reuse

Run the same command after an R5 slice and compare each row. The script prints a `AI7_BASELINE_ENV` line (Node, OS, guest CPU) and one `AI7_BASELINE_RESULT` JSON line per size with every repetition, so a comparison needs no rerun of this baseline.
