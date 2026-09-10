---
status: accepted
date: 2026-09-10
deciders: Owner (chooow.yang@gmail.com)
supersedes: ADR 0043 in part (§5: the repository admission narrows to exact `sample1.docx`)
amends: ADR 0066 §Research budget and ADR 0074 §2, §3 (read under §4.3 for the model-tool path); V2-UX-SRC-013 and DSTO-017; `requirements.md` gains `## Network egress` (EGR-001 to 005); the development plan and the tracker (S87, S88)
---

# 0079 · Record the Owner's decisions of 2026-09-10 on storage, policy revisions, export objects, network egress, provider assignment and the repository SampleBooks

## Context

After [ADR 0077](./0077-adopt-the-editor-facing-surface-specification-as-the-execution-standard.md) and [ADR 0078](./0078-align-the-remaining-references-the-plan-and-the-tracker-to-the-editor-facing-specification.md) five decisions stood between the plan and its next slices: the storage decision that V2-UX-DSTO-013 requires for 数据版本 and 导出 / 导入数据库 (S85 #433, S86 #434); Provider Processing v5 for the three policy-gated model suboperations; External Export Policy v2 for the new export objects (S64 #413); the search-engine egress the product needs under `ordinary-production` (S70 #425); and the fixture generator's manuscript-echo bound (#387). The UI design session put each to the Owner with the current facts and the options, and the Owner answered on 2026-09-10 in two messages, quoted verbatim below. Where the answer reads 「ok」 or 「其他都按照你的建议」 the Owner adopted the session's recommendation, so each recommendation is written out here in full; the chat is not a record.

「1a ok 1b ok,当前还不算冻结状态 1c ok 1d ok 1e ok 1f A 1g B    2a ok 2b ok 2c ok 2d 我需要进一步解释 2e 我需要进一步解释 3a ok 3b ok 3c ok 3d ok 3e ok 4a 帮我补充一下是否还有其他可能需要的，另外不要一刀切禁止所有出网行动，准确说除了被列出的活动被认为默认允许，其他出网操作依然可以在授权后进行。实现用户意图大于内容不出网。 4b 不要在本地调用搜索引擎，让LLM测作为工具调用（例如deepseek的web search） 4c 全部允许发送正文，作者等（但是要隐藏出版社人员的信息）。我们在隐私方面的唯一要求是不要把全文原样发布到public access的网络上 4d ok 4e 因为使用LLM内置，无需额外设定检索预算 4f ok 4g ok 5 sample1 豁免ok 但是我们要进一步区分sample1本身完全豁免，samplebooks中的其他稿件文件只能用于本地测试，还是不能进仓库」

「2d 选A websearch的问题留待不同人物的供应商进行一次集中设计和配置，我们必须先确定整个项目有多少涉及供应商的任务才能正确分配供应商    2e 尽量合并  4a ok 4b 1.确定自行get全文并存档（在自行get失败的情况下允许降级保存模型的片段+URL） 2. 要查文档确定，但是具体方案和2d一样留待一个单独的集中设计  4c 出版社名称不隐藏，对于已经进入发稿流程的书这个属于公开信息 5 选择a  其他都按照你的建议」

## Decision

### 1 · Storage: 数据版本, 导出 / 导入数据库, 定期自动备份

This section is the storage-authority decision V2-UX-DSTO-013 asks for. S85 (#433) and S86 (#434) are dispatchable against it; package-format detail is an implementation decision in their Briefs.

1. **The Data Version is a compatibility contract** (1a): an editor-visible integer separate from the software version that changes only when older software could no longer read the store — a destructive or semantic change. An additive schema revision (`user_version` 21, 22, …) stays inside the same Data Version, so every migration is classified additive or breaking, and that classification is what 「非必要不改」 means in code.
2. **Nothing is frozen yet** (1b): Data Version 1 is set at the first packaged release; until then development stores are disposable and may be rebuilt, as today.
3. **Rollback restores the pre-upgrade backup of the data only** (1c); AI7 neither keeps nor runs the previous software version, and the surface says so.
4. **Backups live in a fixed backup location beside the Agent Data Root** and use the same package format as `导出数据库` (1d). `定期自动备份` keeps fourteen days; a pre-upgrade backup is kept until the editor deletes it.
5. **`只导入其中的图书` merges** a Book with every record it owns — manuscripts, Source Versions, marks, Runs, Result Sets, deliverables and their records — plus read-only snapshots of the exact Knowledge Base versions the Book references (guideline documents, 工序, exemplars); Series membership is dropped with a notice; house settings and credentials are never merged; a same-named Book is stored beside the existing one (1e, DSTO-017).
6. **The package is not encrypted** in V1 (1f A): a local file the editor controls like a manuscript file, never containing Model Service credentials.
7. **`导出数据库` runs through External Export Policy v2** as its own target kind, with the same platform picker, per-file preparation, approval and receipt (1g B, §3). **`定期自动备份` does not**: it writes to the AI7-controlled backup location on the schedule the switch enables, and the switch is the decision — no daily approval and no standing overwrite permission beyond that location.

### 2 · Provider Processing: v5 for `developer-live` and the production successor of v3

1. Under `developer-live` the three declared suboperations are allowed: `crossUnitReductionAllowed`, `assuranceSamplingAllowed` and `runReportReflectionAllowed` (2a).
2. The transmission bound reads: Coverage Manifest unit count, plus declared safe retries, plus the reduction's topic sections, plus the assurance sample's anchor units, plus one report turn (2b).
3. The Run Budget Ceiling default of ADR 0070 — 30,000 tokens times the frozen unit count — enters the policy bytes and replaces the flat 500,000 (2c).
4. **The production policy is revised in the same step** (2d A): the successor of v3 for `ordinary-production` carries the same three suboperations, the same ceiling default and the redaction rule of §4.4 — and **no web-search allowance yet**, which waits for the provider assignment design of §6. The production binding itself stays as it is until that design.
5. Policy documents that land in the same window are pinned by **one** new active-policy-set version (2e 「尽量合并」): the Commander numbers the documents and bundles them, and the Owner reviews each set's bytes once before its pull request is Ready.

### 3 · External Export Policy v2 (S64 #413)

**Amended on 2026-09-10** by the Owner's byte review of the v2 document in the pull request that lands it (#440), which came before S64 rather than at it. Two clauses the session had written narrower than the Owner intended are restated below. **Eligibility** (clause 1): 「一个完整默认交付包内包含定稿的主稿件+其他修订的相关文档，但是同时无论是定稿的主稿件还是其他修订的文档都可以单独导出，交付包也可以选择哪些导出哪些不导出」 — the deliverable kind is the Editorial Deliverable Revision, not the manuscript alone, and a package export is the editor's chosen subset of its members. **Attached content** (clause 2): 「允许逐项排除，默认都带，只有对外不可见的编辑备注默认不随导出」 — 备注 are a default-off item the editor may include per export, not a hard exclusion. This amendment reaches export only: §4.4 and the provider-transmission strip it states — 责编 and 相关人 names and roles, 备注 and internal notes stripped before transmission — are untouched, as are V2-UX-EGR-004 and MARK-006's model and Task-scope sentences.

1. Eligible target kinds: an Editorial Deliverable Revision — the exact-version boundary a Manuscript Revision realizes for the manuscript and Promotion Article, News Report and Review Article revisions share ([Editorial context](../domain/editorial/CONTEXT.md)), so the finalized main manuscript and every other revised related document is exportable on its own — a Production Document version, a Book Delivery Package version, a Report (review, evaluation, 审稿意见), and a database export package (§1.7).
2. Attached content that may leave with a file: 批注 as comments with author names, 修改建议 as tracked changes, and the file-level DOCX content retained with the Source Version — headers and footers, page setup, style sheets, text boxes, images. All three are included by default and the editor may exclude each one. 备注 may leave with the target but are not included by default; the editor may include them per export. Retained external sources and Evidence Links do not export in v2, and those two are hard exclusions.
3. A multi-file export — a 图书交付包 as a folder — is covered by one approval over the enumerated file set with per-file receipts; the enumerated set is exactly the members the editor chose, never the whole package implicitly, and it is never standing permission.
4. Reports export with the manuscript's formats and fidelity rules (DOCX primary, PDF optional, Markdown fallback).
5. The Owner reviewed the v2 bytes on 2026-09-10 against #440 and directed the two corrections above; S64 implements against those reviewed bytes and needs no second confirmation of them.

### 4 · Network egress in the product

1. **Three tiers** (4a). *Default-allowed activities*, stated once in the category's or 工序's description and needing no per-Run authorization (V2-UX-REV-010): 事实核查, 学术道德与引用, 出版政策与风险, the evaluation's market section, writing tasks (市场, 同类书, 作者公开信息), dialogue tasks (`就这段提问…`), 资料库 web capture of an editor-given URL, and the staleness check of retained sources. *Plan-declared authorization*: any other Task whose plan's 发送 line states that it reaches the web and what it sends is authorized by the editor's `开始任务` (V2-UX-LAYER-002, TASK-035); no separate approval exists. *The one prohibition*: no function publishes the manuscript's text verbatim to a public-access network — no write, post or upload to a public endpoint. The Local-only Export Boundary (V2-UX-EXP-015) remains a V1 scope decision, not a privacy rule. 「实现用户意图大于内容不出网。」
2. **Search is the model's tool, never a local search-engine call** (4b, 4e). AI7 calls no search API and holds no search credential; a provider's built-in web search is a `webSearchTool` capability declared per route and model with vendor-documentation or live-item evidence and `none` until established, enabled by a `webSearchToolAllowed` flag in the applicable Provider Processing document. There is no search budget; the Run Budget Ceiling bounds the Run.
3. **Retention fetches the page itself** (4b.1, 4d). For every source the model cites, AI7 fetches the cited URL's full text and archives it as the Book-owned Source Version V2-UX-SRC-013 requires; when that fetch fails, retention degrades to the model-returned excerpt plus the URL with the disclosed state 来源仅片段. Retention fetches are bounded by the number of citations. The curated institutional-source list of the Factual Verification Policy becomes a preference given to the model and a post-filter on citations, not a host allowlist. ADR 0066 §Research budget and ADR 0074 §2 and §3 (Where to, How much) are read accordingly for the model-tool path; ADR 0074's `developer-live` boundary keeps governing AI7's own fetches.
4. **What may leave** (4c). The manuscript's text in full and the author's information may be sent to a Model Provider and its tools (outbound category 未发表全文); the house's people never leave — 责编 and 相关人 names and roles, 备注 and internal notes are stripped before transmission; the house name is not hidden, because a Book in the 发稿 flow is public information.
5. **Which provider carries the web-search tool is not decided here** (4b.2, §6); until it is, search-enabled categories run provider-free with a disclosed state.

### 5 · Repository SampleBooks: exact `sample1` only (5 a)

1. `SampleBooks/sample1.docx` is the only manuscript file admitted to the repository, CI and fixtures. ADR 0043's admission of the five other files designated by Issue #32 — `1蟠虺（修订290326字).docx`, `2听漏（定稿368544字）.docx`, `3天兽（定稿395870字)##＊.doc`, `春歌(一次通读后电子版).pdf`, `蟠虺.docx` — is superseded. Slice S88 (#438) removes them from the tree, refuses them in `.gitignore`, keeps them as local-only test material in the untracked source directory `SampleBooks/README.md` names, and retargets J-01's `.doc` scenario, J-08's composed inputs and the service builders to `sample1` or generated inputs. Git history is not rewritten: the files were the Owner's own designation, and a history purge on the protected lines is a separate Owner action if ever wanted.
2. No derivative of the five files — a fixture, a cache export, any generated text containing their content — ever enters the repository; local tests may read the local files.
3. The `developer-live` transmittable set stays exact `sample1` (S40).
4. The fixture generator's manuscript-echo rule exempts `sample1` entirely; for any other Book it refuses to emit a repository fixture (a local-only output under an ignored path is allowed). #387 proceeds on this rule.

### 6 · Provider assignment design (S87 #437)

Before any web-search-enabled slice and before the production binding changes, the Commander runs one consolidated design with the Owner that enumerates every task transmitting to a Model Provider or its tools, binds each to a Model Role, names the capabilities it needs (structured output, reasoning channel, web-search tool, context length, embeddings), assigns provider, route and model per scope, and lists the credential slots to enroll. Its output is an accepted ADR and the policy allow rules; the web-search binding of §4.2 and the search-enabled path of S70 (#425) wait for it. 「我们必须先确定整个项目有多少涉及供应商的任务才能正确分配供应商」

## Clauses changed

- `docs/ui-ux-v2/requirements.md`: V2-UX-SRC-013 gains the retention-fetch and degrade sentence; V2-UX-DSTO-017 gains the export-policy sentence; new section `## Network egress` (V2-UX-EGR-001 to 005). Under the §3 amendment, V2-UX-MARK-006 and V2-UX-EXP-023 change for export only — 备注 do not leave by default and the editor may include them — and MARK-006's model and Task-scope sentences and V2-UX-EGR-004 stay exactly as they are.
- `docs/ui-ux-v2/editor-surfaces.md`: under the §3 amendment, the mark table's 备注 row and the 导出 paragraph state the same export-only change; every other clause of both is unchanged.
- [ADR 0043](./0043-allow-public-samplebooks-in-repository-and-ci.md): partial supersession by §5, noted in its header; `SampleBooks/README.md` carries the status until S88 lands.
- ADR 0066 §Research budget and ADR 0074 §2 and §3: read under §4.3 for the model-tool path; the records are not edited.
- The development plan and the tracker: S87 (#437) and S88 (#438) opened; S85, S86 and #387 unblocked; S70's remaining gate is S87; S64's confirmation is the v2 byte review.

## Consequences

- The Commander writes no separate storage ADR; S85 and S86 dispatch against §1 when reached.
- Four policy documents follow this record: Provider Processing v5 and the production successor of v3 (§2), External Export Policy v2 (§3), and the egress document beside the Factual Verification Policy v1 of ADR 0074 (§4) — bundled into as few active-set versions as their timing allows, each reviewed by the Owner byte by byte.
- S88 lands before any further Journey builds on the five files; until it lands the repository still tracks them and the Gate still reads them.
- The product's privacy rule fits one sentence an editor can understand: the text may go to the model and its tools; it is never published verbatim to the public web; the house's people never leave.

## Rejected alternatives

- A separate storage ADR: rejected; the seven questions were answered here and a second record would restate them.
- A local search API with its own credential slot and search budget: rejected by the Owner in favour of the model's own tool.
- Keeping the five SampleBooks in the repository as admitted material: rejected by the Owner; `sample1` alone is public in every sense.
- Snippet-only retention: rejected; AI7 fetches the cited page and degrades to the excerpt only on failure.
- Encrypting the export package in V1: rejected; it is a local file the editor controls.
