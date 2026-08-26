# Approved PRD issue-decomposition handoff

Start with root [`AGENTS.md`](AGENTS.md), verify the exact current `dev` tip and its ancestry from immutable Issue #24 checkpoint `4ef62ac1d1de37c2cc644fd17669bd4669ec8441`, then read current [`PROGRESS.md`](PROGRESS.md). This file is a cold-start router, not product, domain, or implementation authority.

## Current state

The Owner approved the `to-issues` decomposition of [PRD Issue #28](https://github.com/zhouy1017/ai7-harness/issues/28) into S01–S31, published as [Issues #36–#66](https://github.com/zhouy1017/ai7-harness/issues?q=is%3Aissue%20number%3A36..66) from planning base `dev@e385e767d343485d0ca1a58f82b3d015c7a3e078`.

[Issue #36](https://github.com/zhouy1017/ai7-harness/issues/36) is the only `ready-for-agent` Issue. Its exact bounded outcome replaces runtime synthetic-DOCX generation in the existing J-01 tracer with admitted [`SampleBooks/sample1.docx`](SampleBooks/sample1.docx), 29,550 bytes, SHA-256 `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483`. It extends existing owners and does not grant full J-01 authority.

[Issues #37–#66](https://github.com/zhouy1017/ai7-harness/issues?q=is%3Aissue%20number%3A37..66) carry only the `enhancement` backlog classification. They are not implementation or dispatch authority until the Owner later selects an exact bounded outcome and it becomes work-ready against the then-current `dev`.

J-14 is acceptance coverage embedded in each applicable Journey—cross-platform behavior, keyboard use, Chinese input and presentation, zoom, and accessibility—not an independent slice or standing proof gate.

## Next safe action

The Commander may separately dispatch only Issue #36 after reverifying the then-current exact `dev` and the Issue's bounded Change Brief. Do not dispatch Issues #37–#66, broaden the tracer into full J-01, consume another SampleBook, or introduce provider/export work.

Archive sweep: none. Release, `main` promotion, live-provider use, and all authority outside the selected bounded outcome remain closed.
