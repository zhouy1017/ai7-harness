---
status: accepted — development operations amended by ADRs 0070 and 0089
---

# Admit a developer-live Provider Processing scope

`developer-live` separates necessary real-model development from provider-free CI and ordinary product use. [ADR 0089](./0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md) and [Orca dispatch](../agents/orca-dispatch.md) own repository execution and the new delivery order. [ADR 0067](./0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md) owns development-test reuse and the credential boundary.

## Effective scope rules

- A trusted developer-host launch selects the scope. Necessary tests may be run autonomously within the Owner's authorized rules, existing product Run budget semantics and subscription limits; no per-call attendance or fresh batch approval is required. CI, hosted execution and background test guests stay provider-free.
- Development uses only admitted Public SampleBooks, including permitted tester edits of `sample1`. Private user manuscripts remain outside development tests and captures.
- Each planned Run retains its exact Plan Envelope, Run Authorization, declared transmissions and explicit Run Budget Ceiling. The dialogue exception remains [ADR 0088](./0088-carry-the-editorial-dialogue-under-developer-live.md). Repository authorization does not bypass a product authority seam.
- Credentials enter the Protected Secret Store through the enrollment helper and leave the Credential Broker only against the bound remote-transmission ticket. Agents never read or expose key values.
- The existing host-local Provider Test Ledger and Provider Result Cache, outside every repository, retain authorized captures. Raw bytes never enter logs, hosted artifacts or Git. Reviewed fixture generation carries only admitted, sanitized deterministic material into the repository.
- Development reuse is separate from ordinary production: each new user Task is processed according to its own current input and product authority. A cached development result is never substituted for the user's new manuscript or question.

## Runtime migration boundary

[#807](https://github.com/zhouy1017/ai7-harness/issues/807) implements the ADR 0089 target: the source-checkout runtime selects active-policy-set v7, whose `developer-live` pin is the baseline-only Provider Processing v9 with `opencode-go/deepseek-v4.1-flash`, the direct successor of v5 with `opencode-go/deepseek-v4-flash`. The initial v4 policy and every later immutable version remain unchanged bytes, the official DeepSeek adapter is preserved, and ordinary-production launch stays unselectable from the source checkout. The [policy index](../policies/README.md) owns the current selection.

[ADR 0070](./0070-run-developer-live-unattended-and-size-the-ceiling-per-unit.md) retains the implemented per-frozen-unit ceiling calculation. Task completion and prevention of waste govern necessary validation; no new daily allowance, test-count quota or per-operation budget is created here.
