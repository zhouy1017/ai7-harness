---
status: accepted-candidate
---

# Use user-approved default execution rules for trusted task patterns

AI7 lets an editor who has developed confidence in a repeatable task pattern approve a versioned Default Execution Rule so future user-initiated exact matches can start without repeated Task Intent review. This reduces routine interaction while preserving authority: deterministic preflight must establish the exact skill/version, permitted field variation, applicability and per-Run source scope, provider/outbound constraints, budget, outcomes, and Effect classes; every Run still creates its own Task Intent, Execution Plan, Plan Envelope, and Run Authorization linked to the rule version. Any mismatch or drift falls back to standard preparation, rules remain inspectable/revocable/versioned, and no rule grants factual authority, result acceptance, Apply, Effect Approval, Signoff, or Public Release Permission.

## Considered options

- Requiring full Task Intent review for every Run was rejected because it imposes repeated low-value interaction after the editor has explicitly established trust in a bounded task pattern.
- Treating one rule as a standing Run Authorization was rejected because every production Run must retain exact intent, plan, envelope, budget, source, provider, and authorization identity.
- Letting confidence auto-apply results was rejected because confidence in useful output is not a Proposal Decision, factual proof, Effect Approval, or Effect Receipt.

## Consequences

Default execution remains fast for routine work but fails closed to standard preparation whenever matching, context, version, source, provider, outbound data, budget, outcome, or Effect class differs. Historical Runs retain the exact rule version that permitted their authorization.
