---
status: accepted
---

# Transfer one editable Manuscript surface between the workbench and a detached window

AI7 treats `在独立窗口打开稿件` as a guarded transfer of the existing editable manuscript subpage, not as a second Reader or concurrent editor. For one exact Book/manuscript/branch, the service permits only one Active Manuscript Surface Binding. The Detached Manuscript Window retains the subpage's eligible editing, selection, search, Task, Proposal, factual-review and named-authority interactions without receiving additional scope or authority; the main workbench unloads the duplicate body and presents a direct locate/reattach placeholder.

Transfer waits for active Chinese IME composition to finish naturally and for current Edit Journal acknowledgement. Editing Protection Mode or a process-local Bounded Edit Safety Buffer blocks detach, reattach and destructive close because that buffer cannot safely move between Renderers. The target first loads a bounded noninteractive projection; the service atomically switches the binding; only then does the source unload. Failure leaves the source active. Ordinary detached-window close performs the same guarded transfer back to the workbench. Every Renderer remains bounded and the AI7 service remains the sole manuscript authority.

## Considered options

- A read-only detached Reader was rejected because the owner expects the detached manuscript subpage to support ordinary editing and contextual work.
- Two simultaneously editable manuscript mirrors were rejected because Chinese IME composition, unacknowledged input, undo/focus ownership and failure recovery would create surprising synchronization and conflict semantics.
- A single active surface transferred between hosts was accepted because it preserves full manuscript work without inventing a second authority or cross-window merge model.

## Consequences

The product needs a service-enforced binding and an all-or-source-safe window-transfer handshake. A transfer may wait briefly for IME completion or durable acknowledgement, and a protected local buffer keeps its originating Renderer alive. The workbench remains available for other Books and contextual work, while background Runs, exact-pin drift rules, decisions, Effects and receipts remain independent of where the manuscript page is hosted.
