# Progress

## What's done

- Confirmed the candidate worktree is clean on `docs/4-v2-architecture-candidate` at the required start `8eb70e315ea4a4103c1820fe9fd0bdeae49f5f93`.
- Read the current V2 candidate and the superseding Commander authorities at control head `f33052c152cbdc79da7f6a9d4c94423491a92ad0`, including ADR 0027, `kick-in/35-minimal-e2e-validation.md`, Clarifications 0001, 0002, and 0004, and `CODEX-HARNESS-DIRECTIVE.md`.
- Replaced the proof-oriented A2 candidate with the compact V2 document set: `docs/architecture-v2/{README,ARCHITECTURE,CODEX-INTEGRATION,MIGRATION,ASSUMPTIONS,DECISION-QUEUE}.md` and accepted-candidate ADR `docs/architecture-v2/adr/0001-codex-first-ai7-owned-architecture.md`.
- Reconciled `docs/architecture-v2/domain/execution/CONTEXT.md` and `docs/architecture-v2/GLOSSARY.md`; compacted `A1-PRODUCT-CONSISTENCY.md`; retained `A1-EVIDENCE-CROSSWALK.md` as explicitly historical, non-gating reference.
- Deleted superseded `docs/architecture-v2/{A2-CAPABILITY-CLOSURE,A2-CODEX-SEAM,A2-EVIDENCE-REGISTER,A2-GAP-REGISTER}.md` and the old conditional candidate ADR after carrying forward the useful adapter, ledger, Effect, and continuation design.
- Applied the bounded hostile-advisory correction at base `33b8f77` in `docs/architecture-v2/{ARCHITECTURE,CODEX-INTEGRATION,ASSUMPTIONS}.md`: added the AI7-owned final Provider Payload/Egress Gate; fixed Run/attempt/binding/Session-lineage/span cardinality and rebinding rules; added capability-outcome return plus durable Effect Approval suspension/recovery; and required all model-driven editorial work to use the sole Primary Agent Harness with a pinned behavior-composition digest.
- Recorded maintained-fork drift, E2E-only blind spots, long-manuscript cursor drift, and Codex Desktop-like interaction drift as accepted implementation risks with fail-closed responses and no validation tasks.
- Requested binding: Claude Code / `claude-opus-5` / high. Actual binding: GPT-5.6 Sol / `xhigh`, same-class fallback because real Claude session `1540bd4c-0b54-4454-8a5f-6b2dec2b1cc8` returned API HTTP 429 before inference at `$0`, and no later availability evidence exists.

## What's next

- Present this candidate to the owner through the Commander. Optional hostile architecture feedback is advisory only if separately requested.
- After explicit owner acceptance, the Commander may integrate the canonical context, glossary, ADR, standing-rule, and design-note dispositions. Product implementation still requires separate authorization.

## Key decisions made

- Codex is the assumed sole Primary Agent Harness for V2 design; unknown behavior becomes an explicit implementation assumption rather than a proof blocker.
- AI7 retains all product, domain, authority, provider, capability, persistence, lifecycle, UI, and Effect ownership.
- DeepSeek Harness is development-rule and documentation/design guidance only, with no production runtime role.
- Adapter/extension-first is a convenience preference; a small maintained Codex source build or fork is permitted when it is the simplest coherent implementation, without a capability-gap proof or maintenance gate.
- The final complete model payload is an AI7 egress decision even after Codex context assembly; prior Session content, compaction, tool results, subagent context, and defaults cannot bypass Run scope or provider/outbound policy.
- One attempt has exactly one immutable Execution Binding and Codex Session lineage, with one or more Harness Execution Spans; Retry starts new lineage, while Resume may add a span only under the unchanged binding.
- AI7 behavior composition is binding input, and every model-driven editorial, factual, proposal, learning, policy-candidate, or subagent operation uses the sole Primary Agent Harness.
- The only standing engineering CI surface is Windows E2E functional completeness and observed-bug regression.
- No current owner decision blocks the V2 design. Only future material expansions—DeepSeek runtime, a broad Codex platform fork, platform/Word scope, product authority, or code signing—return to the owner.

Resume Prompt: Present the minimally amended Codex-first, AI7-owned V2 candidate to the owner for acceptance; keep DSH guidance-only and do not begin canonical integration, validation work, or implementation without separate authority.
