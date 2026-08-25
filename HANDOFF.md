# AI7 development handoff

Start with root [`AGENTS.md`](AGENTS.md), inspect the exact repository state as it directs, and then read current [`PROGRESS.md`](PROGRESS.md). Use this file afterward as the cold-start router and trap list when more orientation is needed. It is not an authority owner; the exact target commit and the documents linked below win.

## Current state

The design interview and V2 normalization are complete for the `dev` development baseline, with Issue #20 / PR #21 integrated at exact `dev@2e0018ce8ce586e4d15949b19c72569cba762bed`. The exact frozen provenance source is `design-doc@6895f02d2983865516d267809d8cdda77026f62c`, admitted only through the Issue #20 allowlist recorded in [`docs/development/design-baseline-allowlist.md`](docs/development/design-baseline-allowlist.md). It is not a branch to merge or an authority that outranks current `dev`.

Development work starts from and targets `dev`. `main` remains the protected stable/release-promotion line; advancing it requires another exact Owner authorization. This branch strategy is repository workflow, never AI7 product-domain language. See [development lines](docs/agents/development-lines.md) and [Git conventions](docs/agents/git-conventions.md).

The Owner-authorized sequence is now at implementation planning:

1. normalize the exact V2 baseline into `dev` — complete through Issue #20 / PR #21;
2. establish minimum versioned Provider Processing and External Export policy baselines — complete in the current [`docs/policies/` owner](docs/policies/README.md), with exact selection pins in [`active-policy-set.v1.json`](docs/policies/active-policy-set.v1.json);
3. create the implementation plan and full Change Brief, including the Supported Development Host matrix, exact Node/Electron compatibility, and one exact package-manager version — next after Commander integration of this policy unit; and
4. implement the bounded provider-free J-01 new-Book happy-path tracer — only after that plan and separate implementation dispatch.

No design document authorizes an adjacent step by itself. The active Provider Processing v1 baseline authorizes zero live transmissions. External Export v1 contains only one local-filesystem policy-eligibility rule and creates neither Effect Approval nor implementation authority. Provider/model calls, every export runtime path, and all network/cloud/email destinations remain blocked pending separate authority. Release, tag, publication, external distribution, and `dev`→`main` promotion are outside the current authorization.

## Read in this order

1. [`AGENTS.md`](AGENTS.md) — canonical standing rules, architecture, safety, and dispatch boundaries.
2. [`PROGRESS.md`](PROGRESS.md) — exact current checkpoint, next action, decisions, and Resume Prompt.
3. [`docs/agents/README.md`](docs/agents/README.md) — task-specific governance router.
4. [`CONTEXT-MAP.md`](CONTEXT-MAP.md) — domain ownership routes; follow the applicable context `CONTEXT.md` and use [`GLOSSARY.md`](GLOSSARY.md) only as the bilingual cross-context index.
5. [`docs/architecture-v2/README.md`](docs/architecture-v2/README.md) and [`docs/ui-ux-v2/README.md`](docs/ui-ux-v2/README.md) — accepted implementation-facing architecture and interaction baselines.
6. [`docs/adr/`](docs/adr/) — hard-to-reverse decisions, including root ADR 0041 and 0042 promoted from the frozen architecture package.
7. The current GitHub Issue and complete Change Brief before any task action.

Use [`kick-in/05-decision-map.md`](kick-in/05-decision-map.md) only to trace the 36-question decision history. Historical or excluded packages are evidence only when an active owner names an exact question; they are not cold-start routes.

## Current implementation tracer

The authorized first tracer is exactly:

> fresh checkout → public-synthetic DOCX → Review Before Import → atomic Book / primary Manuscript / initial Manuscript Revision / import records → bounded manuscript window → user-confirmed durable Edit Journal.

It traverses the production-shaped Electron renderer + thin Electron main + separate Node service + composed Harness/domain boundary through one root bootstrap/build/readiness/launch/E2E command surface. It makes no live model/provider call, uses no credential or private manuscript, and implements no export. It is one clean new-Book happy path, not complete J-01: restart, ambiguity, cancellation, existing-Book, source-only, reimport, retrieval/model, export, and other branches remain outside it unless separately authorized.

## Traps

- **Never merge or cherry-pick `design-doc` history wholesale.** Only the exact normalized allowlist is admitted; excluded V1 UI, architecture exploration, freeze/recovery records, archive material, prototypes/Figma artifacts, and unrelated kick-in history remain excluded or fixed-base-owned as the manifest states.
- **Do not treat the old grounded-Q&A tracer as current.** Its retrieval design remains useful, but the current tracer ends at a bounded manuscript window and confirmed durable Edit Journal.
- **Do not recreate old proof programmes.** Required verification is one logical provider-free E2E Functional Gate for complete supported journeys on Windows and macOS. Service-only/headless runs, request fingerprints, package probes, performance gates, formal review gates, and separate layer suites are not substitutes or standing gates.
- **Do not mistake a Harness event for AI7 business proof.** A Harness success, tool result, Session event, or watermark is never an AI7 Effect Receipt or business-completion record.
- **Do not expose manuscript material.** Private or real manuscripts and their derivatives never enter a repository, hosted CI, fixtures, logs, artifacts, or the shipped product. Public-synthetic DOCX material supplies repository evidence.
- **Do not grant provider or export authority by implication.** Reading local material, Run Authorization, configured credentials, Provider Processing Policy, External Export Policy, Effect Approval, and Public Release Permission remain separate. Active Provider Processing v1 has zero allow rules; the sole External Export v1 match is only policy eligibility for one exact local-file Effect, never approval, receipt, sending, delivery, publication, or permission for a network/cloud/email destination.
- **Do not depend on the `@deepseek-ai/dsh` CLI aggregate, version ranges, or mutable dist-tags.** The accepted subset baseline remains exact `0.1.0-rc.6`; implementation planning checks current immutable package metadata, pins every selected version and the lockfile, and maintains provenance, license review, sanitization, and third-party notices. `kick-in/01-source-provenance.md` is a dated fixed-base audit record whose old dist-tag observation is not current registry authority.
- **Do not fork the topology or Harness loop.** Electron main, isolated renderer with ProseMirror bounded windows, and the separate Node service are accepted. Harness owns the generic agent loop; AI7 owns business scheduling, domain state, capabilities, Effects, and receipts.
- **Do not use repository roles as product concepts.** Commander, Worker, and optional Reviewer govern repository development only.

## Repository roles

- **Commander:** decides dispatch and is the sole integrator and external-action authority.
- **Worker:** writes only its assigned branch/worktree and never merges, pushes, publishes, or performs external actions.
- **Reviewer:** optional, independent, read-only, and advisory; it creates no formal gate.

Every task follows Issue → complete Change Brief → Worker branch/worktree → pull request → Commander integration into `dev`. See [Repository Development Dispatch](kick-in/27-repository-development-dispatch.md).

## Next safe action

Commander reviews and integrates the exact Issue #22 policy-baseline branch into `dev`; the Worker performs no push, pull request, merge, release, or other external action. After integration, create the separately scoped implementation plan and complete Change Brief, then—and only then—implement the bounded provider-free tracer above. Any product/domain expansion, private material use, core-topology replacement, live provider call, export runtime, network/cloud/email destination, release action, or `main` promotion requires separate authority.
