# Documentation archive

This directory stores working documents that have completed their active lifecycle. It is not a current authority source, ordinary search surface, onboarding path, or place to recover requirements by recency.

Agents exclude `docs/archive/` from default reading, `rg` searches, context packets, and implementation briefs. Read one exact artifact only when a current authority owner or Change Brief identifies a concrete historical question and names the archive node that may answer it.

Archive creation and maintenance follow [document lifecycle and archiving](../agents/document-lifecycle.md). Stable ADRs, context definitions, Policy Documents, active runbooks, current `HANDOFF.md`, and current `PROGRESS.md` remain outside this directory.

## Nodes

| Lifecycle node | Trigger | Scope | Current replacement |
| --- | --- | --- | --- |
| [Agent-guidance baseline — 2026-08-25](./agent-guidance-baseline-2026-08-25/INDEX.md) | Activates atomically when Issue #14 is Commander-integrated into `design-doc`: successor routers consume the prior handoff/checkpoints, and the compact migration router applies the branch-local ADR 0027 supersession | Exactly eight paths from `design-doc@2932f61f5907558587122c7c4e0b92580951ab58`; see node index | Root [`AGENTS.md`](../../AGENTS.md), [`HANDOFF.md`](../../HANDOFF.md), [`PROGRESS.md`](../../PROGRESS.md), and focused [`docs/agents/`](../agents/README.md) runbooks |
