# Provider Processing Policy v9

This is the human projection of [the immutable v9 JSON](provider-processing-policy.v9.json), validated by [its schema](provider-processing-policy.v9.schema.json). It directly succeeds selected developer-live [v5](provider-processing-policy.v5.json) under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md). v6 is an ordinary-production sibling, v7 is unselected, and v8 remains reserved by the separate web proposal in PR #742. Activation requires the exact [active-set v7](active-policy-set.v7.json) pin and trusted launch carrier; an internal active label grants no dispatch authority.

| Boundary | Exact admission |
| --- | --- |
| Scope | Developer host `developer-live`; CI and hosted execution refused |
| Origin | Newly user-initiated baseline manuscript analysis with direct Run Authorization |
| Kind | `baseline-manuscript-analysis`, including its existing updates and continuation |
| Data | `public-or-synthetic`, restricted by runtime to admitted exact sample1 lineage and permitted tester edits |
| Binding | `opencode-go/deepseek-v4.1-flash`, `https://opencode.ai/zen/go/v1/chat/completions`, broker slot `opencode-go` |
| Operations | Coverage units and declared safe adaptations, cross-unit topic reduction, assurance sample anchors and one Run Report reflection turn |
| Budget | Existing non-unset Run ceiling, default 30,000 tokens per frozen unit; evaluated before every dispatch |
| Account limit | `quota-exhausted` ends the Run; no retry, second model, Provider or spending-source fallback |

The default is deny. Default Execution Rules, Background Analysis Enrollment, idle/scheduled/import-triggered/cross-Run dispatch, all other task kinds, web tools and unpublished data categories remain refused. Unattended necessary development validation is allowed; it does not introduce a daily, batch or call-count quota. Similar development evidence is reused under ADR 0089 and the existing protected Ledger/Result Cache; ordinary user business never inherits this cache or development credential.

House people names/roles, remarks and internal notes are stripped; author information and house name may be included. The enrollment helper alone reads the key file; the Credential Broker releases the secret only to the final adapter. Request/response captures stay outside every checkout and never enter logs, diagnostics, uploads or Git. Reviewed fixture admission is separate.

Provider eligibility is not Run Authorization, Apply, export, learning, publication or public release permission. Source-checkout ordinary-production remains unavailable. The independent official DeepSeek route is retained. Owner-reported permission for editorial use remains an Owner attestation, not a vendor-documentation claim.
