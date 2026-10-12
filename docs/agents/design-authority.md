# Design authority and action authorization

This runbook prevents candidate material, implementation reality, and action permission from being conflated.

## Resolve the line before the content

At task start record:

- exact `HEAD`;
- branch or detached state;
- intended integration target as an exact commit, not only a moving branch name;
- whether that target is canonical, candidate, or historical; and
- the exact owner authorization and, separately, any Commander dispatch/execution instruction for the requested class of action; and
- the assigned Issue, exact baseline or incoming PR head, and current writer recorded under [Orca dispatch](orca-dispatch.md).

During development, `dev` is the current integration and implementation-facing design line; `main` is the stable/release-promotion line. Frozen `design-doc@6895f02d2983865516d267809d8cdda77026f62c` is an allowlist source only. A file being visible, newer, longer, merged, review-clean, frozen, or internally labeled `accepted-candidate` does not promote it to an intended target.

Resolve a canonical record as `<intended-target-commit>:<path>`, using that tree or `git show <target-commit>:<path>`. If the path or accepted revision is absent there, label the current-worktree record `accepted-but-unintegrated`, `candidate`, or `historical` as applicable. It may inform a proposed change, but implementation targeting that line cannot treat it as its baseline until the owner accepts the exact change and the Commander integrates it. A scoped live owner decision may establish intent, but durable semantics still follow the recording rule below.

## Authority ladder

Use the first applicable owner of a fact; do not average conflicting documents.

1. **Scoped owner decision.** It may set or revise intent, but a durable semantic or architectural change must be recorded in its authority-owning ADR, Policy Document, context definition, or accepted specification before implementation relies on it.
2. **Repository operating rules.** Root `AGENTS.md` and the focused runbooks it makes binding govern how work is performed.
3. **Canonical decision owners.** Accepted root ADRs, Policy Documents, and canonical context definitions at the intended target commit own hard decisions, authority, and domain language. An ADR without frontmatter is not automatically non-accepted; use that target's decision index and explicit supersession.
4. **Accepted work specification.** The active Issue and supported journey own the bounded outcome after they agree with the canonical decision owners.
5. **Current implementation.** Code, schemas, and configuration show what exists and where the current seams are. They do not silently overrule accepted design; a contradiction is a finding to resolve.
6. **Current routers and background.** `PROGRESS.md`, the development plan, `kick-in/`, overviews, and review packets explain state and reasoning but do not own conflicting truth.
7. **Candidate/evidence material.** Design packages, prototypes, Figma, freeze handoffs, advisory reviews, and experiments are usable only with their status attached.
8. **Archive.** Historical artifacts are consulted only by exact reference when current authority cannot answer a blocking question.

Root `GLOSSARY.md` and `UBIQUITOUS_LANGUAGE.md` are reading aids. The canonical context `CONTEXT.md` owns a term definition.

## Conflict algorithm

1. Check scope, status, branch, and explicit supersession; never choose by recency or merge order.
2. Canonical beats candidate. A candidate must name every accepted decision it proposes to supersede.
3. Record the named clauses a decision replaces. Remove conflicting obsolete instructions from current reading paths under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md); Git retains their history. Unaffected obligations remain.
4. A current implementation/design contradiction does not authorize either preserving the defect or rewriting the system. Record the smallest conflict and stop for the applicable owner.
5. Two canonical records that conflict without an explicit relationship require an owner decision. Do not construct a compromise design.
6. A historical gap, retired proof task, or archived recommendation never reopens work by itself.

## Authority is not permission

Treat these as separate checks:

- **Design authority:** what result and constraint are accepted?
- **Action authorization:** may this task plan, research, copy, install, implement, mutate external state, integrate, or release?

Permission for one class does not imply another. In particular, accepted architecture does not authorize implementation planning; readable predecessor source does not authorize wholesale copying; configured provider processing does not grant external export or Public Release Permission; repository actions follow the assigned permissions in [Orca dispatch](orca-dispatch.md).

## Repository action authority

[Orca dispatch](orca-dispatch.md) is the single owner of Commander, Coding Worker and Reviewer permissions, model pairings, branch ownership, review and merge. Apply it after resolving the design baseline and the assigned Issue scope.

The Owner reserves expansion of product/design scope, Foundation Replacement, credential/material admission, release and promotion to main. Existing scoped authorization applies without repeated permission requests; necessary developer-live calls follow ADR 0089 and their current policy/binding constraints.

Repository role permissions never grant AI7 Public Release Permission, Editorial Signoff, Review Decision or permission to publish manuscript content. Product-domain authorities remain bound to their exact material and channel.

## Open-item classification

Classify an unresolved point before acting:

- **ordinary implementation detail:** choose the smallest option inside existing accepted seams after implementation authorization;
- **deferred:** do nothing until the recorded trigger occurs;
- **candidate assumption:** do not encode it before the candidate is accepted and integrated;
- **historical gap:** leave it historical unless a current task exposes the concrete problem;
- **material decision:** stop for the owner when product scope, domain meaning, authority, privacy/egress, credential handling, process topology, platform promise, or an accepted ADR would change.

Unknowns do not automatically create research, prototypes, audits, or validation programmes.

## Change Brief authority

Every Brief links its authority (plan slice, ADRs, contexts, predecessor Issues) instead of restating it; the form is the one-page [Change Brief](./change-brief.md). If those links cannot be named, the task is not ready for a Worker.
