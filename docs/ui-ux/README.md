# AI7 UI/UX design package

Status: **V1 freeze candidate/reference; not canonical product or future-architecture authority**

> Platform supersession: this package intentionally preserves its original Windows-specific assumptions as historical reference. Current product scope is one Windows-and-macOS product under ADR 0028; use `docs/ui-ux-v2/` for the integrated shared-outcome and native-adapter design.

This directory is the V1 UI/UX freeze-candidate reference package produced for GitHub Issue #2. It translates the constraints available at base commit `c8cbe26` into candidate requirements, interaction guidance, and review artifacts. It does not change domain authority, bind a later platform architecture, or revive the legacy AI7 interface. Start with [V1 freeze handoff](./V1-FREEZE-HANDOFF.md) before reusing any part of it.

## Product direction

AI7 is a Chinese-first Windows editorial workbench. The interface is **Book-first and editor-first**:

- persistent Book navigation and a global work queue on the left;
- the manuscript or current Editorial Deliverable as the central work surface;
- one contextual inspector on the right;
- a lightweight task entry at the bottom that expands into the right inspector; and
- no developer-facing shell, terminal, arbitrary browser, roaming filesystem, model reasoning selector, or blanket-access control.

The Codex Desktop screenshot supplied for this design is visual evidence only. AI7 borrows its restrained spatial language, quiet surfaces, progressive disclosure, and visible background-work status. It does not copy Codex's coding objects, conversation-first hierarchy, tools, permissions, branding, or text from the screenshot.

## Reference precedence inside this candidate

For interpreting this candidate/reference package only, read artifacts in this order. This ordering does not promote the package above current domain records or a later Commander decision:

1. Accepted AI7 domain, policy, and ADR records govern product meaning and authority.
2. [Requirements](./requirements.md) record candidate UI behavior and package gates.
3. [Interaction specification](./interaction-spec.md) records candidate state transitions and screen behavior.
4. [Visual system](./visual-system.md) is a candidate visual reference for geometry and component appearance; the linked Figma file is raw visual evidence only.
5. The [HTML prototype](./prototype/README.md) demonstrates alternatives and interaction timing; it is throwaway design code, never production source.

## Package map

| Artifact | Purpose |
| --- | --- |
| [Requirements](./requirements.md) | User, scope, numbered requirements, non-functional constraints, acceptance |
| [Information architecture](./information-architecture.md) | Book-first navigation, shell regions, screen inventory, responsive rules |
| [Interaction specification](./interaction-spec.md) | User journeys, view-state contracts, decisions, errors, recovery |
| [Visual system](./visual-system.md) | Light-first tokens, Chinese typography, components, status and microcopy |
| [Usability test plan](./usability-test-plan.md) | Owner walkthrough and professional-editor validation |
| [Traceability](./traceability.md) | Requirement-to-source and requirement-to-prototype mapping |
| [HTML prototype](./prototype/README.md) | Three shell variants and the factual-verification/correction journey |
| [Figma handoff](./figma-handoff.md) | Editable candidate-frame links, node mapping, and captured limitations |

## Candidate design hypotheses

- One primary persona: a professional responsible editor, exercised across multiple tasks rather than through role-based access modes.
- Full V1 coverage is phased, but every V1 region ultimately receives the same level of requirements, visual, state, and prototype detail.
- Book-first navigation plus a global work queue.
- Context-aware natural-language task input plus Task Skill templates.
- Inline proposal review by default, with a side-by-side comparison mode for large or structural changes.
- Spacious immersive density, a centered continuous manuscript surface, UI sans-serif plus manuscript serif typography, and a sage/jade accent over warm neutral paper.
- Light theme first. Dark-theme semantics are reserved in tokens but dark screens are not a V1 design deliverable.
- Within this candidate/reference branch, repository requirements, Figma frames, and HTML prototype remain comparison evidence; none is canonical, accepted, authoritative, selected, or default product design.

## Explicit exclusion

The editor-facing activation or revision UI for Policy Documents is excluded. Current canonical instructions require developer review and keep those assets hidden from editorial users, while earlier design evidence describes an editor-facing review flow. That contradiction remains a Commander dependency and does not authorize related editorial UI. Result feedback, Learning Material decisions, memory review, Learning Audit, and quality metrics remain in scope because they are separate user decisions.

## Source discipline

- Use canonical Chinese labels from `GLOSSARY.md`; do not invent synonyms for authority-bearing records.
- Never use an unqualified `Approval` or generic `批准` button.
- Never use real manuscripts, manuscript-derived indexes, embeddings, or copied private sample content in design fixtures.
- Any prototype manuscript is conspicuously synthetic and unsuitable as editorial evidence.
