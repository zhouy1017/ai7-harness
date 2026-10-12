# AI7 Harness Project

`AGENTS.md` is the mandatory entry point. Root `CLAUDE.md` is exactly `@AGENTS.md`. Each rule has one linked owner; update this router only when routing changes.

## Lines and design truth

- `dev` is the implementation-facing integration baseline; `main` advances only through separate exact Owner promotion authorization. Wave and slice branches follow [development lines](docs/agents/development-lines.md).
- Accepted ADRs, Policy Documents and context definitions own design decisions. Frozen references change only through an ADR naming the affected clauses. [Design authority](docs/agents/design-authority.md) resolves status and conflicts at the intended target.
- Implementation status lives in [PROGRESS](PROGRESS.md) and [E2E journeys](docs/development/e2e-journeys.md); delivery order lives in the [development plan](docs/development/development-plan.md).

## Protected material

Never place a manuscript or derivative in a repository, worktree, hosted CI input, log, artifact, fixture, corpus or distribution. The admitted exceptions are the Owner-designated Public SampleBooks under exact root `SampleBooks/` ([ADR 0043](docs/adr/0043-allow-public-samplebooks-in-repository-and-ci.md)) and exact `sample1`'s reviewed-fixture path ([ADR 0044](docs/adr/0044-use-sample1-as-compatibility-and-recording-baseline.md)). Development tests transmit only admitted Public SampleBooks, including a tester's edits of `sample1`; another manuscript pasted into it remains protected. Ordinary production handles the editor's own manuscripts under its applicable policy ([ADR 0088](docs/adr/0088-carry-the-editorial-dialogue-under-developer-live.md)).

Never read, print, copy or commit secret values. The untracked development credential file at the main checkout root (`*.key.txt`) is read only by the enrollment helper. Necessary autonomous development calls and development-result reuse follow [ADR 0089](docs/adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md) and [ADR 0067](docs/adr/0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md); current execution still requires the active policy and admitted binding. Ordinary CI and the Gate stay provider-free. Read only the implicated sections of [project constraints](docs/agents/project-constraints.md).

## Session entry

1. Record exact `HEAD`, branch or detached state, worktree and intended target.
2. For repository work, read [Orca dispatch](docs/agents/orca-dispatch.md), the assigned Issue and its recorded baseline. The Commander also reads PROGRESS, the development plan and the [Dispatch Register](docs/agents/dispatch-register.md). Verify the assigned role, actual workspace and current writer before editing.
3. Load only relevant rows from the [agent document router](docs/agents/README.md).
4. Exclude `docs/archive/` from ordinary reading; retrieve superseded rules from Git only for a named historical question.

## Development

- [Orca dispatch](docs/agents/orca-dispatch.md) is the sole owner of repository roles, model pairings, wave dispatch, writer handoff, slice review/merge and final dev integration under [ADR 0089](docs/adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md). Its bootstrap clause covers this documentation transition.
- Follow [incremental development](docs/agents/incremental-development.md): one bounded outcome and existing owners before new ones; return an insufficient brief to the Commander.
- Verification follows [CI and test boundaries](docs/agents/ci-test-boundaries.md). Every agent-run Electron Journey and its attested ladder runs on a background test guest through the host runner ([ADR 0083](docs/adr/0083-run-every-agent-s-electron-journeys-on-the-background-test-guests.md)). Keep the existing provider-free Gate; create no additional hosted gate. Do not query or consider Actions usage ([ADR 0058](docs/adr/0058-remove-actions-usage-observation-from-development-gating.md)).
- Git: [conventions](docs/agents/git-conventions.md). Issues: [tracker rules](docs/agents/issue-tracker.md) and [Change Brief](docs/agents/change-brief.md). Documents: [lifecycle](docs/agents/document-lifecycle.md).
- Domain work starts at [CONTEXT-MAP](CONTEXT-MAP.md); GLOSSARY is a bilingual index, not a definition owner ([domain rules](docs/agents/domain.md)).
