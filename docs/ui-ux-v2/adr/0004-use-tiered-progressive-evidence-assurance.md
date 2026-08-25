---
status: accepted-candidate
---

# Use policy-bounded tiered progressive evidence assurance

AI7 exposes `快速整理`, default `标准核查`, and `严格核查` as progressive Evidence Assurance Levels over one evidence workspace. Quick returns labeled candidates and may support pending findings or evidence-incomplete correction drafts but cannot record supported or contradicted formal Factual Verification. Standard checks selected/high-relevance evidence progressively and blocks only on the active policy's Minimum Evidence Gate at determination. Strict completes full policy-required selected-evidence assurance. Every level preserves the hard semantics that model knowledge is not evidence, certified quotation requires Exact Fetch, unchecked dependent sources do not count as independent corroboration, conflict remains visible, and policy minimums cannot be bypassed.

## Considered options

- Requiring every assurance check before showing any source was rejected because it serializes discovery, delays useful comparison, and makes long-running factual review unnecessarily blocking.
- Treating quick results as a lower-quality formal verification was rejected because users could not distinguish candidates from admissible evidence and policy meaning would drift with a UI preference.
- Keeping only one hidden adaptive mode was rejected because editors need to understand added work, policy constraints, and whether a result is merely triage or eligible for formal determination.
- Allowing users to override a policy minimum was rejected because assurance level controls workflow timing, not evidence admissibility or factual authority.

## Consequences

AI7 gains faster progressive discovery and explicit workload control, but every evidence card and downstream correction must carry assurance state. The product must reuse completed checks when levels rise, enforce minimum gates only at semantically necessary actions, preserve evidence-incomplete labels downstream, and keep all level selection separate from model quality, source scope, and downstream authority.
