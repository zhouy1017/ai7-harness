# Handoff for remote agents

Read this first if you are picking up AI7 without prior context. It is a **router and a trap list**, not a source of truth — every rule here is enforced somewhere else, and that somewhere else wins.

---

## Where the project is

**The 36-question interview is complete. A post-interview platform revision has
reopened Phase 0. No implementation has started.**

A 36-question design interview ran to completion. The owner then expanded the
target from Windows-only to Windows and macOS with a consistent product outlook,
and explicitly closed the remaining Question 16 evidence ambiguity. The
repository now contains 27 ADRs, three domain contexts, two policy documents, and
38 numbered design notes. The current platform-revision branch is a frozen local
candidate/reference, not canonical `main` or the v2 architecture line. It remains **documentation only** — no source, no
`package.json`, no dependencies, no CI workflows.

Nothing here is a stub waiting to be filled in. If you are looking for code, there is none, and that is the expected state.

---

## Read in this order

| # | File | Why |
| --- | --- | --- |
| 1 | `AGENTS.md` | **Canonical standing rules.** Everything binding is here or linked from here |
| 2 | `kick-in/37-v1-platform-freeze-handoff.md` | The exact base/branch identity, candidate-only status, reusable assets, migration costs, and frozen next action |
| 2a | `docs/adr/0027-support-windows-and-macos-as-one-product.md` and `kick-in/36-phase-0-exit-review.md` | The accepted post-interview target revision and the current failed Phase 0 audit |
| 2b | `handoff20260817/PROJECT-OVERVIEW.md` and `handoff20260817/SESSION-HANDOFF.md` | Dated Windows-only baseline history; read their supersession notices before the older text |
| 3 | `PROGRESS.md` | What has been done, what is next, and the Resume Prompt |
| 4 | `kick-in/05-decision-map.md` | All 36 questions with their accepted answers |
| 5 | `docs/adr/` | The 27 hard-to-reverse decisions, one per file |
| 6 | `CONTEXT-MAP.md` → `docs/domain/*/CONTEXT.md` | Canonical term definitions. `GLOSSARY.md` is a bilingual index and collision guide, not a definition owner |

`kick-in/` numbering does not match question numbers. Use the decision map to find the document for a question.

---

## Traps

These are the mistakes most likely to be made by an agent arriving cold. Each has bitten during design.

**Do not treat "Harness" as a product to clone.** AI7 adopts its *composition machinery* and rejects its coding-agent purpose, default presets, default tool set, and web surface. Adopting a framework is not adopting its defaults.

**Do not rename the repository.** The `-harness`, `-reborn`, `-redesign` suffixes are developer-facing track markers with no product meaning. The product is called exactly **AI7**.

**Do not put a manuscript anywhere near git.** Manuscripts, and any derivative including retrieval indexes and embeddings, never enter any repository — public or private, history or working tree. `.gitignore` excludes document formats by pattern for this reason. Sending manuscript text to a configured model provider *is* permitted; that is the product's function.

**Do not depend on `@deepseek-ai/dsh`.** The CLI aggregate transitively installs the generic shell, pwsh, terminal, and web tool packages that the editorial tool surface excludes. Depend only on the subset AI7 needs.

**Do not use version ranges, dist-tags, or release names for Harness.** As verified on 2026-08-21, sampled package `latest` values remain inconsistent while `next` is `0.1.0-rc.8`, and GitHub now has rc.7/rc.8 pre-releases. Pin exact versions and commit the lockfile. The consumed baseline remains the accepted `0.1.0-rc.6`; the audited `0.1.0-rc.5` **was never published to npm** and is a provenance reference only. Later releases are evidence until admitted through ADR 0020.

**Do not confuse the two ledgers.** The AI7 Task Ledger holds business truth; the Harness Session Ledger alone holds model messages, turns, and tool calls. They join through Execution Bindings, never by copying transcripts.

**Do not read a term across contexts.** Several words mean different things in different places — `Editorial Profile` (dimension defaults) versus `Editorial Capability Profile` (security), `Review Decision` (editorial judgment) versus a Dispatch reviewer report, `Model Role` (product, declares no provider) versus the Dispatch Layer B binding policy. Check the collision table in `GLOSSARY.md` before using a term.

**Do not claim the Harness sandbox enforces the Agent Data Root.** The audited
Windows ACL path is explicitly partial. The macOS Seatbelt path confines file
writes but not reads, network, or process visibility and relies on deprecated
`sandbox-exec`. The AI7 capability/service facade is the only currently accepted
enforceable product boundary; stronger OS confinement or a revision of the
promise is a Phase 0 decision.

---

## How to work here

Repository development uses three roles, defined in `kick-in/27-repository-development-dispatch.md`:

- **Commander** — decides dispatch, sole integrator, sole external-action authority
- **Worker** — writes only its own worktree and branch; never merges, pushes, publishes, or takes external actions
- **Reviewer** — independent, never authored what it reviews, at a task class at least equal to the work

Operating rules are provider-neutral and must never be conditioned on which model is running. Layer B is the only provider-specific policy surface; operational usage logs are evidence, not additional policy.

Branch naming, commit format, PR requirements, merge strategy, and tag format are binding and live in **`docs/agents/git-conventions.md`**. Nothing is pushed to `main` directly.

GitHub Issues is the canonical tracker. Five labels, no aliases: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.

---

## What happens next

The Phase 0 exit review **has been run and did not pass**. Question 16 is fully
resolved, but the platform revision leaves the consistency contract, macOS
support/package/signing/credentials, per-platform confinement, native evidence,
and the Harness rc.5-to-rc.6 seam audit open. See
`kick-in/36-phase-0-exit-review.md`.

The current branch is frozen as a local candidate/reference and returns to the
Project Commander. Its immediate next action is separately authorized
architecture exploration of those named risks and reconciliation of any
noncanonical UI-branch dependency—not automatic integration, implementation, or
issue decomposition. See `kick-in/37-v1-platform-freeze-handoff.md`.

**Decomposition has not been authorized.** Do not begin it without the owner saying so.

If implementation is later authorized after architecture reconciliation, the recorded v1 order is:

1. **Store-and-index spike** — throwaway, time-boxed. Generated Chinese corpora at 500K / 1M / 10M characters, measuring find, jump, replace, cold open, retrieval build cost, and peak memory. Confirms or changes the store and retrieval strategy before anything is committed to.
2. **Read-only tracer slice** — open a Book, import a DOCX, view it in the windowed editor, ask a source-grounded question, and have the citation resolve to an exact highlighted block range. Thirteen-point exit gate in `kick-in/34-first-tracer-slice.md`.

---

## Known open items

Not decisions waiting to be made unilaterally — things a reader should know are unsettled. Full list in section 9 of the overview.

| Open | Note |
| --- | --- |
| Retrieval strategy | Lexical, vector, or hybrid — deferred to the spike |
| ProseMirror confidence | Medium. Windowing reduces the stakes; a spike should confirm |
| Latency budgets | Proposed as calibration only, not accepted figures |
| Cross-platform consistency | The target is accepted; the recommended exact meaning still needs owner confirmation |
| macOS support and release | Minimum OS/architectures, package/update/data location, Keychain, signing/notarization, and exact native proof are open |
| Agent Data Root enforcement | Harness Windows is partial and macOS Seatbelt is write-only in scope; stronger per-platform isolation or an explicit guarantee revision is required |
| Harness consumed baseline | rc.6 remains accepted, but the rc.5-to-rc.6 selected-seam delta audit must precede Phase 0 exit and implementation; rc.7 and rc.8 are evidence only |
| Windows code signing | Deferred until the owner requests it. This does not decide Apple signing/notarization |
| UI/UX | Reserved for a separate owner-run session by design |

---

## Environment facts

- Private repository `zhouy1017/ai7-harness`, branch `main`, fresh history unrelated to either predecessor.
- AI7 is proprietary, all rights reserved to the sole rights-holder. See `LICENSE`.
- Predecessors may be read and copied from, subject to the provenance ledger: `ai7-reborn-ai` at `dev@3e6e9ac772b7f07832154fa39d7de8a4deca51b1`, and `ai7-redesign` at `fc2f4d8`, which is a strict ancestor and holds nothing unique.
- Harness upstream is `deepseek-ai/deepseek-harness`, MIT, with rc.7/rc.8 pre-release tags/releases as of 2026-08-21; track tags/releases, commits, npm versions, and dist-tags together without treating any moving channel as admission.
- Target platforms are Windows and macOS. Ubuntu has no product or release role
  and may appear only as separately justified feedback infrastructure.

---

## The rule behind most of the rules

When a decision looks arbitrary, it usually traces to one of these:

1. The user is a literature professional, not a computer expert — never ask them to authorize what they cannot assess.
2. Text is authoritative for what it says, never for whether it is true.
3. Authority and proof are different records; a decision is never evidence that something happened.
4. Add machinery when a concrete problem appears, not in advance.
5. Hidden is permitted; silent is not.
