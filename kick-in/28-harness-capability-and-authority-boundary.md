# Harness Capability and Authority Boundary

Status: **accepted in Question 29 with owner revisions**

## The framing that resolves the tension

"Full Harness capability" and least privilege appear to conflict only if the **engine** is conflated with the **tool surface**. They are separable, and AI7 takes both:

AI7 composes the complete Harness behavior engine — planning, context assembly, tool pipeline, subagents, workflows, sessions, replay, snapshots. What an editorial Run never receives is the generic coding-agent **tool surface**: shell, roaming filesystem, arbitrary network.

The editor gets all of the sophistication and none of the raw computer access. This satisfies both the owner's original request for full Harness capability and the Critical risk-register entry about exposing shell, filesystem, and network powers to unpublished editorial material.

## Governing user story

The intended user is a literature professional, not a computer expert. They have limited background in agentic tools and language models, and AI7's purpose is to wrap agentic work into their text-editing workflow.

The design consequence is direct: **a user who cannot assess whether an action is safe must never be asked to authorize it.** Capability decisions belong to AI7's composition, not to a runtime prompt delegating expert judgment to someone without the basis to exercise it. Every capability an editor sees is expressed in editorial terms — read a source revision, retrieve passages, propose a manuscript change, gather verification evidence, draft a deliverable — never in terms of processes, paths, or endpoints.

## Part 1 — Capability exposure

No generic tools. Only domain-shaped AI7 Capabilities, which may use filesystem or network substrates internally without exposing them.

This is not "no filesystem and no network":

- Editors import DOCX and export deliverables, so file access exists as a **bounded import/export capability** over a user-chosen file or destination.
- Factual Verification accepts authorized external research with immutable source snapshots, so network access exists as a **research capability with recorded provenance**, never raw fetch.

Enforcement follows the existing ADR 0010 rule: the same activation is enforced at both the Harness tool guard and the AI7 capability/service facade.

### User file access and agent file access are different questions

Users have complete access to their own material without the agent gaining roam rights.

- **AI7 owns storage location; the user owns content.** Editors work with Books, sources, and deliverables, never paths. Import is a file picker; export is a destination choice. No directory literacy is required at any point.
- **Retrievability is a guarantee, not a feature.** Every imported source and every generated deliverable stays reachable and exportable. "You do not need to understand the filesystem" must never degrade into "your work is trapped in an opaque store." Revealing a file's location is a user action, not an agent capability.

### Agent Data Root

AI7 owns a data root, and the agent holds genuine filesystem permission inside it: read, write, create, organize. Outside it there is nothing — no user Documents, no Desktop, no system paths, no other applications' data.

Two **nested** boundaries are required, because one is not sufficient:

| Boundary | Enforced by | Catches |
| --- | --- | --- |
| **Agent Data Root** | OS sandbox and tool guard | Escape from AI7 entirely; the backstop for implementation bugs |
| **Run Source Scope** | AI7 capability and service facade | Reading Book B during a Book A task; the semantic guarantee |

A data root holds every Book. Raw filesystem access across it would let a Run scoped to one Book read another's manuscript directly, silently regressing ADR 0002's rule that no task searches or mutates every available Book. The OS sandbox alone would satisfy the letter of the data-root decision while breaking the scope model.

Inside the root, a **per-Run scratch area** is unscoped: the agent writes temporary and intermediate files there freely, without touching governed Book material.

Three constraints on the root:

1. **The Protected Secret Store is not inside it.** Credentials stay in the OS-protected store behind the Credential Broker, never in a directory the agent can read.
2. **The data root lives outside any repository working tree.** Otherwise a `.gitignore` is the only thing standing between real manuscripts and a commit, and ADR 0016 requires that manuscripts never enter any repository, private included. Making it structurally impossible is stronger than making it forbidden.
3. **Import copies in; export copies out.** The user selects the file or destination. The agent never crosses the edge on its own initiative.

## Part 2 — Profiles

| Profile | Shipped | Surface |
| --- | --- | --- |
| **Editorial Capability Profile** | Yes — what every user gets | Domain capabilities only |
| **Developer Capability Profile** | Never to editors | Full generic tool surface; what Repository Development Dispatch workers run under |

**A user cannot escalate themselves into the Developer Capability Profile.** It is a build and repository artifact, not a settings toggle. A self-service escalation path would hand exactly the expert judgment to exactly the person the user story says does not have it.

A middle "power user" profile is **deferred**. It has no demonstrated demand and recreates the judgment burden. Trigger: a named workflow that genuinely requires it.

## Part 3 — Self-modification

AI7 may improve its own agent behavior from production data and user feedback. This is Agent Behavior Improvement, the loop whose purpose was accepted at Question 15 and which had no mechanism until now. It is not Model Training, so ADR 0003 is untouched, and it is not Editorial Learning, which governs what the house's editorial preferences are.

### The line

> **A prompt may shape quality. A prompt may never grant authority.**
> If changing a piece of text could widen what the system is permitted to do, it is a Policy Document, not a prompt.

### Everything is proposable; activation is tiered

The boundary is not *what may change* but *what may activate without a human*.

| Layer | Contents | Agent may propose | Activation |
| --- | --- | --- | --- |
| **Agent Behavior Assets** | Prompts, instructional text, task guidance, ranking and retrieval parameters within declared bounds | Yes | Auto-activation permitted only for non-expansive calibration inside a user-approved envelope; any change of meaning waits for review |
| **Policy Documents** | What the system is permitted to do | Yes | Developer review, always — ADR 0004's existing rule |
| **Composition** | Plugins, tools, capability wiring, profile definitions | Yes | Developer review, and it ships in a **release**; it never activates in the field |

What never happens is a **capability expansion activating itself**. Everything else may be proposed by an agent that believes it can do better.

### Hidden is fine; silent is not

Editorial users never need to see prompt diffs, and these assets are hidden from them by default. Every revision is nonetheless recorded with immutable version history, lineage back to the production evidence that motivated it, a readable diff, and rollback. Changes are reviewed in the developer track, which is the same audience separation as the profile split in Part 2.

"Silent" in the charter's prohibition means unrecorded and ungoverned, not invisible to editors.

### Improvement requires a measure

The pinned Harness audit found no general quality evaluator, so AI7 owns that layer. Without an evaluation gate, a behavior revision claiming improvement is unfalsifiable and indistinguishable from drift.

The gate is two-sided: deterministic **replay** against the fixed scenario corpus proves no regression on known cases, and **production metrics** show real-world improvement. Neither is sufficient alone — replay cannot see taste, and production evidence cannot isolate cause. The metric system itself is Question 36.

## Question 29 decision

Accepted with owner revisions:

- full Harness engine, narrow tool surface: no generic shell, roaming filesystem, or arbitrary network in an editorial Run;
- domain-shaped capabilities only, with bounded import/export and provenance-bearing research;
- users reach all their own material without filesystem literacy, and retrievability is guaranteed;
- an Agent Data Root gives the agent real filesystem permission inside it and nothing outside, with Run Source Scope nested inside as the semantic boundary;
- two capability profiles, Editorial and Developer, with no self-service escalation and a middle profile deferred; and
- everything is proposable by agents while capability expansion never self-activates, with all revisions recorded and developer-reviewed.

See [ADR 0017](../docs/adr/0017-full-engine-narrow-tool-surface.md) and [ADR 0018](../docs/adr/0018-tiered-activation-for-agent-authored-revisions.md).
