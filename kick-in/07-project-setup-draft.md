# Canonical Project Setup Draft

Status: **approved in Question 5 and applied to the canonical project files**

## Files to create after approval

- `AGENTS.md` — canonical shared project instructions.
- `CLAUDE.md` — exactly `@AGENTS.md`, for thin-wrapper compatibility.
- `docs/agents/issue-tracker.md` — GitHub issue workflow; PRs are not a request surface.
- `docs/agents/triage-labels.md` — the five accepted label mappings.
- `docs/agents/domain.md` — multi-context consumption rules.
- `CONTEXT-MAP.md` — canonical context routing.
- `GLOSSARY.md` — maintained reference index and collision guide; it does not duplicate definitions.

Per-context `CONTEXT.md` files and ADR folders will be created lazily as terms and decisions are actually resolved.

## Proposed `AGENTS.md` foundation

```markdown
# AI7 Harness Project

## Project phase

This repository is in architecture and migration design. Read `kick-in/README.md` and the current `PROGRESS.md` before acting. Do not add product implementation, copy source from either input repository, vendor Harness, initialize or publish a remote, or merge histories until the relevant accepted decision explicitly authorizes it.

## Checkpointing

At session start, read `PROGRESS.md` if it exists. After each sub-task, update it with what is done, what is next, key decisions, and a one-sentence Resume Prompt.

## Project instructions

`AGENTS.md` is the canonical shared instruction file. If Claude compatibility is required, keep root `CLAUDE.md` as the single line `@AGENTS.md`; put shared context here, not in `CLAUDE.md`.

## Agent skills

### Issue tracker

GitHub Issues is the canonical work-item tracker. Pull requests are implementation/review artifacts and are not an incoming triage surface at this stage. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five canonical labels without aliases: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a multi-context project. Start from `CONTEXT-MAP.md`, follow the relevant context `CONTEXT.md`, use `GLOSSARY.md` only as a cross-context reference index, and read applicable ADRs. See `docs/agents/domain.md`.
```

## Proposed `docs/agents/issue-tracker.md`

```markdown
# Issue tracker: GitHub

Issues and PRDs for this repository live as GitHub Issues. Use authenticated GitHub tooling and resolve the target from the configured repository remote once it exists. Before a remote exists, do not publish planning work elsewhere implicitly.

## Conventions

- Create, read, list, comment on, label, and close work through GitHub Issues.
- Use `--body-file` for multiline issue bodies so commands remain shell-safe.
- Fetch labels and comments when a skill needs the full ticket state.
- A request to “publish to the issue tracker” means create a GitHub issue.
- A request to “fetch the relevant ticket” means read the GitHub issue and its comments/labels.

## Pull requests as a triage surface

PRs as a request surface: **no**.

There are no external contributors at this stage. Pull requests represent implementation and review, not incoming feature requests. GitHub shares numbering between issues and pull requests, so resolve an ambiguous `#N` before acting.
```

## Proposed `docs/agents/triage-labels.md`

```markdown
# Triage Labels

| Canonical role | Repository label | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Maintainer needs to evaluate the issue |
| `needs-info` | `needs-info` | Waiting on the reporter for information |
| `ready-for-agent` | `ready-for-agent` | Fully specified and ready for an AFK agent |
| `ready-for-human` | `ready-for-human` | Requires human action or implementation |
| `wontfix` | `wontfix` | Will not be actioned |

When a skill names a canonical triage role, apply the corresponding repository label exactly.
```

## Proposed domain-document layout

```text
/
├── CONTEXT-MAP.md
├── GLOSSARY.md
├── docs/
│   ├── adr/                                  # system-wide accepted decisions
│   ├── agents/domain.md
│   └── domain/
│       ├── editorial/CONTEXT.md              # created lazily
│       ├── execution/CONTEXT.md              # created lazily
│       └── word-integration/CONTEXT.md        # created lazily
└── kick-in/                                  # migration design workspace
```

`CONTEXT-MAP.md` will route readers to three initial contexts:

- **AI7 Editorial** — Book, manuscript, source, revision, proposal, and publication language.
- **AI7 Execution** — Task Intent, Task Skill, Task Ledger, Run, authority, Effect, command, continuation, and exact Harness binding language.
- **Deferred Word Integration** — intentionally empty contingency context because V1 is Standalone-only; promote terms only after a future decision adds Word.

`GLOSSARY.md` will contain links and collision warnings such as AI7 Task Skill versus Harness Skill. Canonical definitions live only in the relevant `CONTEXT.md`; the reference glossary must not restate them.

## Proposed `docs/agents/domain.md` rules

```markdown
# Domain Docs

Before exploring domain behavior, read root `CONTEXT-MAP.md`, the relevant context `CONTEXT.md`, root `GLOSSARY.md` for cross-context navigation/collision warnings, and applicable system-wide or context-specific ADRs.

This repository uses a multi-context layout under `docs/domain/`. Canonical term definitions live in context `CONTEXT.md` files. `GLOSSARY.md` is a maintained reference index only and must link to definitions rather than duplicate them.

Use canonical vocabulary in issues, tests, designs, and code. When AI7 and Harness use the same word differently, qualify the term and preserve both definitions instead of silently choosing one. If an output contradicts an accepted ADR, surface the conflict explicitly.

Create context files and ADR directories lazily. `kick-in/` contains migration design material; it is not a substitute for accepted ADRs or canonical glossary definitions.
```
