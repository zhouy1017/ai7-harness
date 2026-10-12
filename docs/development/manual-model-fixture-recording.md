# Retired manual-recording guidance

The former per-recording attendance and permission procedure has been removed under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md). Git history retains the old text.

Necessary development validation follows the [development credential and evidence boundary](../adr/0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md) and ADR 0089: record the new question, reuse existing evidence when it answers that question, and capture any necessary new result through the product's admitted path and protected Ledger/Result Cache. [#808](https://github.com/zhouy1017/ai7-harness/issues/808) owns the remaining reuse implementation; [#387](https://github.com/zhouy1017/ai7-harness/issues/387) owns the first model-derived analysis fixture.

Provider Processing v2 remains an immutable runtime record. Its retained bytes are not an alternative development dispatch procedure and do not establish that a new recording has been authorized or executed. Policy migration happens in the implementation slice, not by editing that record.

Review and sanitize fixture candidates with source/model/contract provenance before repository admission. Raw Provider payloads and secrets remain outside repositories, Issues, logs and hosted CI; admitted fixtures are development evidence, never fresh business answers or current-model quality proof.
