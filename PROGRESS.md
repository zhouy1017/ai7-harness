# Progress

## What's done

- The Owner approved the `to-issues` decomposition of [PRD Issue #28](https://github.com/zhouy1017/ai7-harness/issues/28) into 31 bounded outcomes, S01–S31, published as [Issues #36–#66](https://github.com/zhouy1017/ai7-harness/issues?q=is%3Aissue%20number%3A36..66). The exact planning base `dev@e385e767d343485d0ca1a58f82b3d015c7a3e078` descends from immutable Issue #24 integration checkpoint `4ef62ac1d1de37c2cc644fd17669bd4669ec8441`.
- [Issue #36](https://github.com/zhouy1017/ai7-harness/issues/36) is the only `ready-for-agent` outcome. It authorizes the existing bounded J-01 tracer to use exact admitted input [`SampleBooks/sample1.docx`](SampleBooks/sample1.docx) (29,550 bytes; SHA-256 `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483`) instead of generating a synthetic DOCX at runtime. This remains an extension of the tracer, not full J-01 authority.
- [Issues #37–#66](https://github.com/zhouy1017/ai7-harness/issues?q=is%3Aissue%20number%3A37..66) are `enhancement` backlog only. Their approved decomposition records requirements and dependencies but does not authorize dispatch or implementation.
- J-14 accessibility, keyboard, Chinese, zoom, and cross-platform coverage is carried as acceptance coverage inside each applicable Journey; it is not an independent Journey slice, proof programme, or gate.
- Archive sweep: none. The approved decomposition created active backlog and current routing; it did not complete an implementation or supersede material that needs archiving.

## What's next

- The Commander may separately dispatch only [Issue #36](https://github.com/zhouy1017/ai7-harness/issues/36) from the then-current exact `dev` under its bounded Change Brief.
- Do not dispatch Issues #37–#66 until the Owner makes a later exact selection and the selected Issue is made work-ready against the then-current `dev`.

## Key decisions made

- PRD decomposition and implementation authority remain separate: publishing S01–S31 does not authorize implementing the full PRD or full J-01.
- `SampleBooks/sample1.docx` is the one exact admitted input authorized for Issue #36; no other SampleBook gains Journey-consumption authority from this routing update.
- Existing owners must be extended; the integrated tracer is not treated as complete J-01 and J-14 does not become a new standing gate.

## Unresolved matters or blockers

- Issues #37–#66 await later exact Owner selection and work-ready authorization; none is currently dispatchable.
- Provider/export work, live-provider calls, release, `main` promotion, and any unnamed SampleBook consumption remain outside current authority.

## Resume Prompt

As Commander, reverify the then-current exact `dev` and separately dispatch only Issue #36 under its bounded Change Brief, extending existing owners and using exact `SampleBooks/sample1.docx`; do not treat the tracer as full J-01 or dispatch Issues #37–#66 without later exact Owner selection.
