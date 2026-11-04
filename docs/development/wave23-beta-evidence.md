# Wave 23 Windows Beta candidate evidence

This records [#1290](https://github.com/zhouy1017/ai7-harness/issues/1290) under [Owner intent #1279](https://github.com/zhouy1017/ai7-harness/issues/1279) and [PR #1301](https://github.com/zhouy1017/ai7-harness/pull/1301). Software **0.5.0 Beta**, Data Version **1**, additive schema **107**, protocol **196** remain a candidate. Human Beta acceptance and the independent editor study are pending. [Wave integration PR #1302](https://github.com/zhouy1017/ai7-harness/pull/1302) targets dev and remains a separate Commander-owned draft; dev integration and its final exact-head Gate are pending. No release, tag, main promotion or `1.0.0` is authorized.

## Source and verification

Launch worktree `codex-1290-beta-validation`, branch `codex/1290-beta-validation`, target `codex/integration-23`; integrated S0–S9 launch/base `09e57718c5ca29b24906eada1eca7c3a3c2aadf8`. Original wave baseline is `dev@754f1bdc541f69bc5adf573b9d70116004982cb6` (`0.4.1`). Product/package source is **`432267ceb5a9334b0a50ab805235dbb56edfcc00`**, source tree `0490f4cbbc322b5eed3cbbfacbd369ef3bf5444a`, configuration `8e2693a84422ede7b5eb3515a7f2d9daf81e5d4f`, clean Windows build **603**. Later documentation handoff keeps those product/configuration trees; final exact-head checks and Gate disposition belong to the PR.

| Verification at product432267ce | Observed result |
| --- | --- |
| `pnpm run check` | 275 active documents, type/version checks pass |
| Bounded full unit suite | 4,140 pass / 6 skip, 294 files, 87.60s, four workers |
| Full service suite | 2,026 pass / 11 skip, 156 files, 585.48s, four workers |
| Build / whitespace | `pnpm run build` and `git diff --check` pass |
| Guest02 exact-source package/Journeys | build34s/package190s/J-04 62s/J-12 56s, all exit0 |
| Installed/Portable provider-free smoke | build28s/smoke41s, six exact search returns; analysis7/dialogue6/translation0 attempts unchanged; cleanup completed |

The initial unbounded unit run at predecessor7303eeba retained four subprocess/test timeouts (4,136 pass / 6 skip). The four affected files pass118 tests with two workers, followed by the passing bounded full suite. No timeout threshold was weakened. Verification manifest: `assessments/verification-432267ce.json` (SHA-256 `a6dc2458e821b13018b597833a0775d290c8be1767251bcdba42d8f73c98936b`). The portable smoke retains a readiness-expression TypeError (code null) whose exact expression is unavailable; final UI/action assertions pass. This is not an exception-free-run or app-crash claim.

Historical Full Gate [41614056628](https://github.com/zhouy1017/ai7-harness/actions/runs/41614056628) passed all15 Journeys and its same-run publisher at exact `5a00ef0af53bfc467a81cc41a470f4727246bb58`, with its J-01 local-DOC-absent skip. It is not the Gate for a later head. Root owns final Ready, exact-head Full Gate, serial integration and #1279 progress.

## Windows delivery and retained native acceptance

| Build603 artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| AI7-0.5.0-win-x64-setup.exe | 100320626 | `8b43ebc6929297320de9c7fa93a384ecff7317afe9c9f30da3ecd2fd59ec4263` |
| AI7-0.5.0-win-x64-portable.zip | 164038959 | `24424eda68a8cab37398a27a32a7882239218ea3d766490a20cce4d2e92cdd7a` |

Local delivery is `release/wave23/432267ce` in the main checkout, preserving older packages. Package self-check and the2,481-entry Portable inspection pass: empty `data/`, no first-party source/tests/docs, SampleBooks, keys, SQLite or protected payloads. There are175 third-party zod test entries; the package is not described as containing no vendor tests. Artifacts are unsigned. Package metadata: `assessments/package603-432267ce-metadata.json` (SHA-256 `0aee5ab5e8699a1fcdeef9d1cc18a8bb5a1af1b3e7b5071bbd7840a662cca4c4`).

| Original paid/native checkpoint | Retained result |
| --- | --- |
| 519 / db525067 | Go28-model discovery, Main/Fast selection, search, both DOCX revision modes, baseline and FullReview19ad |
| 538 / 5328fc48 | Separate edited English fact, seven translations (four complete/three truncated), two Agent rounds and one habit promotion |
| 550 / 4f0d1b87 | Global streaming/tools/habits; exact NASA source/translation and faithful DOCX, images/comments/endnote/header/table proofs |
| 557 / fb0bca8c | Successful12,343-byte delivery ZIP; installed backup/crash/reinstall; Portable0.4.1 migration/isolation/full-backup carry |
| 563 / 537f7365, runner e17c2100 | Complete six-flow package acceptance, restored review history, accepted-baseline faithful native DOCX, exactly one Portable contextual stream, backup/restore/crash/uninstall/data retention |

Build563/source `537f7365979ca91abe059291967a9ca30c6305ee` acceptance passed with build25s/resume260s. The successful delivery ZIP SHA-256 is `1712bec8f7ccbce17ab801ce9e97aec756ad38ec626d5924154eefe19f623c1d`: publication DOCX, `交付包清单.md` and `checksums.txt` satisfy the actual archive/receipt contract; an obsolete runner JSON-manifest assertion was repaired without another export. Later source checks never relabel these earlier paid/native flows. The build592 receipt was recovered from original retention, not rerun. Credentials were supplied through the existing admitted enrollment helper and encrypted relay; literal API-key typing in Settings was not independently established. Tracked side-note revisions outside the supported DOCX compiler profile remain explicitly unsupported. Unconfigured provider accounts have no live-success claim.

## Editorial measurement scope and reading closure

Owner-approved scope is **sample1 full; fixed first/lower-middle/last content chapters of the other four admitted Public SampleBooks**. Original whole-book attempts remain incomplete history. Source wording/order, exact hashes and block mappings are retained; excerpt completion is never original whole-Book closure.

| Public SampleBook | Selected chapters | Original source block ranges | Analysis units |
| --- | --- | --- | ---: |
| 朝花夕拾 | 狗·猫·鼠 / 无常 / 范爱农 | 9–28 /109–145 /268–324 | 14 |
| 呐喊 | 狂人日记 /风波 /社戏 | 28–119 /329–389 /955–1006 | 24 |
| 老残游记 | 1 /10 /20回 | 9–35 /246–275 /552–590 | 16 |
| 儒林外史 | 1 /28 /56回 | 2–28 /424–439 /809–868 | 18 (8/7/3) |

Final requested reading slots: **639/648 standalone**, **269/288 composite members**. These are checkpoint observations, separate from evidence closure and semantic correctness. Claim-only successors add no reading slots or extraction closure. Scope report: `assessments/chapter-scope-status-final-432267ce-provider-corrected.json` (SHA-256 `d78ed6a072b3b69f3ac256c43cf203306e8bf84d0f73ca59761fa0e20faa21f3`).

| Book | Standalone closed/requested | Composite closed/requested |
| --- | ---: | ---: |
| luxun-zhaohua-xishi | 124/126 | 54/56 |
| luxun-nahan | 212/216 | 96/96 |
| liue-laocan-youji | 143/144 | 57/64 |
| wujingzi-rulin-waishi | 160/162 | 62/72 |

Sample1 full-input standalone coverage stays70/72; typo unit8 and academic-integrity unit1 unknowns are held. FullReview3eb3771a settles all five members over8 reading units;46 assertions yield26 eligible/20 excluded,23 closed/3 incomplete/0 unstarted. Its301-send original window consumed2,298,301 input/326,653 output tokens over4,612,623ms. Correcting13 derived historical states did not rewrite26 canonical findings/histories. Separate packaged FullReview19ad retains its own gaps and is not substituted for this measurement.

Rulin MIDDLE plot7 retains malformed JSON (HTTP200/finish stop,266 codepoints; four exact native requests/four replays, no unknown). Its factual extraction4 has valid JSON but one extra assertion field outside the frozen contract (HTTP200/stop,1,369 codepoints). Neither establishes a parser or truncation defect; both original gaps remain, without paid retry. Laocan LAST extraction5 malformed JSON and all earlier transport-unknown reading/claim gaps also remain. Rulin LAST claim30 received complete HTTP200/finish stop valid JSON but used an invalid evidence-relation enum; the unchanged parser correctly retained an incomplete result, without retry. MID claim24 likewise received complete HTTP200/stop valid JSON with a wrong schema identity, correctly retained as incomplete/failed without a successor result or retry. MID claim35 retains the same failed/incomplete outcome for a269-grapheme excerpt beyond the200-grapheme contract bound, with known usage and no retry. MID claim43 retains an HTTP sourceRef outside the required HTTPS contract, without successor publication or retry.

Fresh MID preparation exposed stale search selection: an original undispatched factual member and later singleton4c5 shared the prepared frozen-Brave Task despite selected Bocha. Exact authorization/version/execution binding established the actual route. Root-authorized public graceful pause resumed the debugger immediately and drained the active request, retaining6 closed reading units,43 eligible/12 excluded claims,7 closed zero-source outcomes and21 receivedBrave402 searches. The product repair now starts a fresh Task when search backend/reference/fallback pins change; authorized plans remain frozen, with provider-free same-Book regressions and no reconfirmation wall.

Supported Bocha claim-only successors retain the exact original claim ledger and separate authorization/binding/cost identities: the earlier21 include20 completed attempts and one held model-unknown (Laocan LAST19); MID covers only7 known-denied and36 untouched frozen claims. No source-backed or transport-unknown request is automatically resent, and no closed/malformed extraction is repeated. Original composite membership and successor mappings remain distinct. Current scope/report artifacts hold the exact final result/session census; settled processing is not sourced truth.

Claim-only successor processing census:64 attempts; Run states completed 60, failed 4; claim-round states closed 60, unknown 1, incomplete 3. Published successor results 60, unpublished 4. Every failed/held outcome retains its exact classification; processing closure is separate from sourced truth.

## Costs, location integrity and semantic baseline

Chapter cost ledger: **6792 new attempts** (6717 returned/75 failed), 141 replays/1 refusal; **66182953 known input/7190766 output tokens**, 75 unknown-usage outcomes. Allocation collisions0/unallocated chapter rows0. Exact case/attempt windows, unknowns and per-case elapsed time: `assessments/chapter-cost-reconciled-final-432267ce.json` (SHA-256 `551845bebbf9feca254c51a5a9802c95f98ca374b5e1653439248da30b7b4be5`). Failed/unknown sends count once; replay is not an additional paid send. No currency estimate replaces the actual account bill.

The earlier original whole-five campaign retains3,548 rows (3,515 returned/18 replay/15 unknown),26,498,818 known input/4,393,994 output tokens and15 unknown usage. Eighteen historical sample1 rows lack a closed metric window and remain explicitly unallocated in that separate campaign. Overlapping archive snapshots are not summed as additional costs.

The selected standalone anchor audit has1,622/1,622 exact persisted located-finding observations, with source pins retained; merged/carried observations are separate. The original Nahan native typo result179/180 located (99.44%) stays distinct. Neither measures all-card recall, semantic precision or unique manuscript defects. Composite anchor audit: `assessments/composite-final-anchor-integrity-final-432267ce.json` (SHA-256 `a1e46acf684c9a3231193de38ab8890b4bc5c46bf4d14fb848fb36bd55b14f60`).

The final baseline has97 separate fixed-sample strata. Useful confirmations, conditional editorial queries, false positives, uncertainty, transport unknowns and confirmed defects retain their own denominators and labels; one technically unevaluable fixed selection is excluded from classified counts. Recovery assessments replace the same selected claim/ordinal and add zero samples. All original sample1/Zhao assessments and the eight legacy inventory files remain included. Full numerical table, original labels, selected indices, superseded prefixes and source hashes: `assessments/semantic-baseline-final-432267ce.json` (SHA-256 `99b9248b4000a92c4658b75f9e3b59a9c2f04bc022bfc0a1507539c46215d1fd`); the single local evidence README contains the complete table.

The earlier controlled comparison has two useful cards describing one planted defect plus one false positive, separate from unchanged-source observations and the later duplicate-character Agent probe. Distinct cards can describe one concept, including overlapping style/plot observations. No pooled population precision/recall, human gold set or independent editor quality estimate is claimed.

## Local retention and remaining delivery limits

Evidence root: `C:/Users/Chooo/ai7-development-evidence/w23-s10`. The final immutable archive/index path is `local-recordings/chapter-final-432267ce`; its actual inventory SHA-256 is recorded in the final PR and the single local evidence README after exact-head checks. That README links original byte/hash inventories, model cache, execution tables, wire captures, supported successor lineages, all semantic strata and package/check manifests. Admitted Public SampleBooks/tester edits only; no secrets or protected manuscripts enter Git, CI, fixtures or distributions. Catalogue/reuse indexes grant no automatic fixture admission.

Original missing stdout/native-cause and capture gaps remain disclosed. Earlier outer-proxy captures cannot recover a native cause; later inner-boundary captures retain only safe finite metadata. ECONNRESET/UND_ERR_SOCKET or absent HTTP/chunks do not identify a resetting peer or establish unsent/unbilled requests. Later successes do not erase earlier unknowns. Ordinary Journeys, CI and the existing Gate remain provider-free. Human Beta approval, external editor study, signing and release remain pending.
