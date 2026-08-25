# AI7 V2 semantic journey continuity

Status: **candidate journey design complete for this session; not implementation or validation evidence**

## Source and use

The stable IDs and original business hypotheses come only from `docs/ui-ux/interaction-spec.md` in exact frozen object `587d6455f6a578d3df8a39f534ec7a057c07a18c`. They are retained here under V2 architecture object `247b7dacb267ba2f4076ca8461c95e5f0508b343` and the owner-accepted UI/UX decisions in this directory.

The list is a semantic coverage map. It does not inherit old screen geometry, prototype/Figma artifacts, component implementation, Windows-specific mechanism detail or completed verification claims. One logical provider-free E2E Functional Gate may cover these as complete Windows-and-macOS user journeys plus discovered bug regressions; this document creates no separate usability, accessibility, performance, platform-certification or UI gate.

## Cross-journey invariants

- Every journey starts from and returns to an exact Book, manuscript/deliverable version and authoritative record rather than a conversation or Harness Session.
- Local reading, editing, search, history, recovery and export do not require Harness, Provider, credentials or network.
- Renderer views remain bounded; the service/store remains authoritative for whole-manuscript work and durable state.
- Run Authorization, Proposal Decision, Review Decision, Effect Approval, Effect Receipt, internal Signoff, Milestone Version, Publication Version and Public Release Permission never collapse into generic approval/completion.
- Model/Harness/tool completion is never business proof. Every authoritative or externally visible Effect needs its own exact outcome evidence/receipt.
- Reference Integrity, Claim Support and Factual Verification remain independent; model knowledge is never evidence.
- Chinese IME composition, keyboard access, visible focus, zoom/reflow, forced colors and retained-safe error behavior apply throughout.
- Restart returns to authoritative durable state and names any uncertainty; no journey claims recovery or completion beyond exact evidence.

## Journey map

| ID | Retained business outcome | V2 candidate journey | Status |
| --- | --- | --- | --- |
| **J-01** | Import a DOCX only after explicit fidelity understanding and reach the exact resulting revision/evidence | Select local DOCX → local parse/preflight → inspect `完整保留 / 降级导入 / 不支持导入` for all content classes → resolve structural ambiguity → record any Import Degradation Decision → atomic import → persist Manuscript Import Record → `稿件已导入` → open the exact Book/Manuscript Revision or import record | Mapped |
| **J-02** | Work fluently in a very long Chinese manuscript while whole-manuscript operations remain bounded and durable | Open a synthetic 10M-character manuscript through bounded projection → move among distant outline/global positions → type with Chinese IME → search/jump and preview atomic replace → continue local editing during service-side work → confirm Edit Journal acknowledgement → save a Milestone Version → continue durable undo/redo | Mapped |
| **J-03** | Authorize an exact model task with understandable goal, scope, processing and budget boundaries, then handle clarification/drift | Pin exact target/ranges → capture Task Intent → confirm Task Skill recommendation or generic path → select source/context scope and Model Role/capability → inspect Plan Preview, outbound data and budget ceiling → use standard Run Authorization, exact Quick Start or eligible default execution → keep editing → answer a choice-first Clarification Request → inspect and reauthorize any material Plan Revision | Mapped |
| **J-04** | Inspect factual work without confusing text fidelity, evidence support or truth | Open a Manuscript Assertion Marker → inspect separate Reference Integrity, Claim Support and Factual Verification states → compare candidates → Exact Fetch at least two pinned evidence ranges → return to the exact manuscript position → retain an unresolved/conflicting result honestly | Mapped |
| **J-05** | Review a Correction Proposal, decide it, and apply only through a separate exact Effect with proof | Follow exact inline marks and Proposal Margin Anchors to persistent Manuscript-anchored Proposal Cards → decide each semantic Proposal Change Item independently or inspect an explicitly justified Atomic Proposal Change Group → review current/proposed text separately from rationale and evidence inline or side by side → edit/selectively use Proposal content → record Proposal Decision → prepare exact Apply Change Set/result preview → record separate Effect Approval → wait for atomic Apply → treat only verified Apply Effect Receipt as the new revision proof | Mapped |
| **J-06** | Resolve same-block or structural drift without partial or silent manuscript mutation | Open Manuscript Conflict → compare current/base/proposed sources → use labeled diff-merge quick actions or edit Resolution Draft → retain unresolved items as needed → revalidate exact pins → apply all-or-none only through the normal Effect path; any model-composed resolution remains a Proposal | Mapped |
| **J-07** | Advance a deliverable through flexible workflow, preserve a meaningful version, package it and export locally without implying publication | Work through overlapping/reopened/skipped Workflow phases → record exact Review Decision/Gate dispositions → `保存为里程碑版本` (internally retaining the separate Signoff mapping) → prepare a versioned Delivery Package → export DOCX primarily, optional PDF and secondary Markdown locally → inspect Local Export Effect Receipt → independently withhold or set exact `发稿版本`; AI7 sends/publishes nothing | Mapped and reshaped |
| **J-08** | Recover durable editorial work after crash without rewriting history or moving existing Run pins | Restart with journal-only changes → open Book Recovery Workspace → compare recovered journal state, Milestone/Checkpoint and available verified Recovery Snapshot → see Last Durable Edit Boundary/uncertainty → restore as a descendant revision → confirm existing Runs remain bound to their original exact revisions | Mapped |
| **J-09** | Run concurrent work across Books without focus theft, scope leakage or false cancellation rollback | Start Runs for two Books → inspect compact Book-grouped Global Attention/activity → pause one → cancel another after an independently committed Effect → keep editing current Book → inspect honest partial Task Outcomes and exact receipts → confirm cancellation does not undo the Effect and cross-Book sources never leak | Mapped |
| **J-10** | Distinguish continuation/re-execution/history operations by consequence | Exercise `续行` on the same unchanged Run, safe `重试` as a new attempt, append-only `回退运行方向` from a selected earlier point, `重做` as a newly authorized Run and read-only `重放` → encounter an ambiguous external outcome where Retry stays unavailable | Mapped and extended with Rewind |
| **J-11** | Give optional editorial feedback, govern learning eligibility and trace/remediate influence | Dismiss or answer a contextual choice-first reason prompt → review a bounded Learning Material candidate separately → choose unselected Book-first, Series/House, exclude or later eligibility → inspect object-centered backward/forward Learning Lineage → preview exclusion effects on future/running/history → record remediation without deleting history → inspect quality/sample limitations without time tracking | Mapped and reshaped |
| **J-12** | Understand the current platform's distribution/data-location behavior and configure model processing without exposing secrets | On Windows, exercise installer/portable and fallback states; on macOS, exercise the selected native channel and data location → encounter applicable sync/backup and prohibited repository-location states → inspect `设置 > 数据与存储` → perform on-demand Model Service setup by Model Role → replace/remove a Credential Manager/Keychain credential without revealing it → return to exact Task setup point → distinguish controlled Provider processing from public release | Mapped for one Windows-and-macOS product; exact macOS mechanics deferred |
| **J-13** | Use explicit Series and Cross-project context while keeping mutation Book-bound | Open `成员与共享范围` → preview and record adding a Book to an exact Series → inspect Series Knowledge/exclusions → prepare a `书系范围任务` with explicit excluded Books/material → add one Cross-project source → authorize frozen exact scope → verify mutation stays target-Book-bound → preview and record removal with future/frozen-run/knowledge/history consequences | Mapped |
| **J-14** | Complete professional work on Windows and macOS by keyboard and under Chinese/accessibility/zoom constraints | Traverse J-01–J-13 through labeled native keyboard paths, representative Windows/macOS window sizes and scaling, Simplified Chinese IMEs, 200% application zoom/reflow, visible focus, light/dark themes, Windows forced colors and applicable macOS accessibility appearance → use resized/hidden surfaces and editable Detached Manuscript Window without losing exact context or state meaning | Mapped; behavior shared with native adapters, no separate gate |
| **J-15** | Capture prior work as a governed reusable procedure and manage/reuse its exact versions without losing delivery lineage or source boundaries | Select one completed Run or ordered visible steps → review extracted/excluded content → classify the result → exercise the applicable Task Skill, Workflow Profile, Default Execution Rule or Developer Capability Proposal save path → independently admit/enable or publish/designate only where applicable → open `自动化中心` → inspect grouped versions and exact linked work/deliveries → reuse a Task Skill in another Book through recommendation or manual selection → confirm newest eligible exact version and current-Book source default → authorize any wider sources separately → remove an unreferenced draft and retire a historically referenced version while its delivery links remain | New V2 feature journey mapped |

## V2-specific journey reshaping notes

### J-01 import completion

The successful commit requires persistence of the original file record, Import Fidelity Review, applicable Import Degradation Decision, provenance, resulting Manuscript Revision and Manuscript Import Record before `稿件已导入` appears. `打开稿件` and `查看导入记录` preserve direct access. The record is not an exported file, checkpoint, export/Apply receipt or generic optimistic success.

### J-07 target-house completion

The user-facing `签发` step is replaced by `保存为里程碑版本`. Delivery stops at an exact local export receipt; there is no direct external transmission or handoff record. `发稿版本` is a separate exact-version/publication-scope designation and never means AI7 published or sent anything.

### J-10 rewind addition

Rewind appends a new continuation branch/direction inside the accepted history model. It does not erase Run attempts, decisions, Effects or receipts; any material plan boundary change still needs a new authorization.

### J-13 Series membership

`书系 > 成员与共享范围` provides exact add/remove commands and a four-part Series Membership Impact Preview. Membership affects explicit future Series-scope availability; already frozen Runs and immutable history remain exact. Related Series Knowledge/learning records keep their own governance, and each successful membership command appends a Series Membership Change Record.

### J-14 coverage boundary

Keyboard, IME, focus, scaling/reflow, native accessibility appearance and reduced-space behavior are unconditional design requirements throughout the journeys on both supported platforms. Their inclusion here does not authorize a separate usability/accessibility/performance/platform/UI validation gate.

### J-15 reusable automation and version lineage

The common capture entry produces one typed asset path and never a generic automation object. Task Skill admission/enablement, Workflow Profile publication/default designation, Default Execution Rule review/enablement and Developer Capability Proposal handoff remain separate paths. New unpinned Task Skill use resolves to the latest enabled compatible version before authorization, while enabled rules, authorized Runs and current Workflow Instances keep exact pins. Enabled skills are locally discoverable across Books, but reuse transfers only parameterized procedure structure and starts with current-Book source scope; recommendation applicability never grants broader access. A version may expose linked work and deliveries without copying their content or granting their scope. Deletion permanently removes only unreferenced never-admitted drafts/candidates; historically referenced versions leave a non-executable stub so every outcome and delivery remains explainable.
