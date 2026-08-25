# Handoff for remote agents

> **Branch-local integration notice:** on `design-doc`, start with [`docs/design-doc/README.md`](docs/design-doc/README.md). This branch preserves multiple candidate/frozen design histories. The owner has resolved their platform-scope conflict in favor of one Windows-and-macOS product, but the branch is still not `main`, a complete canonical design acceptance, or implementation permission.

Read this first if you are picking up AI7 without prior context. It is a **router and a trap list**, not a source of truth — every rule here is enforced somewhere else, and that somewhere else wins.

---

## Where the project is

**Design complete. No implementation has started.**

A 36-question design interview ran to completion and produced 26 ADRs, three domain contexts, two policy documents, and 36 design notes. The repository contains **documentation only** — no source, no `package.json`, no dependencies, no CI workflows.

Nothing here is a stub waiting to be filled in. If you are looking for code, there is none, and that is the expected state.

---

## Read in this order

| # | File | Why |
| --- | --- | --- |
| 1 | `AGENTS.md` | **Canonical standing rules.** Everything binding is here or linked from here |
| 1b | [`docs/agents/ci-test-boundaries.md`](docs/agents/ci-test-boundaries.md) | Concise implementation boundary for the sole Windows/macOS E2E Functional Gate |
| 2 | `handoff20260817/PROJECT-OVERVIEW.md` | The whole design in one pass — vision, domain, architecture, what is excluded, what is open |
| 2b | `handoff20260817/SESSION-HANDOFF.md` | Recent history: what the last session decided, which recommendations the owner overrode, and which agent errors were corrected |
| 3 | `PROGRESS.md` | What has been done, what is next, and the Resume Prompt |
| 4 | `kick-in/05-decision-map.md` | All 36 questions with their accepted answers |
| 5 | `docs/adr/` | The 26 hard-to-reverse decisions, one per file |
| 6 | `CONTEXT-MAP.md` → `docs/domain/*/CONTEXT.md` | Canonical term definitions. `GLOSSARY.md` is a bilingual index and collision guide, not a definition owner |

`kick-in/` numbering does not match question numbers. Use the decision map to find the document for a question.

---

## Traps

These are the mistakes most likely to be made by an agent arriving cold. Each has bitten during design.

**Do not treat "Harness" as a product to clone.** AI7 adopts its *composition machinery* and rejects its coding-agent purpose, default presets, default tool set, and web surface. Adopting a framework is not adopting its defaults.

**Do not rename the repository.** The `-harness`, `-reborn`, `-redesign` suffixes are developer-facing track markers with no product meaning. The product is called exactly **AI7**.

**Do not put a manuscript anywhere near git.** Manuscripts, and any derivative including retrieval indexes and embeddings, never enter any repository — public or private, history or working tree. `.gitignore` excludes document formats by pattern for this reason. Sending manuscript text to a configured model provider *is* permitted; that is the product's function.

**Do not depend on `@deepseek-ai/dsh`.** The CLI aggregate transitively installs the generic shell, pwsh, terminal, and web tool packages that the editorial tool surface excludes. Depend only on the subset AI7 needs.

**Do not use version ranges for Harness.** `latest` still points at `0.0.1-rc.1` on nearly every package while `next` is `0.1.0-rc.6`. Pin exact versions, commit the lockfile. The consumed baseline is `0.1.0-rc.6`; the audited `0.1.0-rc.5` **was never published to npm** and is a provenance reference only.

**Do not confuse the two ledgers.** The AI7 Task Ledger holds business truth; the Harness Session Ledger alone holds model messages, turns, and tool calls. They join through Execution Bindings, never by copying transcripts.

**Do not read a term across contexts.** Several words mean different things in different places — `Editorial Profile` (dimension defaults) versus `Editorial Capability Profile` (security), `Review Decision` (editorial judgment) versus a Dispatch reviewer report, `Model Role` (product, declares no provider) versus the Dispatch Layer B binding policy. Check the collision table in `GLOSSARY.md` before using a term.

**Do not rebuild the retired verification programme.** The active rule is one provider-free E2E Functional Gate running the same complete supported journey IDs on Windows and macOS. The historical tracer's thirteen-point gate, headless replay, request fingerprints, portable/package proof, exact-head review cycles, and separate engineering gates are not implementation requirements.

---

## How to work here

Repository development uses three roles, defined in `kick-in/27-repository-development-dispatch.md`:

- **Commander** — decides dispatch, sole integrator, sole external-action authority
- **Worker** — writes only its own worktree and branch; never merges, pushes, publishes, or takes external actions
- **Reviewer** — optional, independent and read-only when used; its report is advisory, not a pull-request gate

Operating rules are provider-neutral and must never be conditioned on which model is running. Layer B is the only provider-specific policy surface; operational usage logs are evidence, not additional policy.

Branch naming, commit format, PR requirements, merge strategy, and tag format are binding and live in **`docs/agents/git-conventions.md`**. Nothing is pushed to `main` directly.

GitHub Issues is the canonical tracker. Five labels, no aliases: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.

---

## What happens next

Phase 0 is complete but its **exit review has not been run**. That review confirms every decision-map row is resolved or explicitly deferred, then decomposes the accepted design into independently grabbable vertical issues.

**Decomposition has not been authorized.** Do not begin it without the owner saying so.

When implementation does start, the read-only tracer remains a useful vertical implementation slice: open a Book, import a DOCX, view it in the windowed editor, ask a source-grounded question, and resolve its citation to an exact highlighted block range. The former mandatory store-and-index spike and thirteen-point tracer exit gate are superseded historical design. If the tracer is admitted as a supported journey, it runs through the launchable product path under [`docs/agents/ci-test-boundaries.md`](docs/agents/ci-test-boundaries.md); it creates no headless, replay, request-fingerprint, package, performance, or release-proof gate.

---

## Known open items

Not decisions waiting to be made unilaterally — things a reader should know are unsettled. Full list in section 9 of the overview.

| Open | Note |
| --- | --- |
| Retrieval strategy | Lexical, vector, or hybrid — deferred to the spike |
| ProseMirror confidence | Medium. Windowing reduces the stakes; a spike should confirm |
| Latency budgets | Proposed as calibration only, not accepted figures |
| Platform distribution mechanics | Windows retains zip portable plus NSIS. macOS package/update channel, minimum OS, CPU policy, and Agent Data Root location remain open implementation decisions |
| Platform signing | Windows signing remains deferred with a known SmartScreen cost. macOS signing/notarization is a separate open implementation decision |
| Platform sandbox enforcement | Do not describe the Agent Data Root as OS-confined on either platform until the selected Windows and macOS mechanisms support that claim; AI7 capability and service facades remain authoritative |
| Question 16 scope | Answered "mostly okay" with one correction; the other four content classes were never itemized |
| UI/UX | Reserved for a separate owner-run session by design |

---

## Environment facts

- Private repository `zhouy1017/ai7-harness`, branch `main`, fresh history unrelated to either predecessor.
- AI7 is proprietary, all rights reserved to the sole rights-holder. See `LICENSE`.
- Predecessors may be read and copied from, subject to the provenance ledger: `ai7-reborn-ai` at `dev@3e6e9ac772b7f07832154fa39d7de8a4deca51b1`, and `ai7-redesign` at `fc2f4d8`, which is a strict ancestor and holds nothing unique.
- Harness upstream is `deepseek-ai/deepseek-harness`, MIT, no git tags and no GitHub releases — track it by commit and npm version.
- Product platforms are Windows and macOS as one AI7 product. Ubuntu has no product or release role.

---

## The rule behind most of the rules

When a decision looks arbitrary, it usually traces to one of these:

1. The user is a literature professional, not a computer expert — never ask them to authorize what they cannot assess.
2. Text is authoritative for what it says, never for whether it is true.
3. Authority and proof are different records; a decision is never evidence that something happened.
4. Add machinery when a concrete problem appears, not in advance.
5. Hidden is permitted; silent is not.
