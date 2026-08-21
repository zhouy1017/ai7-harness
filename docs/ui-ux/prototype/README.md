# AI7 V1 shell prototype

> **PROTOTYPE — throwaway design code, never production source**

Question being tested: **Which desktop shell best preserves a manuscript-first experience while keeping governed AI work visible and reachable?**

Three structurally different variants share one synthetic Book and one factual-verification journey:

- `?variant=A` — **协作三栏**: persistent Book navigation, centered editor, contextual right inspector.
- `?variant=B` — **稿件专注**: maximum manuscript surface with temporary drawers and a compact command header.
- `?variant=C` — **编辑台面**: Book map and attention strip around a document/evidence desk.

The same task state is preserved while switching variants so layout differences can be compared rather than differences in content.

## Open

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File docs/ui-ux/prototype/open.ps1
```

Alternatively open `index.html` directly. Use the floating bottom switcher or the left/right arrow keys to change variants. Arrow keys are ignored while an input, textarea, select, button, or editable region has focus.

## Core journey

1. Inspect the exact synthetic manuscript selection.
2. Open the bottom task entry.
3. Confirm Task Intent and Plan Preview.
4. Grant exact task-run authorization.
5. Observe a business-readable running state while the editor remains available.
6. Review `引证完整性`, `陈述支持`, and `事实核验` separately.
7. Open exact evidence and highlight its manuscript range.
8. Review an inline Correction Proposal and optionally switch to comparison.
9. Record the Proposal Decision, then separately observe application and Effect Receipt.
10. Give optional, non-preselected feedback.

## Fixture boundary

Every Book title, paragraph, source, citation, result, identifier, and revision in this prototype is invented for UI evaluation. None is a real manuscript or derived from an authorized private sample.

## Freeze-candidate boundary

No shell has been selected, and no prototype cleanup or continuation is authorized on this branch. The Commander may compare these V1 candidate/reference variants after exact-head review; this prototype must never be promoted directly to product code.
