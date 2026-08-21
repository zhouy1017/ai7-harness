# Architecture Review Packet

Status: **ready — both Worker inputs sealed; containing Commander commit requires exact-head review**
Base: `main@c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9`

This packet is the only cross-task input assembled for the independent architecture review. It carries conclusions and evidence, not conversation history.

## Pinned canonical inputs

Read these Git objects in this order with `git show c8cbe26:<path>`. Do not substitute the mutable files in the Commander's branch or another worktree.

1. `c8cbe26:HANDOFF.md` — router and trap list.
2. `c8cbe26:AGENTS.md` — canonical standing rules.
3. `c8cbe26:handoff20260817/PROJECT-OVERVIEW.md` — normalized design overview.
4. `c8cbe26:kick-in/05-decision-map.md` — numbered design decisions, subject to higher-precedence accepted ADRs and later canonical rules.
5. `c8cbe26:CONTEXT-MAP.md` and applicable `c8cbe26:docs/domain/*/CONTEXT.md` objects — canonical term owners.
6. Applicable accepted `c8cbe26:docs/adr/*.md` objects.

Use `c8cbe26:GLOSSARY.md` only as a bilingual index and collision guide. The full chronological `PROGRESS.md` is deliberately excluded from the architecture packet because it contains superseded process history; use the audited state extract below instead.

## Audited baseline state extract

- The 36-question interview is complete at the pinned base, but Phase 0 exit review had not passed.
- The repository contains design documentation only; no product source, package manifest, dependency, or CI workflow exists.
- Canonical `main@c8cbe26` still says Windows-only and leaves Q16's four unitemized evidence classes unresolved.
- Canonical open evidence includes Windows confinement strength, Harness `rc.5→rc.6` seams, retrieval strategy, ProseMirror confidence, and calibrated latency budgets.
- UI/UX was intentionally delegated to a separate task and was not canonical at the base.
- Implementation and implementation issue decomposition were not authorized.

## Curated problem input

- [Known Problems for Architecture Exploration](./KNOWN-PROBLEMS.md)
- [Architecture Exploration Control Board](./CONTROL.md)
- [Round 1 Architecture Review](./ROUND-1-REVIEW.md)
- [Candidate Handoff Delta Review](./CANDIDATE-DELTA-REVIEW.md)
- [Immutable Packet Manifest](./PACKET-MANIFEST.md)

Problem entries are investigation prompts, not accepted solutions.

## Curated candidate inputs

| Candidate line | Required artifact | Packet status |
| --- | --- | --- |
| UI/UX v1 reference | `docs/ui-ux/V1-FREEZE-HANDOFF.md`; final head `docs/2-ai7-ui-ux@587d645` | Frozen local reference; exact-head Standards and Spec PASS |
| Platform/Q16/Phase-0 reference | `kick-in/37-v1-platform-freeze-handoff.md`; final head `9606891` | Frozen local reference; exact-head Standards and Spec PASS |

The Commander will extract only traceable conclusions, changed decision surfaces, reusable assets, incompatibilities, migration cost, open evidence, and review verdicts. The packet will not copy full branches wholesale.

## Audited candidate input — platform, Q16, and Phase 0

Source: frozen local reference `docs/1-windows-macos-phase0@960689172bcf54eb3f27b57045a4ce4e9f20695d`; structured source at `kick-in/37-v1-platform-freeze-handoff.md`. The initial `23df3c8` exact-head review failed on an overstated Agent Data Root definition, one stale design-note count, and nonstandard compound ADR status fields. `16a6ff1` fixed those findings; its exact-head review found one stale checkpoint. `9606891` fixed only that checkpoint and passed fresh T3 Standards and Spec reviews with zero findings, no post-review changes, a clean worktree, and `same-provider review — independence reduced`.

**Owner-stated inputs recorded by the candidate, not canonical `main`:** exact quotation verification; exact Evidence Links for source-derived factual claims; timestamped evidence for current/external factual claims; explicit labeling of editorial judgment; evidence-class rules for factual/quoted subclaims inside creative or promotional synthesis; and a Windows+macOS product target. The candidate task reports explicit owner acceptance; the Commander packet labels these as candidate until normal integration. The detailed consistency/native contract remains open even inside the candidate.

The exact five Q16 evidence-class rules retained from the Worker handoff are:

1. Exact quotations are verified against authoritative original text.
2. Source-derived factual claims cite exact Evidence Links.
3. Current or external factual claims use timestamped research evidence.
4. Editorial interpretation is identified as judgment rather than fact.
5. Creative or promotional synthesis remains generated content, while quoted, factual, and canonical subclaims follow their own evidence rules.

Exact owner wording supplied to the candidate task: “the project should work on windows and macos with consistent product outlook.” This is sufficient as an exploration premise, but it does not define parity, supported OS/CPU floors, channels, or native exceptions.

**Reusable assets:** platform-neutral Book, manuscript, proposal, Effect, Task/Harness-ledger, policy, learning, authority, Q16 evidence, narrow AI7-over-Harness ownership, exact-pin, composition, bilingual-term, and documentation-discipline contracts.

**Incompatible or revalidation-sensitive assumptions:** Electron + ProseMirror; three local processes; private non-TCP IPC; rc.6 consumption; Windows zip/NSIS channels; Windows-bound verification; and any UI geometry, native control, package, IPC, or parity assumption. The branch explicitly says these are candidate v1 assumptions rather than v2 truth.

**Open evidence carried forward:** truthful per-platform process/filesystem confinement; consistency and UI contract; macOS floor/CPU/package/data-root/update/signing/notarization choices; concise native CI/release evidence; IPC and secret-store adapters; rc.5-to-rc.6 package/seam/closure/session/replay/tool-guard/notices/ABI audit; retrieval strategy; performance budgets; and editor confidence.

No exact `rc.6` package subset is accepted or proposed by this packet. Investigation A2 must derive and compare candidate subsets from the published artifacts plus AI7's required seams; the absence of a subset here is an explicit input, not permission to inherit the CLI aggregate or an upstream default.

No Windows/macOS parity matrix, minimum OS version, CPU policy, distribution channel set, or native-exception list is accepted or proposed. Investigation A1 must produce bounded options and identify the owner choices; “consistent product outlook” is not silently expanded into any one of those contracts.

**Phase result:** not passed. The candidate does not authorize implementation, dependency installation, CI, issue decomposition, publication, or integration.

## Audited candidate input — UI/UX v1 reference

Source: frozen local reference `docs/2-ai7-ui-ux@587d6455f6a578d3df8a39f534ec7a057c07a18c`; structured source at `docs/ui-ux/V1-FREEZE-HANDOFF.md`. Earlier exact-head attempts exposed successively narrower candidate-authority, Policy visibility, preferred-term, state-set, external-Figma, commit-metadata, and freeze-history findings. `587d645` corrects only those issues and consolidates the unpublished Issue #2 line into one candidate commit above base. Fresh T3 Standards and Spec reviewers both passed the complete exact range with zero findings and no post-review changes. The worktree is clean, all obsolete tips are non-ancestors and reflog-recoverable, QA scratch remains outside the branch, and `same-provider review — independence reduced` applies.

**Reusable assets:** 79 traceable requirements; fourteen journeys; Book-first navigation plus a separate global attention queue; an editor-first object with contextual inspection and selection-aware task entry; exact scope/outbound-data visibility; separate evidence, authorization, proposal/review, Effect, signoff, and public-release states; proposal-first mutation and exact-pin drift/conflict handling; journal/checkpoint/recovery distinctions; restart-safe task states; Chinese IME/accessibility/long-manuscript journeys; and a professional-editor usability gate.

**Revalidation-sensitive assets:** information architecture, state tables, microcopy, and visual tokens assume a desktop Book/editor workbench but may survive with adaptation.

**Incompatible/disposable assets:** fixed A/B/C geometry, raw Figma frames, and HTML/CSS/JavaScript prototype code are reference-only. Windows paths, NSIS/portable states, Narrator-only checks, native dialogs, DPI, IME, shell/process/editor/store/IPC, and data-root behavior cannot cross into a Windows+macOS architecture unchanged.

**Open evidence:** no professional-editor sessions or native Figma component system exist; production persistence, performance, import/export fidelity, provider behavior, confinement, ProseMirror suitability, and accessibility compliance were not proven. The Policy Document visibility/activation conflict and exact cross-branch comparison remain Commander dependencies.

**Validation:** 79/79 traceability; eleven Markdown files with valid links; JavaScript and PowerShell parsing; clean diff checks; and final browser console 0 errors / 0 warnings. These prove artifact integrity only.

### Candidate UI authority/state mapping

This mapping is retained as a hypothesis for A1. It preserves separations already required by canonical domain records; it does not accept the candidate screen geometry.

| UI event or display | Candidate record/state | Must not imply |
| --- | --- | --- |
| Authorize the displayed plan | Run Authorization bound to the exact Task Intent and Plan Envelope | Effect Approval, Proposal Decision, Review Decision, factual truth, or public release |
| Accept or reject generated wording | Proposal Decision | Applied manuscript mutation, Effect commitment, or Review Decision |
| Approve a controlled action | Effect Approval bound to exact target/payload | That the Effect committed or that retry is safe after ambiguity |
| Show committed controlled action | Effect Receipt or explicitly classified outcome evidence | Broader authority, factual correctness, signoff, or public release |
| Record editorial review | Review Decision | Factual Verification, legal/regulatory authority, Effect Approval, or public release |
| Record workflow completion/signoff | Workflow state or Signoff Record | Factual truth, Learning Eligibility, or Public Release Permission |
| Permit public release | Public Release Permission for exact material/destination | That publication occurred or that unrelated material may leave the machine |
| Show evidence judgment | Separate `引证完整性`, `陈述支持`, and five-state `事实核验` fields | One green “true/verified” state or model belief as evidence |
| Persist edit/recovery state | Separate 修订日志, 稿件修订检查点, recovered working state, and Recovery Snapshot | Harness checkpoint, Run continuation state, or silent history rewrite |

The exact 79 requirements, fourteen journeys, traceability rows, and detailed state tables are admitted only through the immutable object entries in [Packet Manifest](./PACKET-MANIFEST.md); mutable worktree files are not packet inputs.

## Explicitly excluded inputs

- Codex/ChatGPT task transcripts and summaries that contain process noise;
- `handoff20260817/raw-conversation.md` and `handoff20260817/reconstructed-transcript.md`;
- either active Worker worktree;
- tool logs, subagent chain-of-thought, failed drafts, and unreviewed scratch files;
- private manuscript/sample content or derivatives; and
- DeepSeek Harness product defaults presented as AI7 requirements.

## Completed architecture-review outputs

The independent [Round 1 review](./ROUND-1-REVIEW.md) and [candidate delta review](./CANDIDATE-DELTA-REVIEW.md) delivered all six required preparation outputs:

1. v1 assumption inventory grouped by product, domain, runtime, platform, security, verification, and UI.
2. Root problems that warrant redesign rather than patching.
3. Proposed v2 principles, each traceable to an accepted invariant or known failure.
4. A Keep / Revalidate / Reject / Spike inheritance matrix.
5. A sequenced exploration map with evidence and exit criteria.
6. Exact missing fields required from each freeze-candidate Worker line; those fields are now supplied or explicitly assigned as A1/A2 outputs.

The prepared investigation order is A1 one-product consistency/UI parity, A2 exact Harness `rc.6` composition and seam closure, then A3 truthful per-OS isolation. No owner decision is needed to start those as read-only noncanonical investigations. Owner choice is required after A1 to select the product parity/support contract and before any architecture becomes canonical.

No output from this packet is an accepted architecture decision. The Commander must obtain a coherent candidate, an independent T3 hostile challenge, and explicit owner acceptance before changing canonical architecture.
