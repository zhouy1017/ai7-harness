---
status: accepted; obsolete cadence and role clauses removed under ADR 0089
---

# Bound hosted Actions consumption inside the E2E Gate

Hosted CI supplies integration evidence; local development supplies the debugging loop. [ADR 0027](./0027-concentrate-ci-on-e2e-functionality.md) retains one logical provider-free E2E Gate and its product/platform boundary. A failing product, build or Journey is reproduced and repaired locally before integration.

The original single-occurrence cadence, dormant-Journey list and exhaustion instructions are removed. [ADR 0075](./0075-split-the-hosted-gate-into-a-fast-pull-request-lane-and-a-nightly-full-gate.md) and [ADR 0081](./0081-run-the-nightly-full-gate-over-every-open-pull-request-merge-the-ones-that-pass-and-then-over-dev.md) describe the current PR/nightly implementation; [CI and test boundaries](../agents/ci-test-boundaries.md) owns verification practice. [Orca dispatch](../agents/orca-dispatch.md) alone assigns authoring, review, Ready and merge authority. [#806](https://github.com/zhouy1017/ai7-harness/issues/806) adapts that implementation to wave branches and explicit integration release.

[ADR 0053](./0053-preserve-local-first-development-through-a-bounded-ci-degraded-mode.md) owns the bounded response to a recorded external CI outage. [ADR 0058](./0058-remove-actions-usage-observation-from-development-gating.md) excludes Actions-usage queries from development decisions. Neither an outage nor local success creates a fabricated green Gate.

Retain exact dependency restoration, provider-free CI, public test material and payload-safe reports. Necessary developer-live work is separately governed by [ADR 0089](./0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md); this Gate boundary does not prohibit it. Earlier normative text is available through Git history.
