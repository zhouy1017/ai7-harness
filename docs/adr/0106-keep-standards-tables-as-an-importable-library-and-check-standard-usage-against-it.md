---
status: accepted
date: 2026-11-19
deciders: Owner
amends: ADR 0105 §4 (revision 117 also holds the 字表与词表 library) and §7 (the library's slices join R5); ADR 0095 §5 (the deterministic checker's standard character table and variant-word list become library tables); ADR 0076 / ADR 0077 Knowledge Base classes (a new class 字表与词表); the 「Selected offline tables」 section of the deterministic checker rules (C01, C02 and V01 read pinned library versions)
decides: how #1152 is implemented — the Owner's directions of 2026-11-19, including the default 常用词表 《现代汉语常用词表（第2版）》 shipped with the program
---

# 0106 · Keep 字表与词表 as an importable library, and check 规范用语 against it

> Amended by [ADR 0107 §2–§3](./0107-rename-fast-interaction-to-underlying-flash-role-and-unify-low-level-model-services.md#2--unified-task-catalog-on-the-underlying-flash-service): model formatting in §3 (`standards-table-formatting`) runs on the unified **Underlying Flash Service** (`Underlying Flash Role` / `底层辅助角色` / `底层辅助模型（Flash）`) registered in R5-F1 ([#1608](https://github.com/zhouy1017/ai7-harness/issues/1608)).

## Context

### The Owner's directions (2026-11-19, verbatim)

1. Recorded on [#1152](https://github.com/zhouy1017/ai7-harness/issues/1152#issuecomment-6999249645): 「首先要明确1152的实现方法，应当是一个自动转换官方字表或者编辑自定义字表的模块，而不是单纯地将现有的3个字表hard code进入程序，不然当字表更新时，难道要为此更新整个程序吗？编辑应当可以仅通过导入和删除字表就可以调整字表检查能力」
2. 「放进R5做，但是设计上要再细化一下，应当设立一个AI7自用的格式，当输入非格式化字表时可以调用LLM来进行格式化，而不是前置要求编辑导入结构化字表。另外，要提供管理更新已有字表的入口，注意不要把导入的原始字表和转化后字表分开展示，而是只让用户看到自己导入的字表，显示转换应用情况，删除也同步处理。除了规范字表以外，还有规范用语的核查功能，比如"芒果"的规范写法是"杧果"这一类的对应标准和核查功能我们是如何实现的？这个功能应该如何称呼，对应的国家标准是怎样的？我建议仿照字表的方法实现」
3. 「ok」 — accepting the service Commander's four points:
   - (a) model formatting runs on the editor's own configured model service, shows a usage estimate first and needs the editor's confirmation; every converted entry must be traceable to text in the source file (the model may not invent entries); rows it is unsure of are held for the editor to confirm;
   - (b) every entry carries a strength: 国家规范（应改） / 辞书推荐（建议改） / 本社要求（按本社体例改）;
   - (c) only public national standards are pre-installed (《通用规范汉字表》 and its 附表, GF 1001-2001 《第一批异形词整理表》); dictionary-derived word tables are imported by the house itself, never shipped;
   - (d) the entry point is 知识库 › 字表与词表, beside 审阅规范; deleting a table deletes the imported source and its converted data together, and past check results keep their own text marked 「依据的字表已删除」.
4. 「先处理词表的问题，我们的默认词表先采用《现代汉语常用词表（第2版）》」
5. 「https://github.com/zispace/hanzi-words-cycb 就使用这个仓库的信息来作为默认分发版本」
6. 「option 1 goes now,」 — the Owner's choice between the two ways the service Commander set out: ship the list with the program, or download it on first use. The Commander had first said that the repository states no license and that its data transcribes a published book. The same message said how the list would be used, and the answer kept it:
   - its entries are 辞书推荐;
   - where it and a national standard disagree, the national standard wins;
   - it gives only 请核对 notes, and suggestions still come only from tables that map one form to another.

Directions 4 to 6 amend 3(c) for this one list. Directions 2 to 6 were given in the service Commander's session; the Commander records them on #1152 with this ADR.

### What AI7 does today

The local text check's three standards tables are compiled into the program:

- `src/service/review/deterministic/standard-data.json` holds the 2013 membership (8,105 characters, from Unicode 17.0.0 Unihan `kTGH`), 3,558 character-form correspondences (`characterForms`), and GF 1001-2001's 338 main and 44 appendix groups.
- `tables.ts` loads it as `STANDARD_TABLE_VERSION = 1`. Rules C01 (membership), C02 (character forms) and V01 (word forms) read it. A local plan pins only the number 1.
- Correcting the data needs a program release. The 2026-11-18 audit ([PR #1593](https://github.com/zhouy1017/ai7-harness/pull/1593), [provenance](../development/dependency-provenance.md)) fixed four wrong targets that way, and left two known limits: about 151 printed Annex 1 forms are absent, and single-target misreads were not screened.

**The 芒果 / 杧果 gap.** 「杧」 is a member of the shipped 2013 table, but no word-level mapping 芒果 → 杧果 exists anywhere:

- the local check cannot flag it;
- the 本社词表 (`ai7.house-word-list/1`: literal, note, enabled; rule H01) only marks a literal as a risk and never proposes a replacement;
- only the model category 错别字与规范用语 may mention it, from model knowledge, without a cited basis.

### The standards landscape

- **GF 1001-2001 《第一批异形词整理表》** (教育部、国家语委; 338 groups and a 44-group appendix) is the national language standard for 异形词.
- **No single national standard lists every recommended word form.** Dictionaries give recommended forms: 《现代汉语词典》 第7版, 《现代汉语规范词典》 第3版. They are copyrighted, so their tables can only be house-imported.
- **Scientific and technical terms** follow the terms published by 全国科学技术名词审定委员会. The press industry standard 《学术出版规范 科学技术名词》 (CY/T 119—2015) asks academic publications to use them.
- **《现代汉语常用词表（第2版）》** (李行健、苏新春 主编, 教育部语言文字信息管理司 组编, 商务印书馆 2021) lists 56,790 common words by frequency. It gives recommended spellings only: it says which form is common, never which form to avoid. It is a reference work, not a promulgated standard (no GF or GB number).
  - The public repository zispace/hanzi-words-cycb publishes a text transcription of it, made by text recognition and then corrected. Its pinyin is taken from two other dictionaries, and its name tags are the repository's own.
  - Checked against today's data on 2026-11-19 (repository commit `712fb0f`): 56,462 distinct words. 330 of GF 1001-2001's 338 recommended forms are listed, and none of the 338 groups has only its discouraged form listed. Four entries use characters outside 《通用规范汉字表》: 硫磺 and 磺胺 (磺), 矽肺 (矽), and 囧. Neither 芒果 nor 杧果 is listed.
- **Sources disagree on 芒果 / 杧果.** 《中国植物志》 uses 杧果. 现汉第7版 enters 「杧果」 and also gives 「芒果」. 规范词典第3版 says 「现多写作芒果」. Most standards use 芒果. This is why every entry carries a source and a strength.

## Decision

### 1 · Names

- **字表** — a character table. Kinds: **规范字** (which characters are standard) and **字形对照** (which form stands for which standard character).
- **词表** — a word table. Kinds: **词形** (which spelling of a word is recommended, e.g. 芒果 → 杧果) and **常用词** (which words are in common use, with no discouraged form; e.g. 《现代汉语常用词表（第2版）》).
- **规范用语核查** — the check that reads the enabled 字表 and 词表. The name matches the review category 错别字与规范用语.
- **字表与词表** — the 知识库 class that holds them.

The 本社词表 keeps its name and meaning (a literal risk list, H01). It is not a 词表 of kind 词形.

### 2 · The AI7 table format, `ai7.standard-table/1`

One table has one kind. The table carries:

- name, kind, source description (issuing body, standard number or dictionary edition, date);
- version label (the editor's or the issuer's), and AI7's digest of the canonical entries.

Each entry carries:

| Field | Meaning |
| --- | --- |
| Recommended form | The standard character or the recommended spelling |
| Discouraged forms | Zero or more forms the entry flags; empty for a 规范字 or 常用词 entry |
| Rank | For a 常用词 entry, its frequency rank in the source, when the source gives one |
| Condition / note | When the entry applies, or what the editor should weigh; an entry with a condition never proposes a replacement |
| Source | Where in the issuing source the entry stands (e.g. 「附表1 第4950号」, a page and row) |
| Strength | 国家规范（应改） · 辞书推荐（建议改） · 本社要求（按本社体例改） |
| Source text | For an imported table, the place in the imported file the entry was read from |

### 3 · Import: any file, one result

The editor chooses a file under 知识库 › 字表与词表 › 导入字表或词表. AI7 converts it as follows.

**Converted without a model:**
- a file already in the AI7 format;
- a regular table: CSV, TSV, XLSX or a DOCX table whose header row names the fields above, and the two-column 「A——B」 layout of GF 1001-2001.

**Formatted by the Underlying Flash Service (`Underlying Flash Role` / `底层辅助角色`, [ADR 0107](./0107-rename-fast-interaction-to-underlying-flash-role-and-unify-low-level-model-services.md)), for anything else with text** (a PDF with a text layer, DOCX prose, TXT, HTML, an unrecognised spreadsheet). Under direction 3(a) and ADR 0107:
- AI7 states the Underlying Flash model service it will use (`standards-table-formatting`), the size it will send and an estimate of usage, and starts only after the editor confirms;
- it sends only the imported file's text, in parts;
- every entry the model returns must name its place in the file, and AI7 checks that its forms occur there; an entry that fails is listed as not recognised with its reason, never applied;
- an entry the model marks as unsure, and an entry that conflicts with another in the same file, is held as 待确认;
- a part whose answer was refused or invalid is sent again once, under the confirmation the editor already gave, and is then reported alone if it still fails;
- a part whose outcome is unknown is never resent automatically ([#1599](https://github.com/zhouy1017/ai7-harness/issues/1599) and the transport rules): it is reported, and the editor may start that part again;
- either way the rest of the conversion stands.

**Refused:** a scanned PDF without a text layer. The editor is told it needs recognition, which is deferred ([#1034](https://github.com/zhouy1017/ai7-harness/issues/1034)).

**The conversion report**, shown before the table is saved: kind (the editor may change it), entries 已识别 / 待确认 / 未识别 with reasons, and the strength AI7 proposes for the whole table (the editor may change it, and change single rows). Saving makes version 1. Rows still 待确认 are kept but not applied until the editor confirms them.

The editor can also start an empty table (新建字表或词表) and type or paste rows. That is the 本社 custom table of direction 1.

### 4 · One item per imported table

The editor sees only the tables they imported (direction 2). The source file and its converted rows are one item, never two lists.

**Each row of the list shows:**
- file name and table name, kind, imported at;
- conversion status: 已识别 n · 待确认 m · 未识别 k;
- application status: 启用 / 停用, and its use in recent checks (e.g. 「最近 3 次核查用过」).

**Opening an item shows:**
- the entries, searchable, with each one's source, condition and strength;
- the held rows to confirm, and the rows not recognised with their reasons;
- 查看原件 (the imported file, inside the same item);
- editing, adding and removing rows; saving makes a new version.

### 5 · Update, delete, pre-installed tables

**Update.** 导入新版本 on an item converts the new file the same way, then shows the difference from the current version: rows added, removed and changed. Confirming makes the next version. Earlier versions stay viewable while the table exists.

**Delete.** One action, one transaction:
- the imported source, every version and every entry are removed together;
- a check prepared but not yet run that pinned the table is refused, and the editor prepares it again;
- past results keep their own text, marked 「依据的字表已删除」.

**Pre-installed tables** (direction 3(c), amended by directions 4–6). Four items are installed in every store, each at version 1:

| Item | Kind | Strength | Content |
| --- | --- | --- | --- |
| 《通用规范汉字表》 | 规范字 | 国家规范 | 8,105 members |
| 《通用规范汉字表》 附表1 | 字形对照 | 国家规范 | the encoded correspondences of today's `characterForms` |
| GF 1001-2001 《第一批异形词整理表》 | 词形 | 国家规范 | 338 main groups; the 44 appendix groups carry the condition 「附录，仅供参考」 |
| 《现代汉语常用词表（第2版）》 (the default 常用词表) | 常用词 | 辞书推荐 | 56,462 words with their frequency ranks, from the repository transcription at commit `712fb0f` |

> Commander clarification, 2026-11-21, following §6 and §10: the condition of the 44 appendix groups is the data's own text, 「2001年附录参考；须按2013年字表及具体语境复核。」, kept verbatim so that results pinned to version 1 read the same; 「附录，仅供参考」 in the table above was a paraphrase. The 44 groups also carry the source 「附录」, so the main / appendix split lives in the data and not only in a note's wording (R5-L1, [#1649](https://github.com/zhouy1017/ai7-harness/issues/1649)).

They behave like any imported table: they can be disabled, deleted, or replaced by 导入新版本 (e.g. a corrected Annex 1 that adds the ~151 missing forms). A deleted pre-installed table can be put back with 恢复预装字表; the program keeps its seed. No other dictionary table is shipped: 《现代汉语词典》, 《现代汉语规范词典》 and the like stay house-imported.

**The default 常用词表's rights and content** (direction 6):
- The repository states no license, and its data transcribes the 商务印书馆 book. The Owner chose to ship it knowing both facts.
- AI7 keeps only each word and its rank. The repository's pinyin comes from two other dictionaries, and its name tags are its own additions; the check needs neither.
- The item's source description names the book, its editors and publisher, and the repository and commit the words were taken from.
- Replacing or removing the list is a data change: a later release changes the seed, and a store that already holds it keeps it, replaces it with 导入新版本, or deletes it. Nothing else depends on it.

### 6 · Scope and pins

- **House-wide.** A table belongs to the house, like the other 知识库 classes. Every enabled table is offered to every Book's 规范用语核查.
- **Choosing for one check.** The local check's setup lists the enabled tables, all selected by default. The editor may deselect one for this check.
- **Pins.** A check records each table it used as table, version and digest, as the 本社词表's `HouseWordListPin` does. A later change applies only to later checks.
- **Findings carry their entry.** Each finding stores the entry it came from: forms, condition, source, strength, and the table's name and version label. So a deleted table leaves the result readable.
- **Older results.** Results from `ai7.review.local-plan/3` pinned `standardTableVersion: 1`. They resolve to version 1 of the three pre-installed tables, whose bytes equal today's data.

### 7 · How 规范用语核查 presents a finding

- **规范字:** a character outside every enabled 规范字 table is an annotation, as C01 is today.
- **字形对照:** always an annotation. Traditional and variant forms are legitimate in names, quotations and classics.
- **词形:** an entry with one recommended form and no condition proposes a 修改建议. An entry with a condition is an annotation.
- **常用词:** never proposes a replacement and never decides a disagreement. It gives one kind of annotation, 「可能是不常用的写法，请核对」:
  - a place in the text that is not a listed word, while a listed word differs from it by one character of the same reading;
  - the readings come from the pinned Unicode Unihan data, not from the transcription's pinyin;
  - a place that another table's entry or the Book's term table already covers gets no such note;
  - R5-L3 sets the exact rule, and its notes on `sample1` are counted and read before the slice merges.
- **A national standard wins over 常用词.** Where a 国家规范 entry and a 常用词 entry meet, the national-standard finding is shown as if the list were not enabled. For example, the list's 硫磺 does not weaken C01's annotation on 磺. The list never removes, weakens or contradicts a national-standard finding, and it is not one of the disagreeing tables below.
- **Disagreement.** Two enabled tables can disagree on the same text: different recommended forms, or one table's recommended form is another's discouraged form (芒果 / 杧果). Then the place becomes one annotation listing every entry with its strength. Nothing is proposed, and the editor decides.
- **The Book's own term table wins.** The Book's T01 term table still overrides a general word form for its listed names.

The card shows the strength label first (国家规范（应改）, 辞书推荐（建议改） or 本社要求（按本社体例改）), then the basis (table name, version label, the entry's source) and the condition. 批量采纳机械修正 keeps its current rule. Before adopting, it shows how many suggestions it holds per strength.

### 8 · What stays

- **The 本社词表** stays as it is (H01, risk only, its own versions and pins). It may later be listed in the same library; that is not decided here.
- **The model category 错别字与规范用语** is unchanged. It does not read the library.
- **The local check's other rules** (P01–P03, N01, N02, T01, H01) are unchanged.
- **The 规范用语核查 transmits nothing.** Only an import that the editor confirms for model formatting sends anything: the imported file's text.

### 9 · Storage, in the revision 117 baseline

The library's relations are part of **revision 117**, R5's one new revision (ADR 0105 §4). They are not a later additive revision. Two reasons:
- the R5 upgrade installs the pre-installed tables in the same verified switch;
- 0.8.0 ships Data Version 2 once.

The relations, roughly:
- the table (kind, name, origin pre-installed / imported, enabled, current version);
- its versions (ordinal, source description, version label, digest, conversion report, previous digest);
- the entries of each version, with their status (applied / 待确认 / 未识别);
- the imported source file, stored as an object file in the data root.

Versions are immutable while the table exists. Deletion is allowed (direction 3(d)), so these relations carry no append-only `no_delete` trigger. They are not among ADR 0105's 408 kept triggers.

**Where the store's tools put them:**
- **Creation.** An empty data root gets the four pre-installed tables at version 1 from the seed.
- **The upgrade (ADR 0105 §5)** installs the same four tables in the converted store. R5-6 lists this as an expected difference.
- **Inventory.** The [#1556](https://github.com/zhouy1017/ai7-harness/issues/1556) inventory (`src/service/store-inventory.ts`) counts the relations, plus the entity counts of tables, versions, entries and source files.
- **Merge.** `MERGE_TABLE_POLICY` classes them `house`. House settings stay local, and a merged Book keeps its findings' own text.
- **Database export and replace-all import** carry them.

### 10 · Delivery

Five slices join R5. The order is in the [development plan](../development/development-plan.md) R5 section:

| Slice | What it delivers | Order |
| --- | --- | --- |
| R5-L1 | The final-shape relations in the 117 baseline. The pre-installed seed in the AI7 format: the three national tables with content equal to `standard-data.json`, and the default 常用词表 (words and ranks) from the pinned transcription, with its provenance and notice entries. One install function, called by store creation and by the R5-6 converter. Inventory and merge class | On the train with R5-2, before R5-6 |
| R5-L2 | Import and conversion: the AI7 format, regular tables, model formatting on the Underlying Flash Service (`standards-table-formatting`, [ADR 0107](./0107-rename-fast-interaction-to-underlying-flash-role-and-unify-low-level-model-services.md), R5-F1) under §3, the conversion report, update with its difference, delete | After the train and R5-F1 land |
| R5-L3 | 规范用语核查 reads pinned library versions (C01 / C02 / V01 v2, a new local plan version). Strength, disagreement, the 常用词 「请核对」 notes (§7, counted on `sample1`) and 「依据的字表已删除」 on cards. `local-plan/3` results resolve to pre-installed version 1 | After the train lands; beside R5-L2 |
| R5-L4 | The 知识库 › 字表与词表 surface (§4, §5), including 恢复预装字表 | After R5-L2 and R5-L3 |
| R5-L5 | The tables leave the program code: `standard-data.json` and the `tables.ts` constants are removed, the seed is the only copy, and the provenance owner moves to it | After R5-L3; before R5-7 |

The R5 train rule stands: the fold never lands without its converter. R5-L1 is the only library slice on the train. R5-7's acceptance covers the library.

## Records amended

- **[ADR 0105](0105-fold-the-storage-baseline-undo-by-editor-step-and-upgrade-in-app.md):**
  - §4: revision 117 also holds the 字表与词表 relations of §9 above.
  - §5: the upgrade installs the pre-installed tables, and R5-6 expects them as a difference.
  - §7: slices R5-L1 … R5-L5 join R5. R5-L1 rides the train with R5-2; R5-L2 … R5-L5 follow the train and precede R5-7.
- **[ADR 0095](0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md) §5:** the deterministic checker's 「standard character table and variant-word list」 are the enabled library tables, pinned by version.
- **[Deterministic checker rules](../development/deterministic-checker-rules.md), 「Selected offline tables」:** C01, C02 and V01 gain version 2, which reads pinned library versions. Version 1 stays readable for older results.
- **[Dependency provenance](../development/dependency-provenance.md):** the provenance of `standard-data.json` becomes the provenance of the pre-installed seed. R5-L1 adds the default 常用词表's entry: the book, the repository and commit, the columns kept, the absent license and direction 6. [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES.md) gains its attribution. An imported table's provenance is its own source description.
- **Knowledge Base** ([editorial CONTEXT](../domain/editorial/CONTEXT.md); V2-UX-KB-001 and a new V2-UX-KB-011 in [requirements](../ui-ux-v2/requirements.md); [information architecture](../ui-ux-v2/information-architecture.md) and [editor surfaces](../ui-ux-v2/editor-surfaces.md) §8.4): the class 字表与词表 is added beside 审阅规范文件.

## Consequences

- An editor changes what the check knows by importing, updating, disabling or deleting a table. No program release is needed for a corrected or newer standard.
- The ~151 Annex 1 forms the 2026-11-18 audit found missing become an import of a corrected 附表1, not a code change.
- 芒果 → 杧果 becomes checkable: the house imports the dictionary table it follows at 辞书推荐, and the card states the source and strength. A house that prefers 芒果 records that in a 本社要求 table, and the disagreement is shown instead of decided. The default 常用词表 does not settle it, because it lists neither form.
- Every store starts with a 常用词表, so 「请核对」 notes need no import. Because the list is shipped without a license (§5), replacing or removing it is a seed change in a later release, not a code change.
- Model formatting can only reorganise text already in the editor's file. Every applied entry can be traced to its source, and doubtful rows wait for the editor.
- Ordinary CI stays provider-free. Model-formatting tests use authored table text and recorded answers. The only reference-work content in the repository is the default 常用词表 seed (direction 6). This ADR authorizes no live call, no release and no promotion to `main`.
