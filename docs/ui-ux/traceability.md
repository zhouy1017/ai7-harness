# AI7 V1 UI/UX traceability

Status: **Issue #2 V1 freeze-candidate trace; implementation and user validation not verified**

## 1. How to read this document

This matrix maps every numbered requirement in `requirements.md` to its principal screen, interaction contract, prototype phase, validation method, and accepted source. A mapping means the requirement has an intended design and proof location; it does not mean the behavior is implemented or has passed a test.

### Status and phase flags

| Flag | Meaning |
| --- | --- |
| `V1` | Required in the V1 UI/UX package |
| `P1` | Present or partially present in the current three-variant shell prototype |
| `P2` | Present or partially present in the current factual-verification → Correction Proposal prototype journey |
| `P3` | Planned full-V1 prototype coverage; not yet demonstrated |
| `SPIKE` | Production feasibility or performance must be proven by the accepted store/editor spike |
| `UR` | Must be exercised in the owner walkthrough and/or professional-editor research |
| `IMPL` | Requires implementation/contract/package verification in addition to usability evidence |
| `EXCLUDED` | Deliberately absent from the V1 editorial UI |
| `BLOCKED-C01` | Blocked by the policy-activation authority conflict below |
| `C02-CURRENT` | Uses the current two-channel release decision, not the superseded portable-only paragraph |

Current prototype coverage is deliberately narrow. `P1` and `P2` may be partial and must not be read as full functional coverage. `P3` is a plan, not a completed artifact.

### Principal screens

| Code | Screen or surface |
| --- | --- |
| `S01` | Workbench and global attention/work queue |
| `S02` | Book library and Book overview |
| `S03` | Series, source library, and source-scope selection |
| `S04` | Import fidelity review |
| `S05` | Windowed manuscript/deliverable editor, outline, and search |
| `S06` | Task inspector, Task Intent, Plan Preview, and Run Authorization |
| `S07` | Running task, clarification, continuation, and Task Outcome |
| `S08` | Editorial review, evidence, and factual-verification workspace |
| `S09` | Proposal comparison, decision, application, and Effect Receipt |
| `S10` | Conflict resolution, revision history, checkpoint, and recovery |
| `S11` | Deliverable Workflow, gates, artifacts, signoff, and Delivery Package |
| `S12` | Feedback, quality, learning, memory, and audit |
| `S13` | First run and settings |

### Interaction-contract areas

The interaction column points to the corresponding durable behavior in `interaction-spec.md` by area, even when the current HTML prototype does not yet contain that state. Scenario IDs refer to [§18 V1 interaction acceptance scenarios](./interaction-spec.md#18-v1-interaction-acceptance-scenarios).

| Code | Actual interaction-spec location | Acceptance scenarios |
| --- | --- | --- |
| `I01` | §§2–3 shell/focus/navigation and §14 concurrency/errors | J-09, J-14 |
| `I02` | §4 Book, Series, and source scope | J-13 |
| `I03` | §5 import and fidelity review | J-01 |
| `I04` | §6 long-manuscript editing and §13 recovery | J-02, J-08, J-14 |
| `I05` | §§7.1–7.3 and §7.6 task capture, Plan Preview, authorization, and drift | J-03 |
| `I06` | §§7.4–7.7, §14, and §15 running work and continuation | J-03, J-09, J-10 |
| `I07` | §8 evidence and factual verification | J-04 |
| `I08` | §9 proposals, Effects, receipts, and conflict | J-05, J-06 |
| `I09` | §10 Workflow, signoff, export, and public release | J-07 |
| `I10` | §11 feedback, learning, quality, and audit | J-11 |
| `I11` | §12 onboarding and settings | J-12 |

### Verification methods

| Code | Method |
| --- | --- |
| `OW` | Owner walkthrough in `usability-test-plan.md` |
| `PE` | Moderated study with 3–5 qualifying professional editors |
| `A11Y` | Keyboard, Chinese IME, 125–150% scaling, high contrast, and Narrator inspection |
| `SP` | Store/index/ProseMirror spike at the accepted scale tiers |
| `CT` | Provider-free domain/UI contract or state-transition test |
| `DOCX` | Synthetic document-conversion and fidelity fixture verification |
| `PKG` | Packaged zip/NSIS first-run and data-location verification |

### Accepted-source codes

| Code | Accepted source |
| --- | --- |
| `A` | `AGENTS.md` |
| `G` | `GLOSSARY.md` and the linked canonical context definitions |
| `D10` | `kick-in/10-editorial-dimensions.md` |
| `D13` | `kick-in/13-learning-audit-and-eligibility.md` |
| `D16` | `kick-in/16-policy-documents-and-feedback-ux-handoff.md` |
| `D17` | `kick-in/17-source-generation-grounding-boundary.md` and Factual Verification Policy |
| `D18` | `kick-in/18-manuscript-revision-and-recovery-boundary.md` |
| `D19` | `kick-in/19-proposal-approval-effect-replay-boundary.md` |
| `D20` | `kick-in/20-deliverable-workflow-and-artifacts.md` |
| `D21` | `kick-in/21-bounded-plan-task-interaction.md` |
| `D22` | `kick-in/22-task-skill-capability-trust-provider-boundary.md` |
| `D23` | `kick-in/23-linked-task-and-harness-ledgers.md` |
| `D25` | `kick-in/25-standalone-word-surface-boundary.md` and ADR 0013 |
| `D28` | `kick-in/28-harness-capability-and-authority-boundary.md` |
| `D29` | `kick-in/29-editorial-quality-metrics.md` |
| `D32` | `kick-in/32-runtime-language-and-release-channel.md` as corrected by ADR 0023 |
| `D33` | `kick-in/33-standalone-shell-and-editor-topology.md` and ADRs 0024–0025 |
| `D34` | `kick-in/34-first-tracer-slice.md` and ADR 0026 |

## 2. Requirement matrix

### Shell, navigation, and work queue

| Requirement | Principal screen | Interaction | Prototype phase | Verification | Source | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UX-IA-001 | S01, S02 | I01, I02 | P1 partial | OW, PE, CT | A, D25, D28 | V1; UR; not verified |
| UX-IA-002 | S01 | I01, I06 | P1 partial, P3 | OW, PE, CT | A, D21, D23 | V1; UR; not verified |
| UX-IA-003 | S01 and authoritative target screen | I01 | P3 | OW, PE, CT | D23 | V1; UR; not verified |
| UX-IA-004 | S01, S05 | I01, I04 | P1 partial | OW, PE, CT | D18, D21, D33 | V1; UR; not verified |
| UX-IA-005 | S01, S05 | I01 | P1 | OW, PE, A11Y | D25, D33 | V1; UR; not verified |
| UX-IA-006 | S01, S05, S03 | I01, I02 | P3 | OW, PE, CT | A, D28, D33 | V1; UR; not verified |
| UX-IA-007 | S02, S08, S11 | I01, I09 | P3 | OW, PE | G, D20 | V1; UR; not verified |

### Book, Series, and deliverables

| Requirement | Principal screen | Interaction | Prototype phase | Verification | Source | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UX-BOOK-001 | S02, S11 | I02, I09 | P3 | OW, PE, CT | A, D20 | V1; UR; not verified |
| UX-BOOK-002 | S03 | I02 | P3 | OW, PE, CT | A, G | V1; UR; not verified |
| UX-BOOK-003 | S03, S06 | I02, I05 | P3 | OW, PE, CT | A, D21, D28 | V1; UR; not verified |
| UX-BOOK-004 | S02, S03, S11 | I02, I09 | P3 | OW, PE, CT | A, D20, D28 | V1; UR; IMPL; not verified |
| UX-BOOK-005 | S01, S02 | I01, I02 | P1 partial, P3 | OW, PE, CT | D21, D28 | V1; UR; not verified |

### Import and document fidelity

| Requirement | Principal screen | Interaction | Prototype phase | Verification | Source | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UX-IMP-001 | S04 | I03 | P3 | OW, PE, CT | A, D25, D28 | V1; UR; IMPL; not verified |
| UX-IMP-002 | S04 | I03 | P3 | OW, PE, DOCX | A, D25 | V1; UR; IMPL; not verified |
| UX-IMP-003 | S04 | I03 | P3 | OW, PE, DOCX | A, D25 | V1; zero-silent-loss gate; not verified |
| UX-IMP-004 | S04, S10 | I03, I04 | P3 | OW, PE, CT, DOCX | D18, D25 | V1; IMPL; not verified |
| UX-IMP-005 | S04, S10 | I03, I08 | P3 | OW, PE, CT, DOCX | D18, D25 | V1; UR; IMPL; not verified |

### Long-manuscript editor

| Requirement | Principal screen | Interaction | Prototype phase | Verification | Source | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UX-ED-001 | S05 | I04 | P1/P2 partial | OW, PE, SP, A11Y | D25, D33 | V1; SPIKE; UR; not verified |
| UX-ED-002 | S05 | I04 | P3 | OW, SP | D33 | V1; SPIKE; not verified |
| UX-ED-003 | S05 | I04 | P3 | OW, PE, SP, CT | A, D33 | V1; SPIKE; UR; not verified |
| UX-ED-004 | S05, S06, S08, S09 | I04, I05, I07, I08 | P2 partial, P3 | OW, PE, A11Y, CT | D18, D25, D33 | V1; SPIKE; UR; not verified |
| UX-ED-005 | S05, S10 | I04 | P3 | OW, PE, CT | A, D18, D25 | V1; UR; IMPL; not verified |
| UX-ED-006 | S05, S10 | I04 | P3 | OW, PE, CT | D18, G | V1; critical wording; not verified |
| UX-ED-007 | S10 | I04 | P3 | OW, PE, CT | D18 | V1; UR; IMPL; not verified |
| UX-ED-008 | S05, S07 | I04, I06 | P2 partial, P3 | OW, PE, SP, CT | A, D25, D33 | V1; SPIKE; UR; not verified |
| UX-ED-009 | S05 | I04 | P3 | OW, PE, SP, A11Y | D33 | V1; SPIKE; UR; not verified |

### Task capture, preflight, and authorization

| Requirement | Principal screen | Interaction | Prototype phase | Verification | Source | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UX-TASK-001 | S05, S06 | I05 | P1/P2 | OW, PE, A11Y | D21, D25 | V1; UR; not verified |
| UX-TASK-002 | S06 | I05 | P2 | OW, PE | D21, D22 | V1; UR; not verified |
| UX-TASK-003 | S06 | I05 | P2 partial, P3 | OW, PE, CT | A, D21, D22 | V1; UR; not verified |
| UX-TASK-004 | S06 | I05 | P2 | OW, PE, CT | D21, G | V1; critical semantic check; not verified |
| UX-TASK-005 | S06 | I05 | P2 | OW, PE, CT | A, D19, D21 | V1; critical semantic check; not verified |
| UX-TASK-006 | S06, S07 | I05, I06 | P3 | OW, PE, CT | A, D21, D22 | V1; UR; IMPL; not verified |
| UX-TASK-007 | S07 | I05, I06 | P3 | OW, PE, CT | D21, D23 | V1; UR; not verified |

### Running work and continuation

| Requirement | Principal screen | Interaction | Prototype phase | Verification | Source | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UX-RUN-001 | S01, S07 | I01, I06 | P2 partial, P3 | OW, PE | A, D21, D23 | V1; UR; not verified |
| UX-RUN-002 | S01, S05, S07 | I01, I06 | P2 partial, P3 | OW, PE, SP | A, D21, D33 | V1; SPIKE; UR; not verified |
| UX-RUN-003 | S07 | I06 | P3 | OW, PE, CT | A, D19, D21 | V1; critical semantic check; not verified |
| UX-RUN-004 | S01, S07 | I06 | P3 | OW, PE, CT | A, D21 | V1; UR; IMPL; not verified |
| UX-RUN-005 | S07, S10 | I06 | P3 | OW, PE, CT | A, G, D21, D23 | V1; critical wording; not verified |
| UX-RUN-006 | S07, S09 | I06, I08 | P3 | OW, PE, CT | A, D19, D22 | V1; safety-critical; not verified |
| UX-RUN-007 | S01, S07 | I01, I06 | P2 partial, P3 | OW, CT | A, D19, D23 | V1; privacy-critical; not verified |

### Evidence, review, and factual verification

| Requirement | Principal screen | Interaction | Prototype phase | Verification | Source | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UX-EVD-001 | S05, S08 | I07 | P2 | OW, PE, CT | A, D17, D34 | V1; primary journey; not verified |
| UX-EVD-002 | S08 | I07 | P2 partial, P3 | OW, PE, CT | D17 | V1; UR; not verified |
| UX-EVD-003 | S08 | I07 | P2 | OW, PE, CT | A, D17 | V1; zero-misunderstanding gate; not verified |
| UX-EVD-004 | S08 | I07 | P2 partial, P3 | OW, PE, CT | A, D17 | V1; zero-misunderstanding gate; not verified |
| UX-EVD-005 | S08 | I07 | P3 | OW, PE, CT | A, D17 | V1; safety-critical; not verified |
| UX-EVD-006 | S08 | I07 | P3 | OW, PE | D17 | V1; UR; not verified |
| UX-EVD-007 | S08, S09 | I07, I08 | P3 | OW, PE, CT | A, D17 | V1; UR; not verified |

### Proposal review, application, and conflicts

| Requirement | Principal screen | Interaction | Prototype phase | Verification | Source | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UX-PROP-001 | S09 | I08 | P2 | OW, PE, CT | A, D18, D19 | V1; primary journey; not verified |
| UX-PROP-002 | S05, S09 | I08 | P2 | OW, PE, A11Y | D19, D25 | V1; UR; not verified |
| UX-PROP-003 | S09 | I08 | P2 partial, P3 | OW, PE, CT | D19 | V1; UR; not verified |
| UX-PROP-004 | S09 | I08 | P2 | OW, PE, CT | A, D19, G | V1; zero-misunderstanding gate; not verified |
| UX-PROP-005 | S09 | I08 | P2 | OW, PE, CT | A, D19 | V1; zero-misunderstanding gate; not verified |
| UX-PROP-006 | S09, S10 | I08 | P3 | OW, PE, CT | D18, D19 | V1; safety-critical; not verified |
| UX-PROP-007 | S10 | I08 | P3 | OW, PE, CT | A, D18, D19 | V1; UR; IMPL; not verified |
| UX-PROP-008 | S09, S10 | I08 | P3 | OW, PE, CT | A, D18, D19 | V1; safety-critical; not verified |

### Deliverable workflows and delivery

| Requirement | Principal screen | Interaction | Prototype phase | Verification | Source | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UX-WF-001 | S02, S11 | I09 | P3 | OW, PE, CT | A, D20 | V1; UR; not verified |
| UX-WF-002 | S02, S11 | I09 | P3 | OW, PE, CT | A, D20 | V1; UR; not verified |
| UX-WF-003 | S11 | I09 | P3 | OW, PE, CT | A, D20 | V1; UR; IMPL; not verified |
| UX-WF-004 | S11 | I09 | P3 | OW, PE, CT | A, D19, D20 | V1; IMPL; not verified |
| UX-WF-005 | S11 | I09 | P3 | OW, PE, CT | A, D19, D20 | V1; zero-misunderstanding gate; not verified |
| UX-WF-006 | S11 | I09 | P3 | OW, PE, CT | A, D19, D20 | V1; UR; IMPL; not verified |
| UX-WF-007 | S11 | I09 | P3 | OW, PE, CT | A, D17, D20 | V1; zero-misunderstanding gate; not verified |

### Feedback, quality, learning, and audit

| Requirement | Principal screen | Interaction | Prototype phase | Verification | Source | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UX-LEARN-001 | S09, S12 | I10 | P2 | OW, PE | A, D16, D29 | V1; UR; not verified |
| UX-LEARN-002 | S09, S12 | I10 | P2 partial, P3 | OW, PE, CT | A, D29 | V1; UR; not verified |
| UX-LEARN-003 | S12 | I10 | P3 | OW, PE, CT | A, D13, D16 | V1; zero-misunderstanding gate; not verified |
| UX-LEARN-004 | S12 | I10 | P3 | OW, PE, CT | D13, D16 | V1; UR; not verified |
| UX-LEARN-005 | S12 | I10 | P3 | OW, PE, CT | A, D13 | V1; UR; IMPL; not verified |
| UX-LEARN-006 | S12 | I10 | P3 | OW, PE, CT | A, D13, D16 | V1; UR; IMPL; not verified |
| UX-LEARN-007 | S12 | I10 | P3 | OW, PE, CT | A, D29 | V1; UR; not verified |
| UX-LEARN-008 | S12 | I10 | P3 | OW, CT | A, D29 | V1 exclusion enforced; not verified |
| UX-LEARN-009 | None in editorial UI | None until resolved | EXCLUDED | Conflict review | A, D16, ADR 0004, ADR 0018 | EXCLUDED; BLOCKED-C01 |

### Settings and onboarding

| Requirement | Principal screen | Interaction | Prototype phase | Verification | Source | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UX-SET-001 | S13 | I11 | P3 | OW, PE, PKG | A, D32 | V1; UR; IMPL; C02-CURRENT; not verified |
| UX-SET-002 | S13 | I11 | P3 | OW, PE, PKG | A, D32 | V1; UR; IMPL; C02-CURRENT; not verified |
| UX-SET-003 | S13 | I11 | P3 | OW, PE, PKG | A, D32 | V1; UR; IMPL; not verified |
| UX-SET-004 | S13 | I11 | P3 | OW, PE, CT, PKG | A, D22, D32 | V1; privacy-critical; not verified |
| UX-SET-005 | S13, S06 | I05, I11 | P2 partial, P3 | OW, PE, CT | A, D22 | V1; zero-misunderstanding gate; not verified |
| UX-SET-006 | S13 | I11 | P3 | OW, PE, CT | A, D10, G | V1; UR; IMPL; not verified |
| UX-SET-007 | S13, S11 | I09, I11 | P3 | OW, PE, CT | A, D20, G | V1; UR; IMPL; not verified |
| UX-SET-008 | S13 | I11 | P3 | OW, PE, CT | A, D28 | V1 explicit exclusion of escalation; not verified |

## 3. Non-functional and acceptance trace

| Requirement area | Design location | Validation | Status |
| --- | --- | --- | --- |
| 500K/1M/10M manuscript tiers, windowed rendering, typing independent of manuscript size | S05; I04 | SP, CT, packaged performance evidence | SPIKE; not proven by prototype |
| 1366×768 at 150% and 1920×1080 at 125% | All principal screens | OW, PE, A11Y | UR; not run |
| Keyboard reachability and visible focus | All essential interactions | OW, PE, A11Y | Not verified |
| Chinese IME composition and punctuation | S05, S06, S09 | OW, PE, A11Y, production editor tests | SPIKE/UR; not verified |
| High contrast and meaning not dependent on color | All semantic statuses | OW, A11Y | Not verified |
| No real manuscript or secret in prototype/test data | All artifacts | Repository content review and test-fixture audit | Required; current prototype declares synthetic fixtures |
| Five zero-misunderstanding semantic checks | S03/S06/S07/S08/S09/S11 | OW and PE in `usability-test-plan.md` | Gate defined; no sessions run |

## 4. Document conflicts and resolution rules

### C01 — editorial Policy Document activation

`kick-in/16-policy-documents-and-feedback-ux-handoff.md` and ADR 0004 describe an editor-facing review/activation flow for Learning Eligibility Policy revisions. ADR 0018 and the current `AGENTS.md` require developer review and say editorial users do not see these assets. This candidate follows the current developer-reviewed, editorially hidden rule; the earlier contradiction remains a dependency for Commander disposition, not an alternative authority imported into this branch.

Current treatment:

- `UX-LEARN-009` explicitly excludes Policy Document activation/revision UI;
- ordinary result feedback, Learning Material decisions, Memory Candidate review, Learning Audit, and quality views remain in scope because they are distinct decisions; and
- no prototype or usability script may expose a Policy Document identity or imply that an editor can author, revise, or activate one; editorial surfaces may show only user-relevant evidence statuses and notices while the hidden asset remains developer-reviewed.

### C02 — portable-only text versus two release channels

The middle of `kick-in/32-runtime-language-and-release-channel.md` preserves the original portable-only Question 33 decision, but its final resolution, current `AGENTS.md`, and rewritten ADR 0023 establish two channels from one builder: zip portable and NSIS installer.

Current treatment:

- `UX-SET-001` and `UX-SET-002` follow the current two-channel decision;
- portable mode keeps `data/` inside the AI7 folder when writable;
- installer mode normally uses `%LOCALAPPDATA%\AI7`; and
- the old “installer deferred” paragraph is provenance, not a V1 UI requirement.

## 5. Update discipline

When a requirement changes, update its row in the same change. When a prototype state is added, replace `P3` with the actual demonstrated phase only after inspecting the artifact. When owner or editor research occurs, link the dated report and change `not verified` only for the requirement actually observed. Automated checks, screenshots, and design intent never substitute for the professional-editor gate.
