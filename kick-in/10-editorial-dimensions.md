# Editorial Dimension Catalog

Status: **baseline accepted in Question 8; customization/versioning model accepted in Question 9**

## Purpose

A Multi-aspect Editorial Task uses explicit Editorial Dimensions so professional judgment is visible, configurable, and reviewable. The catalog is product-domain configuration, not a hard-coded model prompt or a universal numerical scoring rubric.

## Built-in baseline

| Built-in dimension | Scope of consideration |
| --- | --- |
| Literary Quality and Authorial Voice | Literary merit, distinctiveness, tone, voice, and preservation of intentional expression. |
| Theme, Values, and Social-cultural Context | Thematic force, value orientation, cultural meaning, social context, and likely interpretation. |
| Structure, Narrative Logic, and Coherence | Overall organization, pacing, argument or narrative progression, consistency, and internal connections. |
| Chinese Language, Style, and Expression | Chinese usage, clarity, rhythm, register, terminology, style, and suitability for the intended work. |
| Factual Accuracy and Source Integrity | Factual support, quotation/evidence fidelity, provenance, uncertainty, and separation of source text from generated prose. |
| Target Readership and Market Positioning | Intended readership, accessibility, differentiation, positioning, and fit with the publication purpose. |
| Legal, Rights, Ethical, and Publication-policy Risk | Rights, attribution, privacy, ethical concerns, and house or publication-policy constraints. |
| Production Readiness and Cross-deliverable Consistency | Readiness for the next publishing stage and consistency among manuscript text, promotional articles, news reports, reviews, and related deliverables. |

These dimensions are available by default. A task uses and weights only the dimensions relevant to its purpose; the set is not an eight-score checklist that every task must complete.

## Accepted extension requirement

A production user can introduce additional Editorial Dimensions. The built-in catalog is therefore a starting vocabulary rather than a closed taxonomy.

## Accepted customization and history model

- An **Editorial Profile** stores reusable user defaults and User-defined Editorial Dimensions.
- A Book can select, disable, add, reweight, or change the display wording of dimensions for its own editorial work.
- A task snapshots the effective dimension identities, wording, descriptions, selection, and weights when it begins.
- Later catalog or Book changes apply prospectively and never rewrite completed or running task evidence.
- A dimension that has been referenced is archived rather than deleted; its stable identity remains resolvable.
- Applying updated Editorial Profile defaults to an existing Book is explicit rather than automatic.
- The effective dimensions governing a task are visible in its evidence and result.
- Dimension configuration is structured data with descriptions and evidence expectations, not an opaque prompt fragment.

See [ADR 0001](../docs/adr/0001-versioned-editorial-dimension-configuration.md).
