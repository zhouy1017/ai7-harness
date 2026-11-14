# Policy documents

[ADR 0102](../adr/0102-retire-runtime-policy-locks-and-frozen-fixture-admission.md) implements the Owner's D2 and 2026-11-14 decisions: Provider Processing JSON, schemas, human projections and active-policy-set manifests are historical records. No policy document is selected or read by model launch, model egress, deterministic fixture admission or retained-analysis reading. Missing or changed historical bytes cannot refuse model processing. No policy JSON is bundled into the product.

`config/runtime-execution-defaults.json` supplies the existing task recipes, tool registrations, execution governor defaults, deadlines, search retry terms and budgets. Provider channel configuration owns wire protocols, endpoints and credential slots. Neither is a document-fingerprint or model/content admission lock. Historical identity readers remain for old records; new records use the fixed `no-policy-lock` marker.

External Export v1/v2 are retained history. Export remains a separate product effect: its existing preparation, approval, atomic write and outcome receipt owners keep enforcing the same eligibility and effect authority. The former export fingerprint no longer gates model processing; see ADR 0102 clause 4.

[Learning eligibility](learning-eligibility-policy.md) and [factual verification](factual-verification-policy.md) retain their domain design role. They are not selected runtime policy locks. Repository protected-material admission, development capture and record/reuse, credential isolation, provider-free CI and public-fetch network denial retain their own owners in [AGENTS](../../AGENTS.md) and the [CI boundaries](../agents/ci-test-boundaries.md).

All predecessor policy files are kept unchanged for named historical questions and persisted record interpretation. `node tools/validate-policies.mjs` can still inspect historical document/schema consistency locally; it grants no runtime permission and creates no gate.
