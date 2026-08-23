# Clarification 0002 — Codex gap closure and DeepSeek runtime re-entry

Status note: Clarification 0004 supersedes this record's proof and validation threshold. Its no-automatic-DSH-runtime and no-dual-loop boundaries remain; Codex-first may now proceed by design assumption without capability-closure proof.

Status: **owner accepted for the V2 candidate; canonical integration pending; exact Codex development form remains open**

Recorded: **2026-08-21**

Decision owner: **AI7 owner**

Record owner: **Repository Development Commander**

## Question

What class of Codex capability gap is sufficient to reopen DeepSeek Harness as a production runtime candidate?

## Recommended answer presented

Reopen the runtime choice only for a load-bearing execution, safety, or continuation gap that cannot be closed through a narrow AI7 adapter without reproducing a second generic agent loop. Keep prompt, profile, composition-convention, and documentation gaps in AI7-owned Agent Behavior Assets and development guidance. Never activate DeepSeek automatically.

## Exact owner answer

> 同意，同时能力缺失也不一定要通过DSH运行时弥补，我们要在codex开源上进行二次开发，完全可以低成本开发缺失能力。只有codex缺失且dsh可以提供成熟替代时才考虑引入DSH运行时

## Accepted interpretation

1. A verified Codex capability gap does not by itself reopen or admit a DeepSeek runtime.
2. AI7 first prefers **Codex Secondary Development**: close the gap through the open Codex source and its public integration or extension seams while preserving one production agent loop and all AI7 authority boundaries.
3. “Low cost” is the owner's planning premise and preference, not an unevaluated architecture fact. A2 must estimate implementation, testing, security, licensing/notices, platform, upstream-update, protocol-migration, and long-term maintenance cost for each proposed Codex change.
4. DeepSeek runtime evaluation becomes eligible only when both necessary conditions hold: the exact Codex surface lacks a required capability, and an exact DeepSeek surface offers a **Mature Runtime Alternative** for that capability.
5. Those conditions permit comparison only. They do not select DeepSeek, create a fallback, or authorize a second loop. The candidate must compare Codex development against the DeepSeek alternative and return the residual trade-off to the owner.
6. If DeepSeek is later selected, one runtime must replace the other for the affected production role. Codex and DeepSeek may not operate as interchangeable or automatic-fallback generic agent loops inside one authorized Run.
7. Missing prompts, profiles, behavior composition, checklists, or documentation remain AI7-owned assets or development references unless exact evidence shows they require a runtime capability.

## Resolved V2 terms

**Codex Capability Gap** (`Codex 能力缺口`):
An AI7 load-bearing requirement that an exact Codex component, pin, protocol, and supported configuration demonstrably cannot satisfy. Missing documentation, an undiscovered seam, or an untested assumption is not yet a capability gap.

**Codex Secondary Development** (`Codex 二次开发`):
AI7-authored engineering based on the open Codex codebase or its public seams to close an exact capability gap while preserving a single Primary Agent Harness. The exact maintenance form—external adapter/extension, upstream contribution, maintained patch set, or fork—is not decided by this clarification.

**Mature Runtime Alternative** (`成熟运行时替代方案`):
An exact, obtainable, license-compatible, platform-compatible, maintained, testable runtime surface that demonstrably supplies the missing capability and has credible lifecycle, persistence, security, upgrade, packaging, and verification behavior. A repository feature, design document, unpublished package, or marketing claim alone is not mature evidence.

**DeepSeek Runtime Re-entry Gate** (`DeepSeek 运行时重评关口`):
The evidence gate that permits DeepSeek to return to the production-runtime comparison only after an exact Codex Capability Gap and a Mature Runtime Alternative in DeepSeek are both proven. Passing the gate starts a comparison and owner decision; it grants no runtime authority.

The Worker must place these terms in the owning candidate execution `CONTEXT.md` and bilingual glossary on its branch.

## A2 gap-closure ladder

For every claimed missing capability, A2 must proceed in this order:

1. Verify the requirement and the gap against exact Codex source, protocol, supported configuration, and a provenance-labeled probe where needed.
2. Reject false runtime gaps by expressing development rules, prompts, profiles, composition guidance, or documentation as AI7-owned assets.
3. Design and cost a Codex-based closure that preserves one loop and the AI7/Codex authority boundary.
4. Only if the Codex gap remains, determine whether an exact DeepSeek surface is a Mature Runtime Alternative.
5. If both conditions hold, compare delivery time, maintenance, security, licensing, platform behavior, persistence, migration, verification, and exit cost.
6. Return the residual production-runtime choice to the owner. Do not install, activate, or silently fall back to DeepSeek.

## Relationship to Clarification 0001

This record narrows the “failed Codex closure” branch in [Clarification 0001](./0001-primary-agent-harness-role.md). Clarification 0001 established that Codex is the sole production harness after capability closure and that DeepSeek never re-enters silently. Clarification 0002 adds that Codex secondary development is the preferred gap remedy and that a proven mature DeepSeek substitute is necessary—but not sufficient—for runtime reconsideration.

## ADR qualification

This threshold is part of the same hard-to-reverse production-harness trade-off as Clarification 0001. The Worker should incorporate it into the same candidate ADR rather than create a second overlapping record. The still-open choice among adapter, upstream contribution, patch set, and fork may qualify for its own ADR after the next owner clarification and exact A2 evidence.

## Canonical-integration and writer boundary

This record is a noncanonical owner input and authorizes no implementation, dependency, source copy, fork, prototype, pull request, push, merge, or release. The Commander owns this immutable record. The Issue #4 Worker must consume the exact Git object supplied by the Commander, cite it, and write resulting candidate context, glossary, ADR, gap matrix, and architecture changes only on `docs/4-v2-architecture-candidate`, never from the Commander/user transcript.
