# Decision Records

Accepted system-wide architecture decisions live under [`docs/adr/`](../../docs/adr/):

- [ADR 0001: Version Editorial Dimension configuration at task start](../../docs/adr/0001-versioned-editorial-dimension-configuration.md)
- [ADR 0002: Separate Book, Series, Cross-project, and House-learning scopes](../../docs/adr/0002-book-series-cross-project-and-house-learning-scopes.md)
- [ADR 0003: Use foundation models with governed editorial intelligence, not LLM training](../../docs/adr/0003-use-foundation-models-with-governed-editorial-intelligence.md)
- [ADR 0004: Govern learning eligibility with versioned Policy Documents](../../docs/adr/0004-govern-learning-eligibility-with-versioned-policy-documents.md)
- [ADR 0005: Separate textual fidelity from factual verification](../../docs/adr/0005-separate-textual-and-factual-authority.md)
- [ADR 0006: Preserve manuscript-native history and recovery](../../docs/adr/0006-preserve-manuscript-native-history-and-recovery.md)
- [ADR 0007: Separate decisions, authority, and Effect proof](../../docs/adr/0007-separate-decisions-authority-and-effect-proof.md)
- [ADR 0008: Use deliverable-owned workflow profiles](../../docs/adr/0008-use-deliverable-owned-workflow-profiles.md)
- [ADR 0009: Use authority-bearing Plan Envelopes](../../docs/adr/0009-use-authority-bearing-plan-envelopes.md)
- [ADR 0010: Separate Task Skill instruction, implementation, and authority](../../docs/adr/0010-separate-task-skill-instruction-implementation-and-authority.md)
- [ADR 0011: Separate task-business and Harness-execution ledgers](../../docs/adr/0011-separate-task-business-and-harness-execution-ledgers.md)
- [ADR 0012: Exclude legacy production-data migration](../../docs/adr/0012-exclude-legacy-production-data-migration.md)
- [ADR 0013: Ship a Standalone-only V1 and defer Word integration](../../docs/adr/0013-ship-standalone-only-v1.md)
- [ADR 0014: Verify on one Windows gate and defer additional tiers](../../docs/adr/0014-verify-on-one-windows-gate.md)
- [ADR 0015: Keep development dispatch rules provider-neutral](../../docs/adr/0015-provider-neutral-development-dispatch.md)
- [ADR 0016: Keep AI7 proprietary and sample manuscripts local-only](../../docs/adr/0016-proprietary-license-and-local-only-sample-manuscripts.md)
- [ADR 0017: Compose the full Harness engine behind a narrow tool surface](../../docs/adr/0017-full-engine-narrow-tool-surface.md)
- [ADR 0018: Tier activation for agent-authored revisions](../../docs/adr/0018-tiered-activation-for-agent-authored-revisions.md)
- [ADR 0019: Measure editorial quality from editor decisions and gate behavior on it](../../docs/adr/0019-editorial-quality-metrics-and-behavior-evaluation-gate.md)
- [ADR 0020: Consume a pinned subset of Harness packages](../../docs/adr/0020-consume-pinned-harness-package-subset.md)
- [ADR 0021: Keep one agent-loop implementation and schedule from AI7](../../docs/adr/0021-single-execution-authority.md)

Create a record here only when a choice is hard to reverse, surprising without context, and the result of a real trade-off. Use sequential names such as `0001-fresh-ai7-repository.md` and keep the record concise: what was decided, why, meaningful rejected alternatives, and any non-obvious consequence.

Routine planning answers remain in the decision map and do not need an ADR.
