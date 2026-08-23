# Clarification 0004 — Minimal validation and design-first continuation

Status: **owner accepted on 2026-08-23**

## Question resolved

Should AI7 keep the accumulated architecture, source, artifact, capability-closure, implementation, release, and runtime verification gates, or simplify validation so design can proceed quickly?

## Owner answer

Delete or skip the additional verification work. CI tests concentrate only on end-to-end functional completeness and detection/regression of observed bugs. All other engineering validation is omitted.

## V2 consequence

- Stop every remaining A2 source, artifact, extractor, qualification, scoring, and closure-proof task.
- Treat earlier A1/A2 results as optional design reference, not gates or required evidence.
- Proceed with Codex as the assumed primary harness and Desktop-like interaction template.
- Treat missing Codex behavior as an explicit implementation assumption, normally handled through low-cost Codex secondary development.
- Keep DeepSeek Harness as development-rule and documentation/design guidance only unless the owner later makes a separate runtime choice.
- Keep one optional hostile architecture review as advisory feedback; do not require exact-head review or a proof/re-review cycle.
- Keep product Factual Verification, authority records, Effect Receipts, recovery, privacy, and related behavior as functional design, covered only through applicable E2E journeys rather than separate validation systems.

This clarification does not authorize implementation, issue decomposition, dependency installation, merge, push, release, or other external action.
