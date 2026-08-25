# Single Execution Authority

Status: **accepted in Question 31 with owner revisions**

## What an agent loop is

The cycle that drives **one** model conversation: assemble context, call the model, parse the response, execute tool calls, append results, repeat until a stop condition. In Harness this is `dsh-agent-loop`. It owns turn and step structure, tool dispatch, transient in-turn retry, streaming, context compaction, subagent spawning, and Session event emission.

## Instances are not authorities

The prohibition on a "second agent loop" forbids AI7 writing **its own implementation** of that cycle to run alongside Harness's. It says nothing about how many run at once.

Ten Books being worked simultaneously means **ten Harness Sessions, each running its own instance of the same loop.** That is not two agent loops; it is many instances of one. Many browser tabs is not two browsers — two rendering engines drawing the same page is.

**Parallel work is required behavior, not a tolerated exception.** Multiple tasks across multiple Books at the same time, plus background analysis and learning work, are explicit product requirements.

## Why a genuine second implementation is prohibited

Four accepted decisions would break, which is the whole of the reason:

| Broken | How |
| --- | --- |
| ADR 0011 | Two places emitting what the model saw means the Harness Session Ledger stops being the authoritative execution record |
| ADR 0007 | Two retry semantics means ambiguous-outcome handling has two answers |
| ADR 0017 | Two tool-dispatch paths means the capability guard has a hole in one of them |
| Question 24 | The request-fingerprint guard covers one path, so replay evidence silently becomes partial |

## The division of authority

**AI7 schedules; Harness converses.** AI7 decides what work exists and when it runs. Harness decides how one unit of agent work executes.

| AI7 owns | Harness owns |
| --- | --- |
| Which Runs exist and their business state | How one agent conversation proceeds |
| Workflow Instances, phases, gates, signoff | Turn and step structure |
| Start, pause, resume, cancel, continuation | Tool dispatch and in-turn transient retry |
| Concurrency, queuing, usage observation, and optional per-Run ceiling enforcement | Subagents within a Run |
| Background jobs: indexing, analysis, metric computation, learning candidates | Session event emission |
| Effects, receipts, and Task Ledger records | Context assembly and compaction |

Most background work involves no model at all — indexing a DOCX, computing Delivery Quality Metrics, diffing revisions — so no agent loop is implicated and AI7 owns it outright. When background work does need a model, such as generating learning candidates, it runs as a Run through Harness like any other.

## Business scheduling stays in AI7

Harness ships `dsh-schedule`, `dsh-jobs-local`, and workflow packages. AI7's **business** scheduling does not use them.

AI7 owns Workflow Instances, Run Continuation Checkpoints, decisions, and Effects. Harness job machinery may drive technical attempts inside a Run. The risk register already records that Harness Workflow/Job/Goal limitations weaken durable business continuation, and under Question 30's subset rule AI7 most likely does not depend on those packages at all — which makes the boundary structural rather than conventional.

Two consequences follow directly from parallelism:

- **Instance concurrency, usage observation, and optional explicit Run Budget Ceiling enforcement are AI7's to own.** Each parallel Run carries its own exact ceiling state, which defaults to `unset`; Provider Account Limits are external service blockers rather than a shared AI7 capacity pool.
- **Parallel Runs on different Books must not share scratch or cache.** Question 29's per-Run scratch area already provides this; concurrency makes it load-bearing rather than theoretical.

## Learn the framework; do not clone the product

DeepSeek Harness is built primarily for **agentic coding**. AI7 works in specialized Chinese literary publishing. AI7 takes the agentic capability that makes the editorial job better — it does not adopt Harness's purpose, defaults, or product shape.

The distinction that matters in practice:

| Adopted | Not adopted |
| --- | --- |
| How agent behavior is composed: profiles, bundles, presets, plugins, context assembly, tool pipelines, policy seams, session and replay machinery | Harness's coding-agent purpose and product identity |
| The extension seams and their versioning discipline | Its default presets, prompts, and persona, which are tuned for software work |
| Deterministic replay and snapshot patterns | Its default tool set — shell, pwsh, terminal, generic filesystem and web |
| Session, turn, and event structure | Its web client and surface |

**Adopting a framework is not adopting its defaults.** Every Harness default that reaches an editorial Run must be justified for publishing work rather than inherited because it shipped. AI7's own Agent Behavior Assets — prompts, task guidance, presets — are authored for editorial work, not adapted from coding presets.

This is also why "full engine" in Question 29 means full **composition capability**, not the full package set. Question 30 already narrowed installation to the subset AI7 needs; this narrows behavior to what serves the editorial domain.

## Question 31 decision

Accepted with owner revisions:

- Harness owns the generic agent lifecycle and AI7 runs no second implementation of it;
- parallel Runs across multiple Books, plus background analysis and learning work, are required behavior, and many instances of one loop are not a second loop;
- AI7 owns business lifecycle, workflow state, continuation, concurrency, usage observation, optional explicit Run Budget Ceiling enforcement, and Effects, while Harness owns per-unit agent execution;
- AI7's business scheduling does not use Harness job, schedule, or workflow machinery; and
- AI7 learns the Harness framework rather than cloning it, adopting composition machinery while rejecting its coding-agent purpose, defaults, presets, and tool set.

See [ADR 0021](../docs/adr/0021-single-execution-authority.md).
