# Wave 23 Windows Beta candidate evidence

This is the local verification record for [#1290](https://github.com/zhouy1017/ai7-harness/issues/1290), under [Owner intent #1279](https://github.com/zhouy1017/ai7-harness/issues/1279) and [PR #1301](https://github.com/zhouy1017/ai7-harness/pull/1301). Windows packaged acceptance passed on 2026-11-03. Editorial quality measurement follows the Owner's later scope: **sample1 in full; chapter-stratified sampling of the other four Public SampleBooks**. Human Beta acceptance and the independent editor study remain pending. This record authorizes no release, tag, main promotion or software `1.0.0`.

## Candidate and regression identity

Launch worktree: `codex-1290-beta-validation`, branch `codex/1290-beta-validation`, target `codex/integration-23`, exact integrated S0–S9 base `09e57718c5ca29b24906eada1eca7c3a3c2aadf8`. Original wave baseline is `dev@754f1bdc541f69bc5adf573b9d70116004982cb6` (`0.4.1`).

The final product/package source is `537f7365979ca91abe059291967a9ca30c6305ee`: source tree `b71dd8f941258dad0f8bb698dd91f442a1136c92`, tests `ed11f6adc08eaeecccf4a1d4c5326cc6a41dd557`, configuration `8e2693a84422ede7b5eb3515a7f2d9daf81e5d4f`. Later manual runner/documentation changes preserve that product source. Software is **0.5.0**, schema **107** (additive), Data Version **1**, protocol **196**.

| Verification | Exact scope and result |
| --- | --- |
| `pnpm run check` | Final product source; documentation/version/type checks pass |
| `pnpm test` | 4,110 pass / 6 skip, 74.87s at source-equivalent `9617`; same product source and unchanged unit files |
| `pnpm run test:service` | Final product/test tree, 2,018 pass / 11 skip, 591.01s, bounded four workers |
| `pnpm run build` | Final product source passes |
| Full admitted Journeys | Guest01 at `774e04939b80455367d4af58eab81e1917e6d3e8`: doctor/build/package/all 15 pass (30/175/1,369s) |
| Delivery repair | `fb0bca8c1a1e9d7614f215410202f635f933bebc`: doctor/build/package/J-07 pass (31/174/163s) |
| Final product changes | Guest01 at `537f7365`: doctor/build/package/J-04/J-13 pass (26/165/60/59s) |
| Final retained packaged acceptance | Guest02 runner `e17c21008f93f5d2cc85fe2a85e7af2bbd964912`, frozen build563/source537f: doctor/build 25s, walkthrough resume 260s, pass; finished 03:14:48.702Z |
| Whitespace | `git diff --check` passes |

All Electron executions used the background guest host runner and build before Journey/walkthrough layers. CI and ordinary source Journeys remain provider-free. A prior hosted occurrence at `774e0493` passed its five functional PR Journeys but failed trusted-source publishing separately; that is **not** an overall green hosted Gate. Earlier failed checks, mixed-test-tree exploratory service output and corrected runner assertions remain in local history, separate from the stable results above.

## Windows package and walkthrough

Clean build563 artifacts were independently inspected and retained locally by the Commander:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| NSIS installer | 100,324,016 | `12b9c1449ae072b86274e97e37881db5a8048c684386c68a8a88fc4b860615ce` |
| Portable | 164,037,759 | `05cb880a51c4827f1b3cc048de3a55f4c3663953cf295c4e7f792fea6d3f7d77` |

The 2,481-entry package inspection found no Public SampleBooks, development keys, test databases or provider cache. Embedded identity and package startup self-check passed. The artifacts are unsigned. External users still need their own accounts and human Beta feedback remains required.

The actual installed/Portable workflows cover Go model discovery (28 models), independent main/fast selection and compact switching; real Brave/Bocha search; native DOCX import with both selected revision readings and source-linked endnotes; baseline/FullReview/factual controls and explicit claim/synthesis gaps; adoption/rejection; cross-paragraph selection and continuous Enter/merge; book Agent proposal rounds and exactly one promotion; streamed global dialogue with `retrieve`/`exact_fetch`, habit summary and style display; native DOCX and delivery ZIP export. OpenAI, Claude, Gemini and direct DeepSeek accounts were unconfigured and have no live-success claim.

These are a retained sequence, not a rerun of every paid operation under build563:

| Original execution | Retained result |
| --- | --- |
| build519 / `db525067a27a13bf12104713026a3204d4a7a13d` | Installed discovery/settings/search/import/edit/baseline and FullReview `19ad0790-2c5b-410c-8ed5-56abd44571fb` |
| build538 / `5328fc484231e032177d134d91cee091b29a62af` | Separate tester-edited English fact, seven retained translations, two Agent proposal rounds and one promotion |
| build550 / `4f0d1b87ace6115e1e9515b2ffb96a00e2bc795b` | Global tools/habits, substantive retained NASA original/translation UI, faithful installed DOCX |
| build557 / `fb0bca8c` | Successful delivery ZIP; installed backup/crash/reinstall; Portable 0.4.1 migration, data-root isolation and supported full-backup carry |
| build563 / `537f7365` | Restored review history before model enrollment; fresh accepted-baseline import/export; exactly one new Portable contextual streaming turn; retained translation/Agent/global/habits; Portable backup/restore/crash and final uninstall/data retention |

Portable's own previous 0.4.1 Book was verified before supported full-backup replacement; replacement correctly substitutes the backup's Books. The original migration markers and immutable replacement receipt remain evidence even though the final resumed report does not duplicate all earlier markers. The ordinary restored review no longer crashes when its historical repeated-factual intent is read without a current model; this does not authorize a new task.

Native exports preserve source images, source Word comments, exact endnote/header bytes and semantic table presentation. Legitimate comment-range markers and run splitting explain the initial raw table-XML mismatch; independent normalization plus negative width/text/bold/dangling-comment controls establish fidelity. Accepted-baseline export contains no pending Word insertion/deletion marks. Delivery ZIP is 12,343 bytes, SHA-256 `1712bec8f7ccbce17ab801ce9e97aec756ad38ec626d5924154eefe19f623c1d`: publication DOCX, `交付包清单.md` and `checksums.txt`. Exact member hashes, frozen content/limitations and successful native receipt were verified. The earlier runner incorrectly required JSON; its correction reused the successful archive without another export.

## Editorial quality: scope and limitations

The original whole-five-book attempt remains historical and incomplete. Its existing ordinary pause controls drained PID3872 normally at 03:21:47.979Z on 2026-11-03; the queue was empty and sent calls settled. It was not killed, rerolled, relabeled complete or rewritten into the later sampling scope.

The revised deterministic manifest selects level-one content chapters in source order, excluding preface/postface entries, at positions first/lower median/last. It fixes three **disjoint** chapter scopes per book. Source/range/block hashes and actual imported chapter identities are retained locally; the not-yet-imported 儒林 source has parser identities pending ordinary import.

| Public SampleBook | Selected content chapters | Source block ranges | Analysis units |
| --- | --- | --- | ---: |
| 朝花夕拾 | 狗·猫·鼠 / 无常 / 范爱农 | 9–28 / 109–145 / 268–324 | 14 |
| 呐喊 | 狂人日记 / 风波 / 社戏 | 28–119 / 329–389 / 955–1006 | 24 |
| 老残游记 | 1 / 10 / 20回 | 9–35 / 246–275 / 552–590 | 16 |
| 儒林外史 | 1 / 28 / 56回 | 2–28 / 424–439 / 809–868 | 18 |

The planned sample has 72 units, 648 nine-category unit slots: 150 existing selected closed slots reusable and 498 missing. A new per-chapter FullReview would add 288 model-member unit slots. Extraction closure does not prove factual claim closure; whole-run synthesis remains whole-run context and is not relabeled chapter execution. This manifest is a plan, not completed new measurement.

Retained sample1 FullReview `3eb3771a-fc38-4a9e-9525-e37763a804a1` settled all five members and all eight reading units. Its 46 extracted assertions yield 26 eligible claims and 20 exclusions: **23 closed / 3 unfinished / 0 unstarted**. Its original paid window was 22:32:47–23:49:39 UTC under attempt3300 / source `f97414b3bf102c1d0a0f9cac348af6b6afebe5cf`; later observers did not buy replacement results. Exactly 13 inherited claim states were corrected in the read model while all 26 canonical findings/histories stayed unchanged.

Sample1 standalone reading coverage is 70/72 category-units: seven categories close all 8/8 units; typos retains an unknown outcome at unit8 (blocks93–97), academic integrity at unit1 (blocks1–15). These are genuine gaps in a full-input measurement, not omitted sampling or permission to repeat an unknown request. FullReview reading completion does not erase either standalone gap.

Separate packaged FullReview19ad retains an unknown style synthesis and factual **10 closed / 1 unknown / 5 unstarted** of 16 eligible claims. Its 36 evidence rows contain zero qualified translated foreign passages. The separate English functional case has seven translations: four useful/complete and three abbreviation-truncated; the preserved positive NASA passage has exact original UTF-16 range850–958. Its translation UI is functional evidence, not proof that the original FullReview cited foreign evidence. No unknown request was resent.

AI-assisted examinations below are small separate strata, not the independent human editor study or a population precision/recall estimate. Findings overlap, so counts are not pooled.

| Stratum | Examined | Useful | False positive | Uncertain |
| --- | ---: | ---: | ---: | ---: |
| Earlier unchanged-input standalone | 31 | 3 | 16 | 12 |
| Controlled comparison/title defect | 3 | 2 | 1 | 0 |
| Nonfactual composite typos/style/plot | 9 | 1 | 7 | 1 |
| 呐喊 typos first/middle/last findings | 3 | 0 | 1 | 2 |
| 呐喊 style first/middle/last findings | 3 | 1 | 1 | 1 |
| 呐喊 plot first/middle/last findings | 3 | 0 | 3 | 0 |

The controlled comparison's two useful cards detect the same one planted defect; it is separate from the later Agent duplicate-character functional probe. 呐喊 typo location integrity was 179 located / 180 listed (99.44%); all 179 located quotations/ranges/hashes independently matched. That does not establish semantic correctness. Thirteen real Brave→Bocha fallback rounds have durable lineage; 29 capture pairs with no omitted fetch invocation do not prove recovery from a failed fetch.

| Closed measurement | Model transmissions | Known input/output tokens | Active / wall time |
| --- | ---: | --- | --- |
| sample1 FullReview | 301 | 2,298,301 / 326,653 | 4,612,623 / 4,612,623ms |
| 呐喊 typos including continuations | 255 | 1,268,599 / 401,831 | 1,666,055 / 9,487,355ms |

The settled original-campaign ledger snapshot has 3,548 model-call rows: 3,515 transmitted, 18 replayed and 15 failed/outcome-unknown; known usage is 26,498,818 input / 4,393,994 output tokens, with 15 unknown usage outcomes. Closed execution windows allocate costs without collisions; composite members are counted once. This includes older attempts and is not a bill for only the revised sample. Wall time includes pauses. No currency estimate is substituted for the account's actual bill.

## Local retention for possible future mock reuse

Raw data remains outside Git, CI and distributions at the developer's local `ai7-development-evidence/w23-s10` root. `local-recordings/quality-checkpoint-0321` retains 10,596 provider-cache ledger/entry/claim files and 48 execution/source/dialogue tables; `local-recordings/packaged563` retains 96 such tables from installed and Portable stores. Hash inventories accompany both archives. Capture gaps, original synthetic/replay/transmitted labels and unknown outcomes remain explicit. Historical missing HTTP/SSE bytes are not reconstructed and paid calls are not repeated to fill gaps.

The [developer workflow owner](../agents/project-constraints.md#local-records-of-real-development-calls) now requires local retention for subsequent authorized real development calls. The manual-only transport recorder preserves available exact request bodies and response/stream bytes with identities, hashes and unknown outcomes, excluding credentials/headers/query strings/exception prose. Its focused four-case provider-free validation passes. Nothing enables customer telemetry or automatically admits these records as mock fixtures.
