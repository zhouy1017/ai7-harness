# Public SampleBooks

The repository admits exactly five manuscript files: `sample1.docx`, and the four public-domain
works [ADR 0091](../docs/adr/0091-admit-four-public-domain-works-as-public-samplebooks.md) admits —
`luxun-zhaohua-xishi.docx` 《朝花夕拾》, `luxun-nahan.docx` 《呐喊》, `liue-laocan-youji.docx`
《老残游记》 and `wujingzi-rulin-waishi.docx` 《儒林外史》, the long-book case — each by the exact
bytes and SHA-256 listed under "The admitted files" below. Beside them sits
`public-samplebooks.json`, the designation record the four are generated from.

Under ADR 0091, decided by the Owner on 2026-10-19
([Issue #989](https://github.com/zhouy1017/ai7-harness/issues/989)), the four are Public SampleBooks
exactly as `sample1` is: tracked, and provider-free input to local tests, the background test guests
and hosted CI. ADR 0091 also authorizes their `developer-live` transmission exactly as `sample1`'s;
they become transmittable when slice 15c ([#990](https://github.com/zhouy1017/ai7-harness/issues/990))
lands their digests and the policy revision that names them. None of the four ever enters an
application package, installer, portable zip or release asset — packaged builds keep 示例书尚未提供 —
and development onboarding keeps importing exact `sample1`.

Under [ADR 0079](../docs/adr/0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md) §5, decided by the Owner on 2026-09-10, the admission
[ADR 0043](../docs/adr/0043-allow-public-samplebooks-in-repository-and-ci.md) granted to the six files
[Issue #32](https://github.com/zhouy1017/ai7-harness/issues/32) designated is superseded for five of
them. Slice S88 ([#438](https://github.com/zhouy1017/ai7-harness/issues/438)) removed those five from
the tree; `.gitignore` refuses them by name and refuses any other manuscript, derivative, or
subdirectory under `SampleBooks/`. Git history was not rewritten: the files were the Owner's own
designation, and a history purge on the protected lines is a separate Owner action if ever wanted.

## What the five files are now

They are **local-only test material**. A developer who has them keeps them in the untracked source
directory named under "The admitted files" below — or, equivalently, beside `sample1.docx` in this
directory, which Git now refuses — and the tests and Journey runners that can only be shown on one
of them look for it there:

- `AI7_LOCAL_SAMPLEBOOKS`, when set to an absolute directory, names where they live.
- Otherwise the checkout's own `SampleBooks/` is searched, so dropping a file back beside `sample1`
  is enough to run the gated cases.

Under [ADR 0084](../docs/adr/0084-admit-the-legacy-doc-to-the-background-test-guests-for-j-01.md),
decided by the Owner on 2026-09-19, one of the five — the legacy `.doc` — is also held by each
background test guest on the development host, outside the guest's checkout at
`C:\ai7\local-samplebooks\`, so that J-01's `doc-manuscript` scenario runs there. It is placed
there only as an Owner action: materialized from the repository history the guest's clone already
holds, and accepted only when the byte count and SHA-256 match the allowlist row below. The guest
runner names that directory in `AI7_LOCAL_SAMPLEBOOKS`, so the `.doc`-gated unit and service cases
in the table below find it there too. The other four files are never materialized on a guest, and
no agent copies any of the five to a guest or extracts one from repository history.

Absent, every such case skips rather than fails, and a skipped Journey scenario is disclosed by name
in the run output rather than left invisible. That is the normal state on every CI host: the hosted
Gate admits no untracked source or personal path as an input
([CI and test boundaries](../docs/agents/ci-test-boundaries.md)). What is gated today:

| Local-only material | What only it can be the subject of |
| --- | --- |
| `3天兽（定稿395870字)##＊.doc` | Legacy binary `.doc` conversion — J-01's `doc-manuscript` scenario, `tests/unit/doc-manuscript.test.ts`, and the `.doc` group of `tests/service/manuscript-intake.test.ts`. No generator for the format exists. |
| `2听漏（定稿368544字）.docx` | Blocks carrying real heading styles, which exact `sample1` has none of — the style-mapping case in `tests/unit/composed-fixture.test.ts`. |

No derivative of the five ever enters the repository: not a fixture, not a cache export, not any
generated text carrying their content. Local tests may read the local files. The `developer-live`
transmittable set is the five admitted files below — exact `sample1` and, since slice 15c (Provider Processing
v24, active-set v16), the four ADR 0091 works — each only by its exact digest, and none of the five local-only
files may be transmitted to a model under any scope.

## What still composes from admitted content

Every composed manuscript fixture and every content-bearing Journey input now excerpts exact
`sample1`: J-08's three non-overlapping inputs (blocks 1–40, 41–70 and 71–95 of its 97), J-01's
`.txt` intake text, and the `tests/service` builders of
[Issue #311](https://github.com/zhouy1017/ai7-harness/issues/311). Composing from `sample1` does not
produce `sample1`: the builder writes its own container, whose digest is pinned as never equal to
`sample1`'s, so a composed input can never stand in for the ADR 0044 baseline.

## The admitted files

| Exact path under `SampleBooks/` | Admitted by | Bytes | SHA-256 | Blocks | Characters |
| --- | --- | ---: | --- | ---: | ---: |
| `sample1.docx` | ADR 0043, ADR 0044, ADR 0079 §5 | 29550 | `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483` | 97 | 8289 |
| `luxun-zhaohua-xishi.docx` | ADR 0091 | 61890 | `9d515a2245a158bbbcbdb8139e3877d5ee36437ce25a0924b92516c90f973cc7` | 372 | 40747 |
| `luxun-nahan.docx` | ADR 0091 | 98880 | `13afe4783cd2c82f77c99582c62df0fcf13e3aa72ef562fe1d023bf11f1182d3` | 1006 | 69574 |
| `liue-laocan-youji.docx` | ADR 0091 | 151564 | `db25d1a9afe8d3672a789ae8d37a84bc1f8464b014d8621f2403795814cacb8f` | 590 | 109766 |
| `wujingzi-rulin-waishi.docx` | ADR 0091 | 425444 | `2d59edf22ecdb3dbcb7a62c0d7b56daadd066c3349dbeee78bf92f7d59074581` | 868 | 327716 |

Total in the repository: 5 manuscript files, 767,328 bytes, beside this README and the designation
record `public-samplebooks.json`. Blocks and characters are what the ordinary import counts
(`parseDocx`, parser identity `ai7-docx-fflate-saxes/3`); see "Import verdicts".

### `sample1.docx`

The original source is the ignored, untracked `SampleBooks/` directory in the local
worktree `C:\Users\Chooo\codebase\ai7-harness` beside
`main@c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9`. Because those files were not Git
objects, their source identity is the Owner designation plus the exact path, size,
and SHA-256 allowlist above. The repository copy of `sample1.docx` is byte-for-byte identical.

### The four ADR 0091 works

Their source identity is the designation record `public-samplebooks.json`: for every work the ordered
zh.wikisource.org pages, each pinned by its revision id; for a page that transcludes scanned `Page:`
pages (all fifteen of 《呐喊》's), the revision of each of those 192 pages; the pin date (2026-10-19);
the request `action=parse&oldid=<revid>&variant=zh-hans`; and the conversion, MediaWiki's own
LanguageConverter. No character was edited by hand.

| File | Work | Author (died) | Pages | Revisions |
| --- | --- | --- | ---: | --- |
| `luxun-zhaohua-xishi.docx` | 《朝花夕拾》 | 鲁迅 (1936) | 12 | 2323066–8657586 |
| `luxun-nahan.docx` | 《呐喊》 | 鲁迅 (1936) | 15, transcluding 192 scan pages | 2523886–11120768 |
| `liue-laocan-youji.docx` | 《老残游记》 | 刘鹗 (1909) | 21 | 2367222–2598346 |
| `wujingzi-rulin-waishi.docx` | 《儒林外史》 | 吴敬梓 (1754) | 56 | 1565053–2648156 |

<details><summary>Every page and its pinned revision</summary>

- 《朝花夕拾》: `朝花夕拾/小引` 2323066 · `狗·猫·鼠` 8657586 · `阿長與《山海經》` 2563428 · `二十四孝圖` 2563431 · `五猖會` 2563954 · `无常` 2637162 · `從百草園到三味書屋` 7903272 · `父亲的病` 2563957 · `琐记` 2563958 · `藤野先生` 2607921 · `范愛農` 2563960 · `朝花夕拾/後記` 2563961
- 《呐喊》: `吶喊` section 2 (自序) 11120768 · `狂人日記` 2605391 · `孔乙己` 2605389 · `藥` 2523886 · `明天` 2524371 · `一件小事` 10675925 · `頭髮的故事` 2525914 · `風波` 2629202 · `故鄉` 2570945 · `阿Q正傳` 2633268 · `端午節` 2673910 · `白光` 2687312 · `兔和貓` 8736224 · `鴨的喜劇` 9458356 · `社戲` 10605419
- 《老残游记》: `老殘遊記/自敘` 2598346 · `老殘遊記/第01回` 2367222 · `/第02回` 2367223 · `/第03回` 2367233 · `/第04回` 2367238 · `/第05回` 2367240 · `/第06回` 2367239 · `/第07回` 2367225 · `/第08回` 2367237 · `/第09回` 2367229 · `/第10回` 2367227 · `/第11回` 2367228 · `/第12回` 2367226 · `/第13回` 2367234 · `/第14回` 2367224 · `/第15回` 2367235 · `/第16回` 2367231 · `/第17回` 2367236 · `/第18回` 2367232 · `/第19回` 2367230 · `/第20回` 2367241
- 《儒林外史》: `儒林外史/第01回` 2648156 · `/第02回` 1565053 · `/第03回` 1565054 · `/第04回` 1565055 · `/第05回` 1565056 · `/第06回` 1565057 · `/第07回` 1565058 · `/第08回` 1565059 · `/第09回` 1565060 · `/第10回` 1565061 · `/第11回` 1565062 · `/第12回` 1565063 · `/第13回` 2329825 · `/第14回` 1565065 · `/第15回` 1565066 · `/第16回` 1565067 · `/第17回` 1565068 · `/第18回` 1565069 · `/第19回` 1565070 · `/第20回` 1565071 · `/第21回` 1565072 · `/第22回` 1565073 · `/第23回` 1565074 · `/第24回` 1565075 · `/第25回` 1565076 · `/第26回` 1565077 · `/第27回` 2413606 · `/第28回` 1565080 · `/第29回` 1565081 · `/第30回` 1565082 · `/第31回` 1565083 · `/第32回` 1565084 · `/第33回` 1565085 · `/第34回` 1565086 · `/第35回` 1565087 · `/第36回` 1565088 · `/第37回` 1565089 · `/第38回` 1565090 · `/第39回` 1565091 · `/第40回` 1565092 · `/第41回` 2157954 · `/第42回` 1565094 · `/第43回` 1565095 · `/第44回` 1565096 · `/第45回` 1565097 · `/第46回` 1565107 · `/第47回` 1565098 · `/第48回` 1565099 · `/第49回` 1565100 · `/第50回` 1565101 · `/第51回` 1565102 · `/第52回` 1565103 · `/第53回` 1565105 · `/第54回` 1567662 · `/第55回` 1565106 · `/第56回` 1567657

</details>

**Shape.** A `Title` paragraph with the work's title; per page a `Heading1` with the page's own title
(a 回 novel's chapter line; an essay's or a story's title; 自序 for 《呐喊》's preface); a `Heading2`
where the original text has a heading of its own (the numbered parts of 《狂人日记》 and 《药》, the
nine chapters of 《阿Q正传》); and one body paragraph per source paragraph or verse line. No inline
style and no page setup.

**What was dropped, and where the record declares it.** Header and navigation templates, the
上一回/下一回 bars, license and sister-project boxes, images, edit links and the discussion link are
dropped everywhere. Beyond that, each page's manifest entry declares what it loses, and the generator
refuses a build in which a page loses anything its entry does not declare:

- `footnotes` — the reference markers of modern annotations, whose texts are never copied: 10 on
  `父亲的病`, the only page that has any, together with its reference list.
- `editorNoteDigests` — SHA-256 of every Wikisource note dropped, in order, without copying the note text: the 另作 readings shown on hover
  (`朝花夕拾/小引` 1, `一件小事` 1, `社戲` 5, `儒林外史/第03回` 1, `儒林外史/第55回` 7), one
  pronunciation gloss in `儒林外史/第01回`, and two compiler's edition labels in `儒林外史/第55回`.
- `variantChoice` — `儒林外史/第55回` closes with two alternative final paragraphs, one per edition,
  each headed by a compiler's label. The file keeps the 五十六回版本 paragraph and drops the
  五十五回版本 one, consistent with the designation's 第01回 to 第56回; the Commander chose this for
  #989.

No page needed a 注释 section removed. `老殘遊記/自敘`'s body repeats its title as a heading, which is
dropped once rather than kept twice.

**Spot checks** (measured by a throwaway probe over the extracted text; counts only):

- Simplified characters: none of 68 traditional-only characters
  (這們說國來時會為與還過對開見關點經發學問題實現讓間氣當從應種長門頭東車書將個裡麼樣後給聽話覺錢買賣兒燈讀寫舊亂雖聲紙無兩邊塊歲難幾親愛藥)
  occurs in any of the four. MediaWiki's conversion is not perfect for classical text in general;
  for these pages the check found no residue.
- Navigation and annotation strings: 上一回, 下一回, 目錄, 维基, Wikisource, Discuss, 公有领域, 注释,
  註釋, 脚注, `[1]`, `〈(`, 一作, `http`, `Category`, `Page:` and `Author:` occur nowhere. The few hits
  of 编辑, 注解, 姊妹 and 目录 all sit mid-paragraph in long prose blocks of the works themselves.
- Coverage: per page, the CJK characters of everything MediaWiki rendered minus those kept equals the
  header, license box and declared drops alone — 22 on every 回 page beyond its declared drops, 143 to 159 on the 朝花夕拾 pages
  (298 on `父亲的病` with its footnotes), 98 to 511 on the 呐喊 pages, whose license box names the
  1938 全集's editors — so no paragraph of the works was lost.

**Regenerating.** `node tools/build-public-samplebook.mjs --cache <a directory outside the checkout>`
fetches the pinned revisions through `curl` (only `https://zh.wikisource.org/w/api.php`), keeps the raw
responses in that cache and rewrites the four files; `--check` rebuilds from the cache and compares
with the committed bytes. The tool is development-only: CI, `build`, `package` and the tests never run
it. A pinned revision that disappears, or a transcluded scan page that moved past its pinned revision,
refuses the build rather than producing different text.

### History: the six-file allowlist ADR 0043 admitted

Kept as the record of what was designated and measured. Five of these six rows describe local-only
material today; only the `sample1.docx` row still describes a repository file.

| Exact path under `SampleBooks/` | Bytes | SHA-256 |
| --- | ---: | --- |
| `1蟠虺（修订290326字).docx` | 546758 | `988f5b43445ce357fc2f98a07428d26504650d33f378e6868af62d758d953797` |
| `2听漏（定稿368544字）.docx` | 631075 | `39a3ce58dd53ff9ff157547c573b260979ac226ad571cd6518b1f98a6769cf50` |
| `3天兽（定稿395870字)##＊.doc` | 1173504 | `931d8035946f7689aaaa25c14c5822f46eedc59d23925081ded7b06618d9e4d2` |
| `春歌(一次通读后电子版).pdf` | 4330883 | `a41ebd36e8f1547500571fa9c8ca837e118a4f4b634605a46b2aae6ecb99e78b` |
| `蟠虺.docx` | 43661 | `a45283e6132f8992e71aa924b3ad3504a65c8651895fa92ad8c087305f2fb183` |
| `sample1.docx` | 29550 | `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483` |

Total as designated: 6 files, 6,755,431 bytes.

Under [ADR 0044](../docs/adr/0044-use-sample1-as-compatibility-and-recording-baseline.md), exact `sample1.docx` is also the standing **Sample1 Compatibility Baseline / sample1 兼容性基线** for manuscript-dependent supported journeys. Downstream components consume its imported Book/Manuscript/Revision state rather than each reparsing DOCX. Every exact fidelity signal must be truthfully preserved or disclosed through an explicit initially-unselected degradation decision; a newly discovered representable signal is not a reason to reject or replace this exact baseline. This invariant is not full J-01 or one giant test.

Exact `sample1.docx` may be used as provider-free input to local and hosted-CI
tests, including authoring synthetic test data. A consuming scenario must still
bind the exact admitted input in its own authorized Change Brief. The four ADR 0091 works may be
used exactly the same way, and their test-time compositions stay in disposable test roots as
`sample1`'s do. The five
local-only files may be read by local tests alone: no hosted occurrence, no
fixture, no derivative, and no transmission. A background test guest that holds the legacy `.doc`
under ADR 0084 is, for that file, a local test host within this sentence, not a hosted occurrence or
a transmission.

This admission does not authorize raw manuscript payload in logs, diagnostics,
screenshots, traces, videos, or uploaded artifacts. The five local-only files
have no live-provider use of any kind. Exact `sample1` alone has ADR 0044's future,
separately authorized local manual recording eligibility under Provider Processing
v2; no call, credential setup, or fixture exists now. Raw recording stays in
protected local staging outside repositories, and only a normalized, sanitized,
rights-reviewed and human-reviewed fixture may later enter through a separate
Issue and pull request. Neither exception grants application distribution,
production learning, export, external delivery, publication, Public Release
Permission, or release-asset use. Runtime derivatives remain confined to
disposable external test data roots under the existing cleanup lifecycle.

The four ADR 0091 works carry the same closed boundaries: no raw text in logs, diagnostics,
screenshots, traces, videos, uploaded artifacts, Issues, pull requests or commit messages, and no
distribution, production learning, export, external delivery or publication. Their `developer-live`
transmission is authorized by ADR 0091 §3.2 and implemented by slice 15c; until then they are
admitted but not transmittable. A model fixture derived from one of them enters only through its own
reviewed fixture pull request (ADR 0091 §3.3); the fixture generator's manuscript-echo exemption is
still `sample1`'s alone.

## Import verdicts

### The four ADR 0091 works

Measured for [Issue #989](https://github.com/zhouy1017/ai7-harness/issues/989) on its pull request's
head over base `dev@ae5d2c1e`, with parser identity `ai7-docx-fflate-saxes/3`: a throwaway probe,
deleted before the commit as #297's was, read each file once through `parseDocx` and staged it through
`EditorialStore.stageSelectedManuscript` on a temporary data root. Only counters were captured. Every
file imports without refusal, as an editable import whose title comes from the DOCX title metadata.

| Exact path under `SampleBooks/` | Bytes | Blocks | Title / Heading1 / Heading2 / body | Characters | Longest block | Fidelity | Plan | Staged blocks |
| --- | ---: | ---: | --- | ---: | ---: | --- | --- | ---: |
| `luxun-zhaohua-xishi.docx` | 61890 | 372 | 1 / 12 / 0 / 359 | 40747 | 983 | all categories 0 | `clean-import-no-round-trip` | 372 |
| `luxun-nahan.docx` | 98880 | 1006 | 1 / 15 / 26 / 964 | 69574 | 489 | all categories 0 | `clean-import-no-round-trip` | 1006 |
| `liue-laocan-youji.docx` | 151564 | 590 | 1 / 21 / 0 / 568 | 109766 | 700 | all categories 0 | `clean-import-no-round-trip` | 590 |
| `wujingzi-rulin-waishi.docx` | 425444 | 868 | 1 / 56 / 0 / 811 | 327716 | 1931 | all categories 0 | `clean-import-no-round-trip` | 868 |
| `sample1.docx` — **control** | 29550 | 97 | 0 / 0 / 0 / 97 | 8289 | 506 | `inline-styles` 266, `sections` 1, all other categories 0 | `clean-import-no-round-trip` | 97 |

Characters are the parser's count, punctuation included. 《儒林外史》 is the long case at 327,716
characters. Every count is below the Issue's rounded estimates (about 5万, 8万, 13万 and 40万), by
13 to 19 per cent; the coverage check above shows that this is the pinned pages' own length, not
text lost in extraction. The control row reproduces `sample1`'s known 97 blocks and 8,289
characters, which is what shows the probe read the parser correctly.

### History: the readings of #297, #352 and #351

History, kept as the record these measurements were taken as. Every row but exact
`sample1`'s now describes local-only material, and the `Test input today` column is
superseded by the narrowing above; the counts themselves are unchanged and are what
the gated local-only cases still assert.

Measured at `dev@2b5d3eeed81afbdf4d1cce4c1c84a467fafca92a` with parser identity
`ai7-docx-fflate-saxes/1`, by calling `parseDocx` once per admitted file exactly as
`tests/unit/docx.test.ts` calls it. Any change to `src/service/docx.ts` is a reason to
re-measure. Recorded for
[Issue #297](https://github.com/zhouy1017/ai7-harness/issues/297);
[Issue #313](https://github.com/zhouy1017/ai7-harness/issues/313) designs against this
table and [Issue #311](https://github.com/zhouy1017/ai7-harness/issues/311) depends on
it.

The `Imports at #297's head` column is that first reading. `Imports after ADR 0072 §4`
beside it is the second, measured the same way at the head of the pull request that
closes [Issue #352](https://github.com/zhouy1017/ai7-harness/issues/352), which implemented
[ADR 0072 §4](../docs/adr/0072-admit-multi-format-manuscript-intake-with-docx-as-the-working-representation.md),
with the same parser identity `ai7-docx-fflate-saxes/1`.

`Imports after ADR 0072 §5` is the third, and it concerns one file. At the head of the
pull request that closes [Issue #351](https://github.com/zhouy1017/ai7-harness/issues/351),
the admitted `.doc` is read through converter identity `ai7-doc-to-docx/1` — the
pure-JavaScript legacy-Word reader ADR 0070 §3 pre-authorized — into a DOCX working
representation, which the same parser then reads. The four DOCX files were not
re-measured: neither `src/service/docx.ts`'s parsing nor its bounds moved, and exact
`sample1`'s digests, blocks, and fidelity are unchanged. The PDF was again never opened.
The last paragraph of this section is superseded for the `.doc` alone: intake no longer
decides that file from its extension, so its route is now a conversion rather than a
refusal; the `.pdf` sentence still holds.

Only counters and the parser's own structural refusal messages are recorded here. No
block text, no document title, and no other manuscript-derived string was captured,
printed, or committed; the probe that produced these numbers was a throwaway deleted
before the commit rather than integrated.

A refusal has two layers, and only the outer one is visible to an editor. The parser
throws `DOCX_REJECTED:<structural reason>` (`src/service/docx.ts:84`); `stageSelectedManuscript`
catches it and flattens every reason to one sentence,
`该 DOCX 不符合当前受限本地导入边界。` (`src/service/store.ts:3662`). The structural
reason is what this table records.

| Exact path under `SampleBooks/` | Format | Bytes | Imports at #297's head | Imports after ADR 0072 §4 | Imports after ADR 0072 §5 | Nature | Test input today | Settled decision | Recommendation |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| `1蟠虺（修订290326字).docx` | DOCX | 546758 | No — `non-default terminal section properties` (`docx.ts:316`) | Yes — 4434 blocks, 290325 characters; fidelity `inline-styles` 12424, `sections` 1, `headers-footers` 2, all other categories 0; plan `degraded-import-no-round-trip` | Not re-measured — neither the parser nor its bounds moved | Editable | No <sup>1</sup> | stays admitted; today unimportable; the bounded boundary widens only through its own Issue, which #313's design decides | Accidental narrowing of the parser; worth its own Issue |
| `2听漏（定稿368544字）.docx` | DOCX | 631075 | No — `non-default terminal section properties` (`docx.ts:316`) | Yes — 4577 blocks, 368544 characters; fidelity `inline-styles` 9868, `sections` 1, `headers-footers` 1, all other categories 0; plan `degraded-import-no-round-trip` | Not re-measured — neither the parser nor its bounds moved | Editable | No <sup>1</sup> | stays admitted; today unimportable; the bounded boundary widens only through its own Issue, which #313's design decides | Accidental narrowing of the parser; worth its own Issue |
| `3天兽（定稿395870字)##＊.doc` | DOC | 1173504 | No — `selected file is not DOCX` (`docx.ts:115`), decided from the extension before any byte is read | No — `selected file is not DOCX` (`docx.ts:112`), unchanged; the extension route is S51b's | Yes — converted by `ai7-doc-to-docx/1` into a DOCX working representation the same parser then reads: 5815 blocks, 396107 characters; fidelity `headers-footers` 1, all other categories 0; plan `degraded-import-no-round-trip`; working object `ea5068a74444217fbca9ece5ab572933c007b0d8797f0d1cd3f815314a8213a1` | Editable after conversion | Yes | stays admitted; intake is #313's (V2-UX-IMP-001 admits any format; conversion or source-only retention is that slice's to settle) | Not a parser bound at all; #313 owns it |
| `春歌(一次通读后电子版).pdf` | PDF | 4330883 | No — `selected file is not DOCX` (`docx.ts:115`), decided from the extension before any byte is read | No — `selected file is not DOCX` (`docx.ts:112`), unchanged; the extension route is S51b's | Not opened — source-only by nature, unchanged | Source-only by nature (fixed layout) <sup>2</sup> | No | stays admitted; intake is #313's (V2-UX-IMP-001 admits any format; conversion or source-only retention is that slice's to settle) | Source-only retention under V2-UX-IMP-006; #313 owns it |
| `蟠虺.docx` | DOCX | 43661 | No — `non-default terminal section properties` (`docx.ts:316`) | Yes — 100 blocks, 8359 characters; fidelity `inline-styles` 216, `comments-revisions` 124, `sections` 1, all other categories 0; plan `degraded-import-no-round-trip` | Not re-measured — neither the parser nor its bounds moved | Editable | No <sup>1</sup> | stays admitted; today unimportable; the bounded boundary widens only through its own Issue, which #313's design decides | Accidental narrowing of the parser; worth its own Issue |
| `sample1.docx` — **control** | DOCX | 29550 | Yes — 97 blocks, 8289 characters; fidelity `inline-styles` 266, `sections` 1, all other categories 0 | Yes — unchanged: 97 blocks, 8289 characters; fidelity `inline-styles` 266, `sections` 1, all other categories 0; plan `degraded-import-no-round-trip` with exactly those two degradations | Not re-measured — neither the parser nor its bounds moved | Editable | Yes | usable as test input under #311 | Control row: it reproduces the ADR 0044 baseline, which is what proves the probe read the parser correctly |

<sup>1</sup> Not importable, so not a test input through the bounded path. Its content
may still serve #311's composed-fixture builder, because that builder assembles its own
DOCX container — but only if the builder reads the admitted file by some path other than
`parseDocx`, which refuses it.

<sup>2</sup> A by-design expectation from the format, not a measurement: the file was
never opened. #313 decides it.

**The second reading closes the table: all four admitted DOCX files import.** The two
conditions the paragraphs below describe are exactly the ones #352 removed — the
body-level terminal `sectPr` is now counted in the `sections` class instead of matched
against `sample1`'s shape, and `deriveImportFidelityPlan` plans any well-formed report
instead of the all-zero or `sample1`-exact projection. Each newly importing file carries
`降级导入` or `不支持导入` counts, so each arrives with an explicit Import Degradation
Decision (V2-UX-IMP-005) rather than a refusal; `蟠虺.docx`'s 124 comment and revision
marks are dropped content the editor accepts in that same decision, not a blocking case.
Exact `sample1` is unchanged, which is what proves the widening did not move the ADR 0044
baseline. The `Settled decision` and `Recommendation` columns and footnote 1 remain #297's
own reading at its own head; footnote 1's "not importable" no longer holds, so all three
files are now readable through `parseDocx` for [Issue #311](https://github.com/zhouy1017/ai7-harness/issues/311).

**Three of the four admitted DOCX files refuse, not two.**
`1蟠虺（修订290326字).docx` had never been attempted before this measurement and refuses
for the same reason as the two already known. Only exact `sample1` imports.

**What fires first, and why it reads as accidental.** All three DOCX refusals stop at
`src/service/docx.ts:316`, on the body-level `<w:sectPr>` attribute set. An accepted
terminal section must carry either no attributes at all — with no child elements
(`docx.ts:339`) — or exactly `rsidR` and `rsidRPr` with children exactly `pgSz`, `pgMar`,
`cols`, `docGrid` (`docx.ts:341`). The second shape is `sample1`'s own, named `'sample1'`
in the code, and `parseDocx` then refuses even a matching document unless it is
byte-exact `sample1` (`docx.ts:647-650`). So the branch admits exactly two documents: a
synthetic zero-attribute container, and `sample1`. That is a fingerprint of the baseline
rather than a boundary any requirement or ADR chose. No design record makes section
properties a precondition for import: V2-UX-IMP-002 lists sections as a fidelity
*category* to classify, the parser's own `sections` category already carries a
`降级导入` label and detail, and V2-UX-IMP-005 makes an explicit Import Degradation
Decision the design's answer to degradation. Refusing the file forecloses the decision
the design says the editor should get to make.

**A second gate stands behind the first.** This is read from the code, not measured —
these files never reached it. Even with the terminal-section condition widened, a
document with any inline style would then be refused at `docx.ts:661`
(`document uses a fidelity branch outside the bounded import`), because
`deriveImportFidelityPlan` admits only two projections: all-zero, or `sample1`'s exact
266/1 shape at `sample1`'s exact digest and byte count (`docx.ts:615-632`). Widening the
bounded import is therefore not a one-line change; the Issue that takes it on faces two
gates in series.

**These are narrowings, not the parser's safety bounds.** The archive, entry-count,
entry-size, ZIP-ratio, XML nesting, DTD and entity, path-traversal and active-content
checks are deliberate hardening against hostile input, and none of them fired for any
admitted file. Nothing here recommends relaxing them. The two conditions above are of a
different kind: they encode what `sample1` happens to look like.

**`.doc` and `.pdf` are refused on the extension**, at `docx.ts:115` inside
`safeDisplayName`, called from the first statement of `parseDocx` (`docx.ts:641`). The
file is never opened, so this measurement says nothing about whether either file's
contents could be read. `stageSelectedManuscript` adds no separate format gate of its own
(`src/service/store.ts:3589`), so `parseDocx` is the entire intake boundary today.
