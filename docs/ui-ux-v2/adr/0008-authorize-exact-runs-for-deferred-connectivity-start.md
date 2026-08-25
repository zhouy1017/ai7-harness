---
status: accepted-candidate
---

# Authorize exact Runs for deferred start after connectivity returns

AI7 offers `授权并在联网后开始` only as an explicit alternative when an offline editor can inspect and bind the same exact authority boundary required for an ordinary Run. Invoking it creates the Run Record and Run Authorization immediately, then places that Run in Connectivity Wait State without model activity or provider cost. Reconnect Preflight may dispatch the existing Run automatically only when the goal and plan, target/source pins, Task Skill/version, provider/model/fallback, outbound-data category, budget, Credential Reference, policies, and other authority-bearing constraints remain materially unchanged and live service/credential readiness is valid.

Material boundary drift suspends automatic start and requires an exact Plan Revision plus renewed Run Authorization. A missing, invalid, expired, or inaccessible credential—or an unavailable provider service—under an otherwise unchanged boundary is a remediation blocker, not invented plan drift: the existing authorization remains pending, no fallback occurs silently, and Reconnect Preflight runs again after remediation. The waiting Run remains cancellable. An unselected Task draft never self-starts, and connectivity return never launches a closed AI7 application or service.

## Considered options

- Saving only a Task draft and always requiring a later manual start was rejected because it adds avoidable return friction after the editor has already inspected and chosen an exact future execution boundary.
- Automatically starting every offline Task draft when connectivity returns was rejected because a draft contains no Run Authorization and could execute after context changed without a deliberate delayed-consent action.
- Explicit deferred authorization against one exact Run was accepted because it preserves editor intent and flow while keeping delayed execution bounded, auditable, cancellable, and subject to deterministic reconnect checks.

## Consequences

Connectivity Wait State and Reconnect Preflight are durable product states rather than transient network spinners. The authorization surface must explain that execution can begin later without another click, name the exact authorized boundary, expose cancellation, and preserve an audit of authorization, wait, preflight, remediation, dispatch, or cancellation. Secret values are never compared or displayed; only the unchanged Credential Reference and current brokered readiness participate. Implementations must keep connection/readiness blockers separate from material Plan drift so remediation neither broadens authority nor creates unnecessary renewed consent.
