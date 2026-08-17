# AI7 Harness Project

## Project phase

This repository is in architecture and migration design. Read `kick-in/README.md` and the current `PROGRESS.md` before acting. Do not add product implementation, copy source from either input repository, vendor Harness, initialize or publish a remote, or merge histories until the relevant accepted decision explicitly authorizes it.

Review original-AI7 documentation one topic cluster at a time through `kick-in/08-source-document-inheritance.md`. Do not copy source documents wholesale. Accepted new decisions and canonical context definitions outrank source-project instructions; unresolved source material remains evidence only. Harness-specific inheritance is an architecture-maintainer decision, subordinate to accepted AI7 product and safety constraints.

The new AI7 is a Chinese-first, Windows-focused Standalone desktop product for professionals in leading literary publishing houses in mainland China. Microsoft Word integration is excluded from V1 scope: there is no cross-surface parity, COM add-in, synchronization protocol, Word packaging, or Word verification gate. The legacy Standalone and Word UI implementations, layouts, editors, and component models are not migration baselines; retain or revise user outcomes only when individually accepted.

Treat professional long-form text editing as a release-critical Standalone outcome. The independent UI/UX design must address long Chinese manuscripts, extensible structure and exact selection, durable editing/recovery, proposals/review, Chinese input/typography, and import/export fidelity without assuming the old editor. For representative publishing workflows, classify inline styles, comments/revisions, notes, tables, images/captions, sections, headers/footers, and round-trip behavior explicitly as preserve, degrade with disclosure, or reject—never lose them silently. Failure of the evidence-backed Standalone Editing Sufficiency Gate triggers diagnosis of editor, document-conversion, or genuinely Word-dependent workflow gaps; Word may enter a later release only through a separate ADR showing that live integration is the proportionate remedy.

Treat manuscripts, sources, and derivatives as Unpublished Editorial Material until Public Release Permission exists. Prevent unauthorized exposure through public channels, but do not silently inflate this into a classified/high-secrecy threat model.

Keep the Book as the source, privacy, and mutation authority, while every Book-owned Editorial Deliverable follows its own Workflow Instance pinned to a versioned Workflow Profile. V1 profiles cover Manuscript, Promotion Article, News Report, and Review Article; they compose seven shared phases—intake, source development, drafting, review/verification, finalization, delivery, and maintenance—which may overlap, reopen, or be skipped with a recorded reason.

Workflow state is durable editorial business state, not a Harness Workflow or Session. AI-assisted Task Skills may propose content and records, but only narrow deterministic commands may mutate Workflow Instances, Editorial Artifacts, Workflow Gates, Signoff Records, or Delivery Packages. Completion or signoff never implies factual truth, legal or regulatory authority, Public Release Permission, or Learning Eligibility.

Keep task source/mutation scope separate from editorial learning scope. A manuscript task may use its Book plus explicitly selected Cross-project sources; corpus-wide adaptation must flow through governed House Editorial Memory and must not silently expose another Book's raw text or facts.

Treat Series as an explicit richer-sharing exception: member Books may share governed Series Knowledge and a Series read scope, but every manuscript mutation remains targeted to a specific Book and revision.

Treat an imported manuscript revision as the Textual Source of Record for what the document exactly says, never as a truth oracle for its assertions. AI7 must identify possible factual and semantic errors through evidence-bearing review, distinguish textual fidelity from factual verification, and express fixes as exact-revision Correction Proposals rather than silently rewriting source text.

Factual Verification follows the active versioned Factual Verification Policy Document. Record Reference Integrity, Claim Support, and Factual Verification independently; preserve unresolved or conflicting evidence, and use Foundation Model knowledge only to raise verification questions or guide research, never as factual evidence by itself.

Preserve manuscript history through stable Manuscript Blocks, immutable reconstructable Manuscript Revisions, text-only Manuscript Branches, per-branch durable Edit Journals, meaningful Manuscript Checkpoints, and independent verified Recovery Snapshots. Keep these records distinct from Source Versions, Source Index Chunks, Run Continuation Checkpoints, Harness technical checkpoints, and Harness Sessions.

All model-generated manuscript changes begin on Proposal Branches. Apply is atomic and exact-pin-bound: identical or non-interacting different-block changes may merge automatically, while different same-block changes and ambiguous structural interactions require explicit editor resolution; model-composed resolutions remain proposals.

Never use unqualified Approval as a domain authority. Distinguish Run Authorization, Execution Grant, Proposal Decision, Review Decision, Effect Approval, and Public Release Permission. One user interaction may create more than one exact record, but no decision or grant is proof that an Effect committed.

Every authoritative or externally visible Effect has stable identity, declared replay policy, exact target/payload binding, staged verification when applicable, per-Effect atomic publication, and an Effect Receipt or explicitly classified outcome evidence. Material drift invalidates Effect Approval; ambiguous external outcomes stop automatic retry and fallback; cancellation never claims to undo committed Effects.

Keep stable English domain terms for architecture and record identifiers, and maintain one preferred Simplified Chinese label for every accepted glossary term. Chinese-first product surfaces use the preferred Chinese label; `GLOSSARY.md` is the bilingual index, while each context `CONTEXT.md` remains the canonical definition owner.

No material may influence learned editorial behavior without Learning Lineage visible in the Learning Audit Log. Explicit inclusion/exclusion decisions outrank inferred Learning Eligibility Policy, and eligibility learning remains separate from editorial-preference learning.

Rules that grant or constrain product authority live in versioned, human-reviewable, machine-validatable Policy Documents rather than hidden prompts or code-only defaults. Production-run evidence may trigger AI-agent review and a Proposed Policy Revision, but historical versions remain immutable and no revision may expand its own scope or authority. Automatic activation is limited to evaluated, non-expansive calibration inside a user-approved envelope; semantic or authority changes require explicit user activation.

AI7 does not train or fine-tune an LLM. All model-facing design uses replaceable provided Foundation Models behind the AI7 Editorial Intelligence Layer. Preserve Professional Editorial Knowledge, provenance, memory, policies, and evaluations outside model weights, and judge changes by Editor-comparable Delivery Quality plus measurable workload reduction.

Use DeepSeek Harness primarily as AI7's Agent Behavior Framework. Shape and evaluate how agents assemble context, plan, select tools, coordinate subagents, request approval, recover, and deliver evidence through versioned Harness compositions and documented extension seams. Keep Agent Behavior Improvement distinct from both Editorial Learning and Model Training. Do not fork the generic agent loop without an accepted seam-gap decision, and do not permit silent runtime self-modification.

Every production task binds an exact Task Intent and versioned Execution Plan to a machine-authoritative Plan Envelope. Its Plan Preview is only the human-readable projection; Run Authorization permits logged Plan Adaptations inside the unchanged envelope, while material changes to goal, scope, capabilities, providers, privacy category, budget, outcome, Effect class, or authority-bearing pins suspend work and require a Plan Revision plus renewed Run Authorization.

Run Authorization never grants Effect Approval, Proposal Decision, Review Decision, or Public Release Permission. Clarification Requests, pause/cancel, and Task Outcomes are durable and restart-safe; every outcome records actual-versus-planned work, evidence, unresolved matters, Effects/receipts, and a safe next action without silently becoming an authoritative manuscript, Editorial Artifact, factual resolution, or public release.

Use one logical causal graph with two authoritative ledgers. The AI7 Task Ledger owns Task Intents, Run Records, business commands, decisions, Effects, outcomes, workflow references, and provenance; the Harness Session Ledger alone owns model messages, turns, steps, tool calls/results, technical events, checkpoints, diagnostics, and attempt history. Join them through exact Execution Bindings and Harness Execution Spans without copying transcripts. Do not create active Operation Records, Operation Events, or `operationRuns`; legacy instances remain old-repository or offline evidence only and are not imported.

Resume continues the same unchanged Run from authoritative AI7 state, Retry creates a new safe execution attempt within that Run, Redo creates a newly authorized Run, and Replay performs no execution. A Harness success, tool result, Session event, or watermark is never an AI7 Effect Receipt or business completion proof.

Treat an AI7 Task Skill as an immutable declarative workflow package, never as a Cordis Plugin, Harness Tool, Model Provider, credential, or authority grant. Project each admitted Task Skill into a non-authoritative Harness instructional skill plus an AI7-owned per-Run Task Skill Activation; install code-bearing Capability Implementations separately through pinned, reviewed deployment composition.

Task Skill trust derives from installer/release provenance. Candidate, installed, validated, enabled, disabled, and retired are admission states, while enablement establishes only an Authority Ceiling. Effective Capability Grants are the per-Run intersection of that ceiling with the Task Intent, Plan Envelope, Run Source Scope, Provider Resolution Plan, active policies, and runtime constraints; enforce the same activation in both Harness tool guards and AI7 capability/service facades.

Task Skills declare Model Roles with hard requirements and soft preferences, never a provider, model, endpoint, or credential. Provider Preflight freezes the selected bindings, Approved Fallback Chain, Outbound Data Category, scope, and budget inside the Plan Envelope. Resolve secrets through opaque Credential References and an AI7 Credential Broker into an OS-protected store; never expose values to Task Skills, prompts, Session text, generic environments, tool results, or diagnostics.

Keep Provider Processing Policy, External Export Policy, and Public Release Permission separate. A configured model call is controlled processing, not public release; reading within a Run Source Scope does not by itself permit outbound transmission.

The future verification design must preserve a tiered GitHub Actions workflow and deterministic generated mock-LLM-provider cases. Required CI remains provider-free; any live-provider evidence is separate and explicitly authorized. Preserve local multi-agent dispatch as a repository-development workflow only, never as shipped AI7 runtime behavior.

Legacy-data migration is allowlist-only. Do not import old production Books, manuscripts, indexes, embeddings, memory, task/run/operation history, workflows, proposals, decisions, Effects, receipts, or UI state. The only permitted legacy transfers are user-initiated API credential transfer directly into the new Protected Secret Store, reviewed mock-LLM-provider generators/fixtures/cassettes, and explicitly selected testing sample Books; secret values never enter files or logs, and test Books are excluded from production learning and publication by default.

## Checkpointing

At session start, read `PROGRESS.md` if it exists. After each sub-task, update it with:

- What's done, including affected paths.
- What's next.
- Key decisions made.
- A one-sentence Resume Prompt.

## Project instructions

`AGENTS.md` is the canonical shared instruction file. Keep root `CLAUDE.md` as the single line `@AGENTS.md`; put shared context here, not in `CLAUDE.md`.

## Agent skills

### Issue tracker

GitHub Issues is the canonical work-item tracker. Pull requests are implementation/review artifacts and are not an incoming triage surface at this stage. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five canonical labels without aliases: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a multi-context project. Start from `CONTEXT-MAP.md`, follow the relevant context `CONTEXT.md`, use `GLOSSARY.md` only as a cross-context reference index, and read applicable ADRs. See `docs/agents/domain.md`.
