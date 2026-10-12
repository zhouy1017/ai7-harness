---
status: accepted — execution roles and reuse amended by ADR 0089
---

# Run developer-live autonomously, size the ceiling per unit, and admit a conversion dependency

Necessary developer-host Provider testing may run autonomously within the Owner's authorized rules, existing product Run budget semantics and subscription limits. [ADR 0067](./0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md) owns the exact-response versus similar-evidence reuse boundary, credential protection and reporting. [Orca dispatch](../agents/orca-dispatch.md) owns assignment and review. Human attendance and a new approval for each call or batch are not requirements.

## Existing ceiling calculation

The implemented development default is 30,000 tokens multiplied by the frozen Coverage Manifest unit count, with an explicit launch ceiling overriding it. The starting measurement was `S40/smoke/1`: eight units, 12,565 input tokens and 101,202 output tokens, 113,767 total. The largest observed unit used roughly 26,100 tokens. This is one book and one model's measurement, not a universal cost estimate; output accounting includes model reasoning where the provider reports it that way.

The manifest is frozen before deriving the default and freezing the plan. The existing product ceiling continues to preserve partial results when reached. Migration to the target Go model must measure its actual cost and keep task completion and avoidance of waste as the objective; no daily, count or per-operation quota is added by this ADR. CI and the Gate remain provider-free.

## Narrow conversion-dependency authorization

Multi-format manuscript intake may add a pure JavaScript or WebAssembly conversion dependency with a permissive license. Its bounded purpose, size and license are reported in the implementing pull request. This authorization admits no native addon, copyleft dependency, general-purpose interpreter, unrelated package or network conversion service. Import remains local and provider-free under V2-UX-IMP-001; every other dependency pin and provenance rule stands.

This decision does not widen product Effect, export, publication, release or `main` authority.
