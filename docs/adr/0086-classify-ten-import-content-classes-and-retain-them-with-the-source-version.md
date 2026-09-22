---
status: proposed — the Owner chose this reading on 2026-09-22; the Owner merging this pull request is its acceptance
date: 2026-09-22
deciders: Owner
amends: V2-UX-IMP-002 — eight classes become ten, and the round-trip class is shown as the closing card (§1); V2-UX-IMP-055 — which classes are `完整保留（随文件保留）` and what that promises after an edit (§2–§3); ADR 0072 — its eight content classes; editor-surfaces §7 (④) 保真审阅 — 「八类一张表」 and 「导出时原样恢复」
---

# Classify ten import content classes and retain them with the Source Version

On 2026-09-22 the Owner chose the class table S61 (#410) needs before it is built. It was recommended on 2026-09-20 and recorded in `PROGRESS.md` under Owner decisions pending › 1. The Owner merging this pull request accepts this text.

## Context

- **V2-UX-IMP-002** fixes eight classes: inline styles, comments/revisions, notes, tables, images/captions, sections, headers/footers, and expected round-trip export behaviour. [ADR 0072](./0072-admit-multi-format-manuscript-intake-with-docx-as-the-working-representation.md) keeps those eight, and editor-surfaces §7 (④) reads 「八类一张表」.
- **V2-UX-IMP-055** ([ADR 0077](./0077-adopt-the-editor-facing-surface-specification-as-the-execution-standard.md)) retains DOCX content by default:
  - Headers and footers, page setup, style sheets, text boxes and images stay with the Source Version and are restored on DOCX export.
  - Such a class is labelled `完整保留（随文件保留）`.
  - `保留 / 并入` is offered where content may fold into the body.
  - `降级导入` is reserved for what cannot be retained, for example a table-of-contents field.
- **The ④ prototype** is evidence of form, not authority (ADR 0077). It draws nine rows:
  - It adds 文本框, with the choice, and 目录域, the one `降级导入`.
  - It turns round-trip into a summary card.
  - It marks 内联样式 and 表格 `完整保留 · 原样恢复`, and 图片与图注 `降级导入`.
- **The manuscript keeps each block's text only.** After a paragraph is edited, neither its inline formatting nor a table's cell structure can be promised back unchanged, so 「导出时原样恢复」 can hold only for what was not edited.
- **The original file is already kept whole.** It is stored as the Source Version's content object. The parser reads `word/document.xml` and drains the other parts, counting headers and footers only by name, so today nothing but the original file keeps them.

## Decision

### 1. Ten classes in the record, nine rows and a card on the screen

The Import Fidelity Review records ten classes, in this order:

1. 内联样式
2. 批注与修订
3. 脚注
4. 表格
5. 图片与图注
6. 分节
7. 页眉页脚 · 页面设置
8. 文本框
9. 域（目录等）
10. 预计往返

The review shows the first nine as rows under the columns 内容类 · 数量 · 怎样进来 · 例子 · 以后导出. The tenth is shown as a closing 预计往返 card: it summarises what a DOCX export restores.

### 2. The label each class carries

| Class | At import |
| --- | --- |
| 内联样式 | `完整保留（随文件保留）`, with 「改过的段落，导出时逐段说明格式能否原样恢复」 |
| 批注与修订 | Unchanged by this record. S62 (#411) imports them as marks |
| 脚注 | `降级导入` until the manuscript has a note block. The notes stay with the Source Version, and the row states what the manuscript shows and what export restores (IMP-004) |
| 表格 | `完整保留（随文件保留）`, with the same line as 内联样式 |
| 图片与图注 | `完整保留（随文件保留）`. The image stays with the Source Version, and the body shows a placeholder with its caption |
| 分节 | `完整保留（随文件保留）` |
| 页眉页脚 · 页面设置 | `完整保留（随文件保留）`, the style sheet included |
| 文本框 | `完整保留（随文件保留）`, with `保留为文本框` (default) or `并入正文`, which moves its text into the body where it stood |
| 域（目录等） | `降级导入` |

Only a `降级导入` class requires IMP-005's unselected decision. A file with none imports without it, and sample1 is such a file: its 266 inline-style items and one section become `完整保留（随文件保留）`.

Where the prototype differs, this record decides:
- For 内联样式 and 表格, `原样恢复` holds only for unedited paragraphs (§3).
- 图片与图注 is retained, as IMP-055 names images.

### 3. What `随文件保留` means

- **The file stays whole.** The original stays with the Source Version, as it already does.
- **Import adds a mapping.** It records which source paragraph each manuscript block came from, and where each retained part sits. The mapping is an additive relation in the existing store (ADR 0079 §1.1), so S61's stop condition, storage beyond the Source Version's own record, is not met.
- **DOCX export (S64, #413) rebuilds from the original.**
  - An unedited block is restored from its source paragraph with everything it carried.
  - An edited block keeps what is known to survive the edit.
  - The Export Fidelity Review (V2-UX-EXP-007) states, block by block, what an edited block cannot restore as it was. The cost of an edit is stated there, when it is known, and never guessed at import.
  - File-level parts are restored from the original: headers and footers, page setup, the style sheet, images, and text boxes kept as text boxes.
- **A converted file** (ADR 0072) is retained as its working DOCX holds it. What the converter lost stays `降级导入` or `不支持导入`, with the converter named.

### 4. What stays

- IMP-003's three labels.
- IMP-004's counts, examples and consequences.
- IMP-005's unselected decision.
- IMP-006's block on a critical `不支持导入`.
- Import stays local, and nothing is transmitted (IMP-001).

### 5. Clauses amended

| Owner | Clause | Now |
| --- | --- | --- |
| [V2-UX-IMP-002](../ui-ux-v2/requirements.md) | "separately classifies inline styles, comments/revisions, notes, tables, images/captions, sections, headers/footers, and expected round-trip export behavior" | Adds text boxes and fields; round-trip is shown as the closing card (§1) |
| [V2-UX-IMP-055](../ui-ux-v2/requirements.md) | "Headers and footers, page setup, style sheets, text boxes and images stay with the Book-owned Source Version and are restored on DOCX export" | Also inline styles, tables and sections, through the source-paragraph mapping; an edited block's losses are stated at export (§2–§3) |
| [ADR 0072](./0072-admit-multi-format-manuscript-intake-with-docx-as-the-working-representation.md), Import Fidelity Review | "keeps its eight content classes" | Ten (§1) |
| [editor-surfaces](../ui-ux-v2/editor-surfaces.md) §7 (④) 导入五步 · 保真审阅 | 「八类一张表」; 「导出时原样恢复」 | 「九行一张表，末尾一张预计往返卡片」; 「导出时从原文件恢复，改过的段落在导出保真审阅里逐段说明」 |

## Consequences

- **The editor imports a manuscript like sample1 without being asked to accept a degradation.** J-01's fidelity rows, and the `#accept-import-degradation` steps of J-01 to J-04, change with S61.
- **S61 needs a schema revision** for the mapping and the two new classes. Its fidelity plan must still be rebuilt exactly from counts, now for ten classes.
- **S62, S64, S66 and S67 can be scheduled.**

## Rejected alternatives

- **The prototype as drawn.** Restoring 内联样式 and 表格 unchanged after edits needs formatted runs in the manuscript model, the editor and the store. That work would come ahead of S61 and push back S62, S64, S66 and S67. Rejected by the Owner on 2026-09-22.
- **Exactly eight rows.** No record would be needed, but the text box's `保留 / 并入` and the table-of-contents field's `降级导入`, IMP-055's own examples, would have no row. Rejected by the Owner on 2026-09-22.
