---
status: proposed
---

# Admit multi-format manuscript intake, keep the original as the Source Version, and widen the bounded DOCX import into a classified one

On 2026-09-07 the Owner corrected a narrowing the implementation had made silently: manuscript intake must not be DOCX-only, and converting another format to DOCX internally is a legitimate processing strategy ([#313](https://github.com/zhouy1017/ai7-harness/issues/313)). The design already said so — V2-UX-IMP-001 opens intake through the native picker with no format restriction, V2-UX-IMP-008 records `format` as a property of what arrived, and V2-UX-IMP-006 provides `作为来源材料导入` for a file that cannot become an editable Manuscript — and no ADR restricts intake to DOCX. The restriction lives only in `stageSelectedDocx`, `DOCX_REJECTED`, and the bounded parser.

On 2026-09-08 the per-book verdict table ([#297](https://github.com/zhouy1017/ai7-harness/issues/297), `SampleBooks/README.md`) showed the narrowing is deeper than a format check. Of the six admitted Public SampleBooks only exact `sample1` imports. Three of the four DOCX files stop at `src/service/docx.ts:316`, a body-level section-properties allowlist that admits a zero-attribute container or `sample1`'s exact shape and nothing else, and a second gate at `:661` admits only the all-zero fidelity projection or `sample1`'s exact 266/1 shape at its exact digest. Those two conditions encode what `sample1` happens to look like; they are not the hostile-input hardening (archive size, entry count and size, ZIP ratio, XML nesting, DTD and entity, path traversal, active content), none of which fired for any admitted file. V2-UX-IMP-005 makes an explicit Import Degradation Decision the design's answer to degradation, and refusing a file forecloses the decision the design says the editor should get.

## Decision

### 1 · Intake accepts a file whatever its extension, identifies its format, and routes it

The intake path (`stageSelectedDocx` and the main-process picker flow behind it) becomes `stageSelectedManuscript`: it identifies the format from content, not only from the extension, and routes the file one of three ways.

| Route | Formats | What the editor gets |
| --- | --- | --- |
| **Read natively** | DOCX | An editable Manuscript with an Import Fidelity Review of what the DOCX carried |
| **Converted to a DOCX working representation** | `.doc`, `.txt`, `.md`, `.odt` when its converter exists | An editable Manuscript whose Import Fidelity Review names conversion as the cause of every loss |
| **Source-only** | PDF and any format without an honest editable round trip | `作为来源材料导入` as a separate explicit relationship, never a partial extraction presented as the Manuscript |

A format the product does not recognise is refused as an editable Manuscript with the reason stated and source-only retention offered, exactly as V2-UX-IMP-006 describes.

### 2 · Conversion never replaces the original

The Source Version records the **original file's** exact identity, digest, byte length, and format (V2-UX-IMP-008, ADR 0035). A converted DOCX is a derived working representation: it is stored beside the original as the object the Manuscript was read from, carries the converter's identity and version, and is never the digest of record. `SAMPLE1_SOURCE_DIGEST` and every analysis-lineage check keep keying off the original's digest; `sample1`'s source digest is unchanged by this work, which the closure proves.

### 3 · Conversion loss is fidelity loss, classified the way the design already classifies it

The Import Fidelity Review keeps its eight content classes and its three labels — `完整保留`, `降级导入`, `不支持导入` — with exact counts and representative examples (V2-UX-IMP-002 to 004). For a converted file the review names conversion as the cause where it is, so a `.doc` read through a text converter shows its inline styles and tables as `降级导入` or `不支持导入` with the converter named, and the editor decides with `按上述降级方式导入` before anything commits (V2-UX-IMP-005). A converted file is never presented as if it had been read natively.

### 4 · The bounded DOCX import becomes a classified one

The two `sample1`-shaped conditions stop refusing and start classifying:

- The body-level terminal `sectPr` check (`docx.ts:316`, `:339`, `:341`) no longer requires a zero-attribute or `sample1`-exact shape. Section properties become a counted fidelity signal in the `sections` class, labelled `降级导入` with its count and examples, and the document imports under an explicit Import Degradation Decision.
- `deriveImportFidelityPlan` (`docx.ts:615-632`, refusing at `:661`) no longer admits only the all-zero projection or `sample1`'s exact 266/1 shape. Any projection the eight classes can express yields a plan: `clean-import-no-round-trip` when every class is `完整保留`, `degraded-import-no-round-trip` otherwise, and `不支持导入` only for a class the parser genuinely cannot represent, which blocks editable import per V2-UX-IMP-006.

Every hostile-input bound stays exactly as it is. `sample1`'s import, review, and digest are unchanged, which the J-01 baseline and the `sample1` control row in `SampleBooks/README.md` prove; the other three admitted DOCX files then import with an honest review instead of a refusal, and #311's composed-fixture builder has real prose to compose from.

### 5 · Converters are pure JavaScript or WebAssembly, permissively licensed, local, and provider-free

ADR 0070 §3 pre-authorized a conversion dependency under exactly those conditions, reported in the pull request that adds it. This ADR fixes the first two routes and defers the rest:

- **`.doc` (legacy binary Word)** converts through a pure-JavaScript legacy-Word reader (the candidate at the time of writing is `word-extractor`, MIT) to a DOCX working representation of paragraphs and headings; character styles, tables, notes, and images are classified as lost by conversion. The exact package, version, size, and licence are stated in the pull request that adds it, per ADR 0070 §3.
- **`.txt` and `.md`** convert without any dependency: paragraphs from blank-line separation, headings from Markdown heading markers, everything else `不支持导入` with counts.
- **PDF** is source-only by default. A fixed-layout page has no honest editable round trip through text extraction, and presenting extracted text as the Manuscript would be the silent partial extraction V2-UX-IMP-006 forbids. An explicit "extract as an editable draft" route with its own review is a separate later decision, not this one.
- **`.odt` and `.rtf`** are recognised and refused as editable with source-only offered until a converter is added under the same rule; recognising them now keeps the picker honest.

Import stays local: no network, no credential, no Harness, no model (V2-UX-IMP-001). A native addon, a copyleft licence, or a network conversion service remains outside ADR 0070 §3 and needs the Owner.

### 6 · Per-format verdicts are recorded and re-measured

`SampleBooks/README.md`'s `## Import verdicts` table gains a column for the verdict after this ADR's implementation lands, measured the same way at the new head, so #297's table closes with both readings side by side.

## Consequences

- The import boundary the product claims changes from "DOCX, and only a DOCX shaped like `sample1`" to "any recognised manuscript format, with the original kept, conversion loss classified, and source-only retention as a real answer". That is why this is an ADR and not an Issue: it changes what the import path may claim.
- Three admitted SampleBooks become usable test material, which is what #311 needs; the `sample1` baseline under ADR 0044 is untouched.
- J-01 gains at least one non-DOCX intake end to end (a `.doc` or `.txt`), or the closure records why it cannot yet.
- The `DOCX_REJECTED` error family splits: hostile-input refusals keep their code; a format refusal becomes `FORMAT_UNSUPPORTED_FOR_EDITABLE_IMPORT` with the source-only offer attached; a fidelity finding is no longer an error at all.

## Rejected alternatives

- **Keep DOCX-only intake and convert outside the product.** Rejected by the Owner: the design admits any format, and an external conversion step hides the loss from the review the design requires.
- **Let the converted DOCX be the Source Version.** Rejected: lineage would follow a derivative, `SAMPLE1_SOURCE_DIGEST` and every analysis-lineage check would key off a converter's output, and ADR 0044's baseline would break the first time the converter changed.
- **Extract PDF text as the Manuscript.** Rejected for now: fixed layout has no honest editable round trip, and V2-UX-IMP-006 exists for exactly this case.
- **Widen the two `sample1` gates by adding the three SampleBooks' shapes to the allowlists.** Rejected: that is the same fingerprint with three more fingers; the design's answer to an unexpected shape is classification and an editor decision, not another exact match.

## Status

Proposed by the Commander on 2026-09-08 for the Owner's acceptance. The one decision that is the Owner's alone is §5's dependency choice as reported in the pull request that adds it; everything else follows from records already in force (V2-UX-IMP-001 to 012, ADR 0035, ADR 0043, ADR 0044, ADR 0070 §3).
