# Converting development captures to model fixtures

The former per-recording attendance and permission procedure has been removed under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md). Git history retains the old text.

Necessary development validation follows the [development credential and evidence boundary](../adr/0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md) and ADR 0089: record the new question, reuse existing evidence when it answers that question, and capture any necessary new result through the product's admitted path and protected Ledger/Result Cache. A developer-live launch names its question as `--validation-case <family>/<case>`, and names any substantive delta as `--validation-delta input:<rationale>` or `retry-unknown:<rationale>`. The ledger refuses, without sending, a call that existing evidence already answers ([source checkout](source-checkout.md), #808). [#387](https://github.com/zhouy1017/ai7-harness/issues/387) owns the first model-derived analysis fixture.

Provider Processing v2 remains an immutable runtime record. Its retained bytes are not an alternative development dispatch procedure and do not establish that a new recording has been authorized or executed. Policy migration happens in the implementation slice, not by editing that record.

Review and sanitize fixture candidates with source/model/contract provenance before repository admission. Raw Provider payloads and secrets remain outside repositories, Issues, logs and hosted CI; admitted fixtures are development evidence, never fresh business answers or current-model quality proof.

Run the existing converter on the developer host, naming an admitted item or full request digest in the protected external cache:

```text
node tools/generate-model-fixture.mjs --from-cache <item-or-digest> --cache-root <external-cache-root> --identity <fixture-id> --description <safe-description> --out <external-staging-file>
```

All five arguments are required. Output under any `tests/fixtures/` directory is refused; a sanitized candidate enters the repository only through its separately scoped review. The tool prints the output path or a bounded refusal, never the request or response. This conversion needs no Provider call or credential.

Conversion recognizes the existing unit, reduction, sampling, reflection, factual/review/evaluation/writing and dialogue contracts already consumed by the deterministic adapter. Recognition does not admit a live Task or establish model capability. Each entry keeps structured `capture` provenance: original and selected item, actual model, actual stage `promptContractDigest` and enclosing `taskPromptContractDigest`, capture time, exact request/response hashes, namespace and generation, validation purpose, explicit block/finding placeholder mappings and the sanitized response hash. The adapter refuses a namespaced converted entry from a different enclosing task contract. Recorded usage remains the original capture's usage; fixture replay incurs no Provider transmission.

Namespaced entries must agree with their ledger's route, endpoint, request shape, model, full request digest, source item, contract and generation. Item or validation-case invalidations follow ledger order and retire the original capture even when conversion names a replay. Unknown, refused, unproved, damaged, ambiguous or retired captures produce no candidate. Historical unnamespaced captures remain labeled `legacy-unnamespaced` with null namespace/generation facts; conversion never invents their route or endpoint. Their response hash is explicitly `computed-legacy`, calculated during conversion rather than historically recorded; it cannot establish original response integrity or a new model's quality. Converted dialogue chunk boundaries are deterministic segmentation, not original streaming evidence.

The converter remaps cited blocks and sampling findings to the adapter's existing placeholders, checks carried blocks and prior model text for echoes, and refuses unknown block identities. A reviewer still reads every free-text field and verifies rights, source identity, mappings and the intended contract before admission. Synthetic provider-free converter/loader tests establish regression behavior only; they do not establish real editorial quality or current remote-model performance.
