---
status: accepted
date: 2026-10-19
deciders: Owner
supersedes: for exactly the four files of §1 — ADR 0079 §5.1 (the repository admission of exact `sample1.docx` alone) and §5.3 (the `developer-live` transmittable set of exact `sample1`); ADR 0043 "Boundaries that remain closed", the bullet "make a live model/provider call …", for `developer-live` transmission only
amends: `SampleBooks/README.md` (the allowlist), `.gitignore` (the `SampleBooks/` negations), [CI and test boundaries](../agents/ci-test-boundaries.md) (the public-test-material sentences) and [Source checkout](../development/source-checkout.md) (the transmittable-set sentence); cross-reference notes in the headers of ADR 0043 and ADR 0079
---

# 0091 · Admit four public-domain works as Public SampleBooks

Accepted by the Owner on 2026-10-19 in the wave-15 Commander session. The Commander recorded the Owner's answers in Issue #989, quoted in Context; that decision is this record's acceptance.

## Context

Until this record the repository admitted exactly one manuscript, `SampleBooks/sample1.docx`: 97 blocks and 8,289 characters ([ADR 0079](./0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md) §5). No public material exercised a long book, so the `RESPONSE_TOO_LARGE` defect of wave 15 ([#988](https://github.com/zhouy1017/ai7-harness/issues/988)) was found only when the Owner tested the 1.0.0 package by hand on a private manuscript. The five files Issue #32 once designated are local-only test material and may never be transmitted or enter the repository; synthetic text (J-02's ten million generated characters) has the size of a book but not its chapters, paragraphs or prose.

On 2026-10-19 the Owner answered the Commander's questions in the wave-15 session, and the Commander recorded the answers in [Issue #989](https://github.com/zhouy1017/ai7-harness/issues/989):

> The Owner designates four public-domain works as Public SampleBooks under the ADR 0043 pattern: 《朝花夕拾》 (鲁迅, died 1936), 《呐喊》 (鲁迅, died 1936), 《老残游记》 (刘鹗, died 1909) and 《儒林外史》 (吴敬梓, died 1754) — the long-book (~40万字) case.
>
> Admitted uses: the repository, local tests, the background test guests and hosted CI (provider-free), AND developer-live model tests (transmission to the approved Provider exactly as `sample1` today — implemented by slice 15c, authorized by this slice's ADR). NOT admitted: inclusion in any application package, installer, portable zip or release asset (packaged builds keep 示例书尚未提供). Text source: zh.wikisource, converted to simplified Chinese by MediaWiki's own `variant=zh-hans` conversion, each page pinned by its revision id, original text only.

The session's own record of the three answers reads: titles 《朝花夕拾》, 《呐喊》, 《老残游记》 plus 《儒林外史》 for long-book coverage; uses repository and automated tests (local, guests, hosted CI) and developer-live model tests, not bundled into installer or portable packages; source zh.wikisource.org converted to simplified Chinese, revision ids recorded, chapters as headings, original text only with no modern editorial notes.

## Decision

### 1 · Four files

| Exact path under `SampleBooks/` | Work | Author (died) | Wikisource pages |
| --- | --- | --- | --- |
| `luxun-zhaohua-xishi.docx` | 《朝花夕拾》 | 鲁迅 (1936) | 小引, the ten essays, 後記 |
| `luxun-nahan.docx` | 《呐喊》 | 鲁迅 (1936) | 自序 (a section of the index page `吶喊`) and the fourteen stories |
| `liue-laocan-youji.docx` | 《老残游记》 | 刘鹗 (1909) | 自敘 and 第01回 to 第20回 — not 續集, and not 胡適's later 序 |
| `wujingzi-rulin-waishi.docx` | 《儒林外史》 | 吴敬梓 (1754) | 第01回 to 第56回 |

Each file is admitted by its exact byte count and SHA-256, which [`SampleBooks/README.md`](../../SampleBooks/README.md) lists beside `sample1.docx`'s, and by the designation record [`SampleBooks/public-samplebooks.json`](../../SampleBooks/public-samplebooks.json): for every work the ordered Wikisource pages with each page's pinned revision id, for a page that transcludes scanned `Page:` pages the revision of each one, the date the revisions were pinned, the request and the conversion. A file whose bytes differ from its row is not admitted, whatever its name.

### 2 · Source and shape

- **Source.** zh.wikisource.org, each page at its pinned revision, read through `action=parse&oldid=<revid>&variant=zh-hans`. The simplified text is MediaWiki's own LanguageConverter output; no character is edited by hand. Where the conversion leaves a traditional form, as it can for classical text, the file keeps it, and the README states the residual count of the check it ran.
- **Original text only.** Navigation and header templates, the 上一回/下一回 bars, license boxes, sister-project boxes, categories, images, edit links, reference markers and every 注释 section are dropped. Modern annotation may carry copyright, so a page whose original text could not be separated from it would stop the designation; none did.
- **Declared drops.** Each page's manifest entry declares what it loses beyond that furniture — its footnote markers (whose texts are never copied), an ordered SHA-256 digest for every Wikisource note (另作 readings, glosses, compiler's labels), never its text and, where a page carries one closing paragraph per edition, the edition kept — and a build that would drop anything undeclared refuses. `儒林外史/第55回` keeps its 五十六回版本 paragraph and drops the 五十五回版本 one, consistent with the designation's 第01回 to 第56回; the Commander chose this for #989.
- **Shape.** A `Title` paragraph with the work's title; per page a `Heading1` with the section's own title (a 回 novel's chapter line, an essay's or story's title); then one body paragraph per source paragraph, and a `Heading2` where the original text has a heading of its own. No inline style, no page setup, so each file imports through the ordinary path with an all-zero fidelity report.
- **Generator.** `tools/build-public-samplebook.mjs` writes the four files from the manifest — development-only, never run by CI, `build`, `package` or any test. Its archive time is the fixed instant of `src/shared/archive-time.ts`, so a second run from the same responses yields byte-identical files; the raw API responses it fetches stay in a cache directory outside every checkout and never enter the repository.

### 3 · Admitted uses

1. **Repository, tests and CI.** The four files are Public SampleBooks under [ADR 0043](./0043-allow-public-samplebooks-in-repository-and-ci.md), as exact `sample1` is: tracked, and provider-free input to local tests, the background test guests and hosted CI. A scenario that consumes one names the exact file in its own Change Brief; a composed test input built from one at test time stays in a disposable test root, as one built from `sample1` does.
2. **Developer-live.** A `developer-live` Run may transmit any of the four to the approved Provider exactly as it transmits `sample1` today: through the protected credential the enrollment helper placed, under the active Provider Processing policy's allow rule and the existing Run Budget Ceiling and Ledger/Result Cache tooling ([ADR 0065](./0065-admit-a-developer-live-provider-processing-scope.md), [ADR 0067](./0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md), [ADR 0089](./0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md)). This record authorizes it; slice 15c ([#990](https://github.com/zhouy1017/ai7-harness/issues/990)) implements it — the code's transmittable source digests and the policy revision that names them. Until that slice lands, the four are admitted but not transmittable.
3. **Model fixtures.** A Recorded Deterministic Model Fixture derived from one of the four enters only through its own reviewed fixture pull request, under [ADR 0044](./0044-use-sample1-as-compatibility-and-recording-baseline.md)'s admission conditions. Being public domain, its response bodies may keep the work's free text and need no redaction. The fixture generator's manuscript-echo rule (ADR 0079 §5.4) exempts `sample1` alone today; extending the exemption to the four is a later slice's, and until then the generator refuses them as it refuses any other Book.

### 4 · What stays closed

- **No distribution.** None of the four, nor any runtime derivative, enters an application package, installer, portable zip, release asset or other distribution. Packaged builds keep 示例书尚未提供; development onboarding keeps importing exact `sample1` (`importBundledSampleBook`).
- **No payload in evidence.** No raw text in logs, diagnostics, screenshots, traces, videos, uploaded build or test artifacts, Issues, pull requests or commit messages. Reports speak of files, block ranges, digests and counts; chapter titles are the only words of the works an Issue or pull request may name.
- **No production use.** No production learning, House Editorial Memory, adaptation, export, external delivery, publication or Public Release Permission.
- **Provider boundary unchanged.** CI and the background test guests stay provider-free. No credential, Provider route, policy rule or Provider Processing scope changes here; this record writes no policy byte. Outbound product network access stays as ADR 0074 and the egress requirements set it.
- **Baselines unchanged.** Exact `sample1` stays the ADR 0044 Sample1 Compatibility Baseline and the Journey input; no Journey, fixture or test is retargeted by this record.
- **Nothing else admitted.** No other manuscript, edition, translation or derivative is admitted, and the five local-only files of ADR 0079 §5 keep their status. A further work needs its own Owner decision, Issue and pull request.

### 5 · Clauses superseded and amended

| Owner | Clause | Now |
| --- | --- | --- |
| ADR 0079 §5.1 | "`SampleBooks/sample1.docx` is the only manuscript file admitted to the repository, CI and fixtures." | Exact `sample1.docx` and the four files of §1 are admitted to the repository and CI; fixtures follow §3.3. The rest of §5.1 — the five files' supersession, removal and local-only status — is unchanged. |
| ADR 0079 §5.3 | "The `developer-live` transmittable set stays exact `sample1` (S40)." | Exact `sample1` and the four files of §1, effective when slice 15c (#990) lands the transmittable digests and the policy revision that names them. |
| ADR 0043, Boundaries that remain closed | "make a live model/provider call, supply a provider credential, or permit outbound product network access;" | For the four files of §1, `developer-live` transmission is admitted exactly as for `sample1` (§3.2). Credentials, policy rules and outbound product network access are unchanged, and the bullet still binds every other Public SampleBook. |
| ADR 0079 §5.2 and §5.4 | No derivative of the five files; the manuscript-echo rule exempts `sample1` | Unchanged; §3.3 names the later slice that may extend §5.4's exemption. |
| ADR 0043 and ADR 0079, headers | — | Each gains a cross-reference note to this record; neither decision body is rewritten. |
| `.gitignore` | `SampleBooks/` "admits exactly two paths" | Admits the README, the manifest and five manuscript files by exact path; the five local-only files stay refused by name, last. |
| [`SampleBooks/README.md`](../../SampleBooks/README.md) | "The repository admits exactly one manuscript file" | The five-file allowlist with bytes, SHA-256, source pages and revisions, and each file's import verdict; the history sections are kept. |
| [CI and test boundaries](../agents/ci-test-boundaries.md), Provider-free public-test-material boundary | Public SampleBooks "admitted under ADR 0043" | Admitted under ADR 0043 and this record. |
| [Source checkout](../development/source-checkout.md), developer-live | "Only ADR 0043-admitted Public SampleBooks are transmittable — in this slice, exact `sample1`." | Names this record and slice 15c. |

## Consequences

- Long-book behaviour has public inputs: 《儒林外史》 is the long case at more than 300,000 characters, beside three shorter books of different shape — essays, short stories and a 回 novel with a preface.
- A defect found on a private manuscript can now usually be reproduced on public text, in tests, on the guests, in hosted CI and — once 15c lands — against the live model, without anyone's manuscript leaving its owner.
- The repository carries four more DOCX files, 737,778 bytes together; they never reach a package, because the build and packaging paths already exclude `SampleBooks/`.
- Reviewers verify a change to any of the four against the manifest and the README row: the generator, run on the pinned revisions, must reproduce the committed bytes.

## Rejected alternatives

- **Bundle the four as the packaged build's sample Book.** Not what the Owner decided: packaged builds keep 示例书尚未提供, and onboarding's development sample stays `sample1`.
- **Re-admit one of the five local-only files as the long case.** Rejected by ADR 0079 §5, and none of them is public.
- **A larger synthetic book only.** Synthetic text reaches any size but not real chapter, paragraph and sentence structure, which is what analysis replies and reductions are sized by.
- **Traditional-character originals, or hand-converted simplified text.** The Owner chose MediaWiki's own `zh-hans` conversion, pinned by revision, so the conversion is reproducible and reviewable rather than edited.
- **Annotated modern editions.** Their annotations may carry copyright; the designation is the original text only.
- **Commit the raw Wikisource responses.** Raw HTML would put navigation, license text and annotations into the repository; the manifest's pinned revisions and the generator reproduce the files instead.

This decision admits four test inputs to repository development. It changes no AI7 product behaviour, schema, protocol, policy byte, Journey, Gate, credential, Provider scope, export, publication, release or `main` authority.
