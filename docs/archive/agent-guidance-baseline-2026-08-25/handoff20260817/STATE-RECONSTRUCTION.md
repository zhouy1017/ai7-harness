# AI7-Harness — Reconstructed Project State

Reconstructed 2026-08-17 by Claude, taking over from Codex.

> Historical-state note (2026-08-25): this reconstruction preserves the decisions and evidence available on 2026-08-17. Its Windows-only product statements were later superseded by [ADR 0028](../docs/adr/0028-support-windows-and-macos-as-one-product.md). Current scope is one Windows-and-macOS product; use root `HANDOFF.md` and `AGENTS.md` for current authority.

Sources used, in the authority order you specified:

1. `handoff20260817/raw-conversation.md` (2180 lines) — the only conversational record. Citations below are `raw-conversation.md:LINE`.
2. The `ai7-harness` working directory (57 Markdown files, no code).
3. `C:\Users\Chooo\codebase\ai7-reborn-ai` at `dev@3e6e9ac772b7f07832154fa39d7de8a4deca51b1` — the exact audit pin.
4. `zhouy1017/deepseek-harness` at `master@47f943859bef60e4160492346772ded9b24f765a` — **not cloned locally**; Codex read it through `gh api` only.

Repository contents are treated as evidence of what was *written down*, never as proof that you accepted it.

---

## A. Project objective

**Confirmed fact (High).** Design — not build — a new AI7 product that carries forward the purpose, vision, and selected domain guarantees of `ai7-reborn-ai`, running on DeepSeek Harness as its agent framework. Your opening instruction: *"Guide me to setup a new project from scratch, but the main purpose and vision and basic implementations from … ai7-reborn-ai … combine with the new harness framework … Create a 'kick-in' folder to store the design docs for migration and help me to decide the new design and the (keep-drop) decisions on legacy project. We are at plan stage… No real implementation needed"* (`raw-conversation.md:3`).

**Confirmed decision (High).** The product itself: a Chinese-first, Windows-only Standalone desktop editorial workbench for professionals in leading mainland-China literary publishing houses, covering a Book plus its related deliverables (`raw-conversation.md:343`, `:2003`, `:2173`).

**Confirmed decision (High).** AI7 does not train or fine-tune an LLM. It uses provided Foundation Models plus editor-supervised knowledge to reach comparable quality and cut editor workload: *"AI7 does not aim to training a LLM model, instead, it uses provided foundation model but combine it with the knwledge(materials) supervised/produced/approved/modified, etc by professional editors to provide comparative quality to reduce the editors workload. Remind this vision for all model design"* (`raw-conversation.md:747`).

**Confirmed decision (High).** What Harness is for: *"the main goal from dsh is that to learn its harness framework to achieve better behavior of the LLM agent"* (`raw-conversation.md:809`).

---

## B. Confirmed functional requirements

Each row is something you stated or explicitly accepted. "Your words" quotes you; unquoted rows are Codex proposals you answered with a bare accept.

| # | Requirement | Evidence | Confidence |
|---|---|---|---|
| B1 | Chinese is the working and book language; primary user is an editorial professional in a top mainland-China literary publishing house | *"the working language and the book language should be assumed in Chinese and the role should be in top literature publishing house of mainland China"* `:343` | High |
| B2 | Deliverables are not only manuscripts: also promotion articles, news reports, reviews | *"the text delivery is not limited to edited manuscripts but also the related contents like promoting articles, news reports and reviews"* `:343` | High |
| B3 | Multi-aspect editorial judgment across 8 baseline dimensions, **user-extensible in production** | *"just keep this but leave a flexible change entry for user in production."* `:409` | High |
| B4 | Dimension config model: Editorial Profile → Book override → task-start snapshot; archive-not-delete | `"agree."` `:463` to a fully-specified proposal | High |
| B5 | Book is the source/mutation authority for manuscript tasks; cross-project requires explicit Book selection | *"Agree mostly for text manuscript tasks."* `:515` | High |
| B6 | **In addition**, the system must learn from the whole working corpus to approach your delivery quality | *"But the project should learn patterns and feedbacks from all working corpus to adaptively get closer to user's delivery quality."* `:515` | High |
| B7 | Cross-Book learning goes through inspectable House Editorial Memory (derived patterns, not raw text) | accepted with the Series carve-out `:571` | High |
| B8 | **Series is an explicit richer-sharing exception** | *"add an exception for series work which could have stronger links and should share more information between works."* `:571` | High |
| B9 | Series detail: versioned membership, auto-shared Series Knowledge, provenance-bearing cross-member retrieval, mutations still Book/revision-targeted | `"agree"` `:629` | High |
| B10 | Learning-signal governance: explicit commands act immediately; inferred patterns are candidates only; cross-Book promotion needs approval | `"agree."` `:688` | High |
| B11 | **Learning Audit Log**: see which materials fed learning, mark include/exclude — *and* those marks must teach a future policy, not be one-off edits | *"I want to add a audit log feature… moreover, this user input should be used as a reference to learn which contents are learnt in the future instead of just a as-is edit"* `:688` | High |
| B12 | Audit/exclusion remediation contract (append-only lineage, dependency-aware invalidation, running tasks pause, history marked not rewritten) | `"agree."` `:747` | High |
| B13 | Authority rules live in versioned documents that AI agents may review and revise after production runs | *"For those policy authority like rules, it should be in a doc and could be reviewed and edited by AI-agents after production runs."* `:917` | High |
| B14 | Hybrid policy activation: agents may auto-activate only non-expansive in-envelope calibration; semantic/authority changes need you | `"agree."` `:980` | High |
| B15 | **Manuscript text is the source of truth for what it says, never a truth oracle for whether it is right**; AI7 must find and propose fixes for factual and semantic errors | *"when referring to a sentence in manuascript or any text quotation, original text can be regarded as source of truth. However, when checking the manuascript for errors, it cannot be truth oracle. Instead, ai7 should help to identify and fix the factual and semantic errors in the text"* `:1091` | High |
| B16 | Configurable Factual Verification Policy; model knowledge may raise questions but cannot verify; conflicts stay visible | `"agree"` `:1185` | High |
| B17 | Manuscript history: stable blocks, immutable revisions, text-only branches, edit journal vs. checkpoint split, proposal branches, atomic apply, verified recovery, **conservative same-block merge requiring editor resolution** | `"agree"` `:1270` | High |
| B18 | Named authority records replace generic "Approval": Run Authorization / Execution Grant / Proposal Decision / Review Decision / Effect Approval / Public Release Permission / Effect Receipt | `"accept."` `:1366` | High |
| B19 | **Bilingual glossary**: every accepted term gets a Simplified Chinese label | *"in addition, create Chinese terms for those glossary for user's convenience"* `:1366` | High |
| B20 | Deliverable-owned workflows: Book keeps authority, each deliverable has its own workflow instance; 7 shared phases; 4 V1 profiles (Manuscript, Promotion Article, News Report, Review Article) | `"Accept"` `:1480` | High |
| B21 | Task Intent + Execution Plan + Plan Preview + machine-authoritative Plan Envelope; Run Authorization bound to the envelope; material drift → Plan Revision + re-authorization | `"Accept"` `:1575` | High |
| B22 | Task Skills are immutable declarative packages; layered candidate→install→validate→enable(ceiling)→per-Run activation; skills declare Model Roles not providers; brokered credentials | `"agree"` `:1658` | High |
| B23 | Two ledgers, one causal graph: AI7 Task Ledger (business) + Harness Session Ledger (model/exec), joined by Execution Bindings; legacy Operation/`operationRuns` retired | `"Accept."` `:1770` | High |
| B24 | Preserve tiered GitHub Actions CI **combined with** generated mock-LLM-provider test cases | *"I want to keep the tiered-github-action-test-workflow combined with the generated mock-llm-provider test cases"* `:273` | High |
| B25 | Preserve local multi-agent dispatch — **development only, never product runtime** | *"the local multi-agent dispatch workflow(this workflow is just for development instead of in production delivery)"* `:273` | High |
| B26 | Keep a revised `AGENTS.md`; GitHub Issues as tracker; 5 default triage labels; multi-context docs + maintained glossary | `:273`, `:88`, `:141`, `:171` | High |
| B27 | Detailed feedback UI/UX is deferred to a separate session you will run | *"Design a easy user feedback interaction later in UI/UX and interation design(I plan a independent agent session for UI related designs)"* `:917` | High |

---

## C. Confirmed non-functional requirements and constraints

| # | Constraint | Evidence | Confidence |
|---|---|---|---|
| C1 | **No implementation in this phase.** Design/planning documents only | *"We are at plan stage… No real implementation needed"* `:3` | High |
| C2 | **Windows-only target platform.** Ubuntu has no production role | *"The target platform is just windows-only. We do not need a production for ubuntu at this stage."* `:2173` | High |
| C3 | Ubuntu exists only as a GitHub Actions runner | *"The ubuntu setup is just for github actions."* `:2173` | High — but see K3 for the reading ambiguity |
| C4 | **Verification/build/test must be concise and quick** | *"the tiered verification/build/test should be concise and quick"* `:2173` | High |
| C5 | Confidentiality is *controlled non-publication*, not classified-data secrecy | *"the confidential does not mean a complex strict secrect keeping requirment. Instead, we just need avoid the manuscripts to be released to public without permission."* `:343` | High |
| C6 | Windows desktop app, old UI discarded | *"should still be a windows-focused desktop app but the old UI could be disgarded"* `:273` | High |
| C7 | **Standalone-only V1**; Word only if Standalone editing proves unsatisfactory | *"I prefer a standalone only boundary in this version and word surface is an alternative while the old standalone could not provide a satisfying experience for text editing. If there are better options in standalone, word surface is not required"* `:2003` | High |
| C8 | **No production data migration** except three items: API keys, mock-LLM-provider contents, some testing sample books | *"New ai7 does not need to import any real production data from old version except api keys and mock-llm-provider contents and some testing sample books"* `:1770` | High |
| C9 | You decide original-AI7 doc inheritance; Harness doc details delegated to the agent | *"I only care the docs from orginal AI7 and the contents from deepseek harness is up ti you."* `:273` | High |
| C10 | Old user stories are evidence to revise, not requirements to copy | *"The user story of the overall might be revised based on old AI7."* `:273` | High |
| C11 | No external contributors at this stage; PRs are not a triage surface | `:113` | High |
| C12 | English stays the stable technical identifier; Chinese is the preferred product label | Codex's implementation choice under B19; you did not restate it | Medium — you asked for Chinese terms, not for this specific split |

---

## D. Explicit non-goals

| # | Non-goal | Evidence | Confidence |
|---|---|---|---|
| D1 | Training or fine-tuning an LLM | `:747` | High |
| D2 | Microsoft Word integration in V1 (COM add-in, sync protocol, parity, Word packaging, Word CI gate) | `:2003` | High |
| D3 | Reusing the old Standalone UI/editor as a baseline | `:273` + `:2003` | High |
| D4 | Ubuntu as a production/target platform | `:2173` | High |
| D5 | Importing legacy Books, manuscripts, indexes, memory, task/run/operation history, workflows, proposals, decisions, Effects, receipts, UI state | `:1770` | High |
| D6 | Product multi-agent orchestration derived from the legacy dispatch pilot | `:273` | High |
| D7 | Writing product code, initializing a git remote, vendoring Harness, or merging histories during this phase | `:3` + repo state | High |
| D8 | A classified/high-secrecy threat model | `:343` | High |
| D9 | Detailed feedback UI/UX design in *this* session | `:917` | High |

---

## E. Decisions you clearly accepted, with rationale

Thirteen were promoted to ADRs. All thirteen trace to an explicit accept from you.

| ADR | Decision | Your acceptance | Rationale you gave or endorsed |
|---|---|---|---|
| 0001 | Version editorial-dimension configuration at task start | `"agree."` `:463` | Later catalog edits must not rewrite historical task evidence |
| 0002 | Separate Book / Series / Cross-project / House-learning scopes | `"agree"` `:629` (+ `:515`, `:571`) | Task authority ≠ learning scope; Series needs richer sharing |
| 0003 | Foundation models + governed editorial intelligence, no LLM training | `:747` | Durable advantage is editor-supervised knowledge, not weights |
| 0004 | Govern learning eligibility with versioned Policy Documents | `:917`, `:980` | Rules should be reviewable documents, agent-revisable after real runs |
| 0005 | Separate textual fidelity from factual verification | `:1091`, `:1185` | The manuscript can't certify itself |
| 0006 | Preserve manuscript-native history and recovery | `:1270` | Conservative same-block merge; AI may suggest but not choose |
| 0007 | Separate decisions, authority, and Effect proof | `:1366` | "Approval" was overloaded; approved ≠ attempted ≠ committed |
| 0008 | Deliverable-owned workflow profiles | `:1480` | A manuscript can be in proof while its promo article is drafting |
| 0009 | Authority-bearing Plan Envelopes | `:1575` | The visible plan must be enforceable, not decoration |
| 0010 | Separate Task Skill instruction / implementation / authority | `:1658` | Naming a tool must not grant authority to use it |
| 0011 | Separate task-business and Harness-execution ledgers | `:1770` | Kill the three overlapping legacy execution records |
| 0012 | Exclude legacy production-data migration | `:1770` | Only keys, mock-provider content, sample test books |
| 0013 | Ship Standalone-only V1, defer Word | `:2003` | Word is a remedy for a failure that hasn't been demonstrated yet |

Plus non-ADR accepted items: GitHub Issues (`:88`), no external-PR triage (`:113`), five default triage labels (`:141`), multi-context + glossary (`:171`), canonical setup files (`:204`), the row-by-row review method and its five cross-cutting dispositions (`:273`), the product spine (`:343`), the eight-dimension baseline (`:409`), and bilingual glossary labels (`:1366`).

---

## F. Proposals discussed but not clearly accepted

| # | Proposal | Status | Confidence |
|---|---|---|---|
| F1 | **The entire Q24 verification contract**: four tiers (`focused`/`pr`/`nightly`/`release`), non-gating provider rehearsal, machine-owned Test Catalog, exact proof receipts, scenario-exact quarantine, three-part mock model, request-fingerprint guard, regenerated corpus | Asked at `:2156`; your reply `:2173` was a **correction, not an accept**. `kick-in/26-*.md` line 3 still reads "Status: **proposed for Question 24**" | High |
| F2 | Fresh AI7-owned repository, initially private | Codex's opening recommendation `:69`; parked as Q27. Never accepted | High |
| F3 | Pin Harness at `47f9438…` (`0.1.0-rc.5`) as packages rather than forking | Recommendation `:70`; Q30. Never accepted | High |
| F4 | "AI7 as a Harness profile/bundle/plugins/adapters" architecture | `kick-in/02-target-architecture.md` line 3: "Status: **proposal for grilling; not accepted**" | High |
| F5 | Meaning of "full Harness capability", default capability exposure, developer vs. editorial profiles | Q29 — purpose accepted `:809`, authority/detail explicitly open | High |
| F6 | Repository-development dispatch detail (roles, authority ceilings, worktrees, handoffs, receipts) | Q25 — direction accepted `:273`, detail open | High |
| F7 | Repo visibility, license, private-source reuse authority, branding | Q27/Q28 — never asked | High |
| F8 | Single-execution-authority statement, AI7↔Harness record mapping beyond Q22 | Q31/Q32 — never asked | High |
| F9 | Python posture / legacy runtime behind bounded providers | Q33 — only the data half is accepted | High |
| F10 | New Windows Standalone shell and editor topology | Q34 — never asked | High |
| F11 | First tracer slice (read-only source-grounded Q&A over one synthetic DOCX) and its exit gate | Q35 — never asked | High |
| F12 | Renaming legacy "Minimal runnable harness" → "bootstrap verification scaffold" | Part of the Q6 matrix `:267`; never individually confirmed | Medium |
| F13 | Runner labels `ubuntu-24.04` / `windows-2025`, nightly cron `0 18 * * *`, 15/20-minute budgets | Inside F1; superseded in spirit by C4 | High |

---

## G. Decisions or proposals later superseded

| # | Earlier | Superseded by | Confidence |
|---|---|---|---|
| G1 | "Confidential manuscript" as the product framing | Unpublished Editorial Material / controlled non-publication `:343` | High |
| G2 | Q6 as a single all-at-once matrix approval | Row-by-row original-AI7 review; estimate 19 → 28 `:273` | High |
| G3 | Book-wide eleven-stage publication lifecycle | Deliverable-owned workflow profiles, 7 phases, 4 V1 profiles `:1480` | High |
| G4 | Keeping legacy `Operation Record` (early keep/adapt/drop row said keep) | Retired entirely; facts redistributed to Run/Workflow/Effect/Command `:1770` | High |
| G5 | `Operation Checkpoint` as a single concept | Split into Run Continuation Checkpoint / Workflow state / Effect evidence / Harness technical checkpoint `:1770` | High |
| G6 | **Q23 bounded Word companion surface** (semantic parity, Word Host Binding, sync Effects, Word context terms) — a full 254-line doc, deleted and rewritten | Standalone-only V1 `:2003`; the doc was deleted and replaced, `docs/domain/word-integration/CONTEXT.md` deliberately emptied | High |
| G7 | Generic "Approval" as a domain word | Six named authorities + Effect Receipt `:1366` | High |
| G8 | Byte-copying `public-synthetic-corpus-v1.json` | Regenerate — its byte length leaked a private `sample1.docx` size fingerprint | High (Codex finding, not your decision) |
| G9 | Question count 17 → 18 → 19 → 28 → 29 → 30 → 32 → 33 → 35 | Current estimate 35 | High |
| G10 | Interview implicitly aiming at Standalone+Word parity gates | Word excluded from V1 gates entirely `:2003` | High |

---

## H. Current repository and implementation state

**Confirmed facts (High).**

- `C:\Users\Chooo\codebase\ai7-harness` is **not a git repository**. There is no `.git` directory anywhere in it or above it. `git status`, `git diff`, `git log` all fail with *"not a git repository"*. There are therefore no staged changes, no unstaged changes, no commits, and no branches. Everything in the folder is, strictly, untracked. (The session header claiming "Is a git repository: true" and "Current branch: HEAD" is wrong.)
- **57 files, all Markdown. Zero code, zero tests, zero config, zero CI workflows, zero `package.json`.** No dependencies installed, no runtime scaffold.
- Layout:
  - Root: `AGENTS.md` (13 KB, the canonical standing rules), `CLAUDE.md` (the literal one-line `@AGENTS.md` wrapper), `CONTEXT-MAP.md`, `GLOSSARY.md` (20 KB bilingual index), `UBIQUITOUS_LANGUAGE.md` (29 KB), `PROGRESS.md` (41 KB checkpoint).
  - `docs/adr/` — 13 accepted ADRs (`0001`–`0013`).
  - `docs/agents/` — `domain.md`, `issue-tracker.md`, `triage-labels.md`.
  - `docs/domain/` — `editorial/CONTEXT.md` (15 KB), `execution/CONTEXT.md` (20 KB), `word-integration/CONTEXT.md` (447 bytes, intentionally empty placeholder).
  - `docs/policies/` — `learning-eligibility-policy.md`, `factual-verification-policy.md`.
  - `kick-in/` — `00`–`26` design notes + `README.md` + `decisions/README.md`.
  - `handoff20260817/raw-conversation.md` — added 2026-08-17 12:26, the only file created after the design session.
- **Last design write: 2026-08-17 00:24 (`PROGRESS.md`).** The newest `kick-in` writes are 00:22:50 (`05-decision-map.md`, `09-retained-development-workflows.md`). Your Q24 correction arrived after that and **is nowhere in the repository.**
- Codex's own self-checks passed at the end: all local Markdown links resolve, `CLAUDE.md` is exactly `@AGENTS.md`, 137 unique one-to-one glossary/context terms.

**Related repositories (Confirmed facts, High).**

| Path | State |
|---|---|
| `codebase/ai7-reborn-ai` | On `dev`, HEAD = `3e6e9ac772b7f07832154fa39d7de8a4deca51b1` — **exactly the audit pin**. 5 uncommitted modifications: `PROGRESS.md` and all four workflows (`pr-gate`, `nightly-full-test-gate`, `release-candidate`, `final-release`), each edited to `on: []` with the comment *"Disabled by repository policy; restore explicit event triggers to re-enable."* So the legacy repo's CI is locally switched off. Not a new-project decision. |
| `codebase/ai7` | The older Python/FastAPI-era AI7 (`backend/`, `.venv`, `.python-version`), on branch `codex/20260629auto`. This is the `docs/reference/current-ai7/` layer referenced in the audits. |
| `codebase/ai7-redesign` | An intermediate July redesign on `main`. Never mentioned in the conversation. |
| `deepseek-harness` | **Not cloned locally.** Codex read it exclusively through `gh api` at `master@47f9438…`. Nothing about it can be re-verified offline. |
| `codebase/playground/AI7-v0.10.2-qinqin-portable-windows-x64` | A packaged legacy build. Not referenced. |

---

## I. Differences between intended design and current repository state

| # | Gap | Severity | Confidence |
|---|---|---|---|
| I1 | **Your Q24 correction is unrecorded.** `kick-in/26-*.md` still pins `ubuntu-24.04` + `windows-2025`, four tiers, a nightly cron, 15/20-min budgets, a Test Catalog with 8 required fields per route, proof-input fingerprints, and a quarantine registry — none of which reflects "concise and quick" or "windows-only" | **High** | High |
| I2 | `kick-in/05-decision-map.md` row 24 says *"Detailed proposal ready; direction accepted"* — accurate, but `PROGRESS.md` "What's next" still says "Ask Question 24/35", i.e. the checkpoint thinks the question is unasked rather than answered-with-correction | Medium | High |
| I3 | `kick-in/02-target-architecture.md` is still marked "not accepted" while `AGENTS.md`, the charter, and the ADRs already assume its three-layer model and Harness-as-execution-plane framing. The architecture is being relied on before it was accepted | Medium-high | High |
| I4 | The charter (`00-charter.md`) is still "Status: **working draft**" though most of its content is now ADR-backed | Low | High |
| I5 | `kick-in/26` says required CI runs on `ubuntu-24.04` for the portable lane. Under C2/C4 the whole Ubuntu lane's existence is now a live question, not a settled detail | Medium | High |
| I6 | Q25–Q35 have no design documents at all (repository dispatch detail, repo identity/license, Harness capability boundary, upstream strategy, Python posture, Standalone shell topology, tracer slice) | Expected, not a defect | High |
| I7 | No `README.md` at the repository root; the entry point is `AGENTS.md` + `kick-in/README.md` | Low | High |
| I8 | Not a git repository, so none of this design work is under version control or backed up by history | Medium — worth a decision | High |

---

## J. Unresolved design questions

Open by number, per `kick-in/05-decision-map.md`:

- **Q24 (reopened by your correction)** — the verification contract, now under a windows-only + "concise and quick" constraint. Specifically unresolved: does a Ubuntu lane exist at all; how many tiers; whether the machine-owned Test Catalog survives a "concise" bar; whether nightly exists; what "quick" means numerically.
- **Q25** — Repository Development Dispatch: roles, authority ceilings, worktree ownership, handoffs, receipts, and which development-agent tooling it maps onto.
- **Q26** — remaining legacy implementation/packaging/release/Git-doc dispositions (data half accepted).
- **Q27** — new repo visibility, license, and authority to reuse unlicensed private AI7 assets.
- **Q28** — AI7 branding and its stated relationship to Harness.
- **Q29** — what "full Harness capability" means; default capability exposure; editorial vs. developer profiles; self-modification authority.
- **Q30** — upstream consumption strategy (pinned packages vs. process boundary vs. fork).
- **Q31** — single execution authority statement.
- **Q33** — Python/legacy-runtime posture (data half accepted).
- **Q34** — Windows Standalone shell and professional editor topology.
- **Q35** — first tracer slice and its exit gate.

Also open but not numbered:
- Whether design work goes under git, and where the repository lives.
- Whether the Editing Sufficiency Gate has numeric thresholds or stays qualitative.
- Whether any mock fixture ships in the desktop package (`09-retained-development-workflows.md` line 66 flags this as open).

---

## K. Contradictions and ambiguities

| # | Item | Why it matters | Confidence |
|---|---|---|---|
| K1 | **Session header vs. reality.** The environment reports "Is a git repository: true / Current branch: HEAD / Status: (clean)". There is no `.git`. Any tooling that trusted that header was reading a phantom | Affects any assumption about version control | High |
| K2 | **Q16 was asked twice under the same number.** Q16a (source/generation/grounding boundary, five content classes) got *"mostly okay. But…"* `:1091`; Q16b (evidence hierarchy) got *"agree"* `:1185`. Codex recorded the whole thing as accepted. **The "mostly" was never itemized** — you flagged one correction, but it is not certain the other four content/evidence classes were endorsed | Could hide an unaccepted constraint inside ADR 0005 | High that the ambiguity exists; Medium on whether anything was actually mis-recorded |
| K3 | **"The ubuntu setup is just for github actions"** reads two ways: (a) *"I understand Ubuntu is only a CI runner"* — a confirmation, or (b) *"Ubuntu must be used only for GitHub Actions"* — a constraint. Combined with the next two sentences it most likely means (a) + a clarification that Ubuntu has no product role. It does **not** clearly say whether an Ubuntu CI lane should be kept | This is the first thing to resolve on Q24 | High |
| K4 | **"concise and quick" has no metric.** No time budget, no tier count, no lane count | Blocks a well-formed Q24 answer | High |
| K5 | **Q22's answer bundled two decisions.** *"Accept."* covered the dual-ledger boundary; the second sentence added an unrelated data-migration constraint. Codex correctly split them into ADR 0011 + ADR 0012, but ADR 0012 is a decision you initiated, not one you were asked | Just note the provenance; no conflict | High |
| K6 | **Q15's first reply didn't answer Q15.** At `:809` you redirected to Harness's purpose; Codex recorded that as an accepted purpose and re-asked Q15 at `:903`. Correct handling, but it means the DSH-purpose "acceptance" was your own volunteered statement, not an answer to a proposal | Low risk | High |
| K7 | **Legacy CI is disabled in `ai7-reborn-ai` (uncommitted)** while the new project's plan says "preserve the tiered GitHub Actions workflow." The legacy workflows are still readable as evidence, so nothing breaks — but "preserve" now means "preserve from a switched-off system" | Low | High |
| K8 | **`AGENTS.md` asserts things that are still proposals** — e.g. it states Harness is "AI7's Agent Behavior Framework" (accepted) alongside architecture framing that `02-target-architecture.md` marks unaccepted | Standing rules should not outrun accepted decisions | Medium |
| K9 | Codex twice referenced files that don't exist (`kick-in/03-keep-adapt-drop-matrix.md`, `kick-in/04-decision-map.md`, `kick-in/06-source-instruction-inheritance.md` at `:1499`, `:1711`) — post-compaction filename drift, self-corrected | None now | High |

---

## L. Current candidate architecture (not final)

Marked explicitly as a proposal in `kick-in/02-target-architecture.md` line 3.

**Three layers** (this part *is* accepted, `:747` + `:809`):

1. **Foundation Model** — replaceable general capability. No training, no weights owned.
2. **Harness Agent Behavior Layer** — context assembly, planning, tool selection, policies, workflows, subagents, sessions, replay, snapshots.
3. **AI7 Editorial Intelligence Layer** — professional knowledge, exact sources, rubrics, memory, authority, provenance, quality standards.

Codex's audit found Harness has **no general quality evaluator**; AI7 must own the semantic/editorial evaluation layer. Snapshots prove determinism, not good behavior.

**Candidate composition (unaccepted):** fresh AI7-owned repo → pin Harness packages at an exact SHA → add one AI7 bundle mounting Host-level domain singletons → AI7 agent presets with isolated tools and capability scope → AI7 client plugins → override generic rows only through documented configuration.

**Ownership split (accepted in substance via ADRs 0006/0007/0011):** AI7 owns Books, manuscripts, blocks/revisions, proposals, workflow state, Task Ledger, Effects, receipts, policy documents. Harness owns model turns, tool calls, agent lifecycle, session log. Joined by Execution Bindings and Harness Execution Spans; no transcript copying.

**V1 surface:** one Windows Standalone desktop app, new professional Chinese manuscript editor, one local AI7 application boundary. No Word.

**Rejected alternatives on record:** porting AI7 into Harness core (breaks plugin architecture); keeping the current AI7 app with Harness as a sidecar (dual runtime); merging git histories (private-history exposure).

---

## M. Immediate next task the conversation was working toward

**Confirmed (High).** Answer **Question 24/35 — the verification contract — as revised by your correction.** Codex presented the four-tier proposal at `:2156`, you replied at `:2173`, and the session hit its usage limit before anything was recorded.

The next action is therefore *not* "ask Q24" (as `PROGRESS.md` still says) and *not* "record Q24 as accepted". It is: **rework the Q24 proposal down to a windows-only, concise, quick contract, then put the revised version to you.**

Concretely, the reworked proposal has to settle:
1. Does a Ubuntu CI lane exist at all, or does required CI run only on Windows?
2. How many tiers survive "concise" — plausibly two (PR + release) rather than four.
3. Does the machine-owned Test Catalog survive, or is it over-engineering at this scale?
4. Does nightly exist, given there are no external contributors and no production Ubuntu?
5. What numeric budget makes a gate "quick"?

After Q24 the interview continues at Q25 (repository dispatch detail), then Q26–Q35, of which **none have been asked**. Eleven of thirty-five questions remain, and the design phase's own exit gate (`kick-in/04-migration-workflow.md` line 16) is "every item in the decision map is resolved or explicitly deferred."

---

## N. Confidence summary

| Conclusion | Confidence | Basis |
|---|---|---|
| Objective, product spine, and the 13 ADR decisions are correctly reconstructed | **High** | Each traces to a verbatim accept from you; ADR files exist and match |
| Q24 is open, not accepted | **High** | Your reply is a correction; the doc still says "proposed"; no file written after it |
| Windows-only target, Ubuntu has no production role | **High** | Explicit `:2173` |
| "Concise and quick" is a real constraint with no defined metric | **High** | Explicit, unquantified |
| Repository is design-only Markdown, not under git | **High** | Directly verified |
| Q23 Word-companion design was fully superseded, not merely narrowed | **High** | Doc deleted and rewritten; ADR 0013; Word context emptied |
| The Q16a "mostly okay" hides no additional unrecorded objection | **Medium** | Cannot be verified from the transcript; you named only one correction |
| Codex's Harness audit findings (no general evaluator, `0.1.0-rc.5` churn, MIT at pin, seam inventory) | **Medium** | Sound and internally consistent, but sourced from `gh api` reads I cannot re-verify — the harness is not cloned locally |
| Codex's original-AI7 audit findings (26k-line renderer, corpus byte-size leak, mock-only providers, three overlapping execution records) | **Medium-high** | The pin is present locally and re-verifiable; I have not independently re-run the audits |
| "English stable ID + Chinese product label" is what you meant by "create Chinese terms" | **Medium** | You asked for Chinese terms; the split is Codex's implementation choice you never objected to — and absence of objection is not acceptance |
| The candidate architecture reflects your intent | **Medium** | Consistent with everything you accepted, but explicitly never put to you as a question |
| Q27–Q35 content | **N/A** | Never discussed. No requirements should be inferred for these |

---

## What I did not do

- I did not answer, extend, or re-argue Q24.
- I did not edit any project file. This document is new, in `handoff20260817/`, outside the design room.
- I did not re-run Codex's source audits or re-read the pinned repos beyond confirming their identity.
- I did not infer requirements for unasked questions.
