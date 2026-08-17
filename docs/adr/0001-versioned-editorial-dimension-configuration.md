---
status: accepted
---

# Version Editorial Dimension configuration at task start

AI7 uses stable Editorial Dimension identities across a reusable Editorial Profile and Book-specific overrides, then snapshots the effective names, descriptions, selection, and weights when a task starts. Later edits apply prospectively; referenced dimensions are archived rather than deleted, so production customization remains flexible without rewriting historical task evidence.

## Consequences

Profile changes do not silently modify existing Books, and Book changes do not alter completed or running tasks. Applying newer profile defaults to a Book is an explicit action whose resulting configuration is visible before subsequent tasks begin.
