# Kickoff prompt for a successor agent

Paste the block below. Replace the **Your task** line with one of the variants underneath, or write your own.

---

## The prompt

```text
You are picking up AI7: a Chinese-first Windows-and-macOS desktop editorial workbench
for professionals in leading literary publishing houses in mainland China, built
on DeepSeek Harness.

Repository: https://github.com/zhouy1017/ai7-harness  (private, branch `main`)

Read `HANDOFF.md` at the repository root before doing anything else. It is a
router and a trap list. Then read `AGENTS.md`, which is canonical and binding.
For recent history read `handoff20260817/SESSION-HANDOFF.md`.

State: the 36-question design interview is COMPLETE, but a later accepted
Windows-and-macOS target revision reopened Phase 0. The current exit review did
not pass. There are 27 ADRs, 37 numbered design notes, three domain contexts, and
two policy documents. There is NO CODE — no package.json, no dependencies, no CI
workflows. That is the expected state, not a gap to fill.

Your task: <TASK>

Boundaries that hold regardless of task:
- Do not begin implementation, scaffolding, or decomposition into issues unless
  I explicitly authorize it in this session.
- Do not put manuscript text, or any derivative including retrieval indexes and
  embeddings, into git. Sending manuscript text to a configured model provider
  IS permitted; that is the product's function.
- `AGENTS.md` and `docs/adr/` outrank every other document. If something else
  contradicts them, the contradiction is a defect to report, not a choice to make.
- Do not reopen an accepted decision silently. If you think one is wrong, say
  plainly that you are proposing a revision and why.
- Do not treat absence of objection as acceptance.

How I want you to work:
- One question at a time, and wait for my answer.
- Recommend rather than survey. If you are weighing options, tell me which one
  you would choose and why.
- Investigate rather than ask when the answer is discoverable in the repository,
  the predecessor repositories, or a package registry.
- State your confidence when it is not high, and say which claims you verified
  versus inferred.
- When I accept something, record it immediately across the standing rules, the
  affected design note, an ADR if it is hard to reverse, the glossary, the risk
  register, and PROGRESS.md — then validate links and terms before committing.
```

---

## Task variants

Pick one and substitute it for `<TASK>`.

**Resolve the next Phase 0 platform decision** — the recorded next step.

```text
Read kick-in/35-windows-macos-product-platform.md and
kick-in/36-phase-0-exit-review.md. Ask the owner one question at a time, beginning
with confirmation or revision of the proposed "consistent product outlook"
contract. Record each accepted answer across the standing rules, ADRs, design
notes, glossary where applicable, risk register, and PROGRESS.md. Do not
implement or decompose into issues.
```

**Store-and-index spike** — the first implementation step, once authorized.

```text
Design and run the store-and-index spike defined in
kick-in/34-first-tracer-slice.md. Generate Chinese corpora at 500K, 1M, and 10M
characters and measure find, jump, replace, cold open, retrieval index build and
re-index cost, and peak memory. The code is throwaway. Report whether the store
design and retrieval strategy hold, and propose the per-operation latency budgets
that kick-in/33 deliberately left unset.
```

**Audit the consumed Harness baseline** — required before bootstrap.

```text
Identify the candidate Harness package subset, then audit the exact rc.5-to-rc.6
delta and extension seams named in kick-in/30 and kick-in/36, including Session
persistence/reconstruction, replay, subagent continuation, tool guards, third-
party notices, and Electron/Node ABI. Do not add dependencies to the AI7 design
repository or change the accepted rc.6 pin. Two-platform installed-closure and
ABI proof may run only in separately authorized disposable audit environments;
without that authorization, report that proof as an explicit Phase 0 blocker.
DeepSeek Harness remains read-only reference evidence. rc.7 and rc.8 may be
evaluated only as evidence under ADR 0020.
```

**UI/UX session** — reserved by design.

```text
Design the AI7 Standalone interaction and interface. Read
kick-in/16-policy-documents-and-feedback-ux-handoff.md for the constraints
already recorded, kick-in/25 for the Standalone editing obligation, and
kick-in/33 for the topology and scale tiers you must design within. Architecture
has an accepted core but unresolved cross-platform mechanics; layout,
interaction, information architecture, and the renderer framework are yours,
subject to ADR 0027 and one consistent product outlook across both target systems.
```

**Fresh review** — an independent check on this work.

```text
Review the accepted design critically and independently. I want to know where it
is over-engineered, where a decision rests on an assumption nobody verified, and
where two accepted decisions will collide during implementation. Do not be
agreeable; the design was produced by an agent and I want a second opinion, not
a confirmation.
```
