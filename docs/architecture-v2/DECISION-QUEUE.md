# V2 owner decision queue

Status: **no current owner decision blocks the coherent V2 candidate**

This queue contains only future choices that would materially change accepted scope or authority. DSH capability unknowns, exact versions, package selection, composition details, configuration fields, event shapes, and ordinary implementation trade-offs are not owner questions and do not enter this file. Neither is routine provider configuration: binding the Frontier Model Role to another eligible provider is a user setting inside the accepted architecture, not an owner decision.

| Decision | Trigger | Owner must choose | Until then |
| --- | --- | --- | --- |
| Generic-loop fork | DSH extension seams and AI7-owned code cannot express required loop behavior, so AI7 would have to fork or reimplement the generic agent loop. | Whether to accept a forked loop and its maintenance, change the requirement, or change the harness. | DSH remains the sole unforked generic loop; AI7 writes no second implementation. |
| Primary Agent Harness replacement | DSH becomes unmaintained, changes terms, or diverges so far that pinning it is no longer viable. | Which single harness owns the one production loop and what migration the change implies. | DSH remains the sole Primary Agent Harness, consumed as an exactly pinned package subset. |
| Plugin admission exception | An identified need has no adequate AI7-owned or DSH-seam answer, and no candidate plugin meets the admission thresholds. | Whether to relax the thresholds for that case, fund an in-house implementation, or drop the capability. | The admission thresholds in ADR 0002 hold, and no plugin below them enters the composition. |
| Platform or surface expansion | A release proposes an OS beyond Windows and macOS, web/mobile, or Microsoft Word integration. | Exact new platform/surface promise and the product outcomes it must preserve. | V1 is one Windows-and-macOS Standalone product; Word is excluded. |
| Product-authority expansion | A proposal lets editorial users activate hidden Policy/composition changes, grants the agent new authority, merges a named decision with execution approval, or lets a model or plugin escalate its own Model Role or capability surface. | The new actor, scope, records, safeguards, and explicit supersession of current authority rules. | Existing named authorities and developer-controlled activation remain; capability expansion never self-activates. |
| macOS distribution mechanics | Implementation reaches platform packaging. | Minimum macOS and CPU policy, package/update channel, Agent Data Root location, Keychain adapter details, local IPC carrier, and signing/notarization posture. | macOS remains in product scope; no Windows packaging or signing rule is inferred. |
| Platform signing | The owner wants to fund and operate a platform signing identity. | Windows signing and macOS signing/notarization are decided independently. | Windows remains unsigned with the known SmartScreen adoption cost; no Apple posture is inferred from that choice. |

These are trigger-based future decisions, not unresolved defects. None authorizes implementation or delays presentation of this architecture to the owner.
