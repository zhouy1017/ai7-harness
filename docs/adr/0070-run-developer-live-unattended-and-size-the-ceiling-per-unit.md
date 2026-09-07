---
status: accepted
---

# Run developer-live unattended, size the Run Budget Ceiling per unit, and pre-authorize a conversion dependency

On 2026-09-07, after attending `S40/smoke/1` — the first live Provider Run this product ever made, recorded in Issue #307 — the Owner made three decisions that the existing records do not admit. Two amend [ADR 0065](./0065-admit-a-developer-live-provider-processing-scope.md); the third relaxes the frozen-closure discipline of [ADR 0020](./0020-consume-pinned-harness-package-subset.md) and [ADR 0022](./0022-typescript-only-runtime.md) for one bounded purpose.

## Decision

### 1 · `developer-live` may run unattended, under Commander control

ADR 0065 defined the `developer-live` scope as **human-attended**. The Owner has authorized the Commander to make live Provider calls without a person watching, so that a diagnosis does not have to wait for one.

Attendance was standing in for three guarantees. Each is now carried by a mechanism that was not in place when ADR 0065 was written, and the guarantees do not weaken:

- **Nothing but admitted material is transmitted.** The transmittable-set check and the prepare-time lineage refusal enforce it in code; a service case asserts the refusal (#290, PR #298).
- **The Run is bounded.** A non-`unset` Run Budget Ceiling is required under v4 and enforced before every dispatch.
- **A call happens at most once.** Every live call is a named test item recorded in the Provider Test Ledger and replayed from the Result Cache; a repeated item is refused (ADR 0067).

What attendance also provided, and what now replaces it as an obligation on the Commander rather than a property of the system: **every live call answers a stated question**. A test item is named, its purpose recorded, and the reason it could not be answered from the cache is stated before it is transmitted. Usage is reported afterwards; payloads never are. Curiosity is not a question.

This changes nothing about who may authorize a Run inside the product, about `ordinary-production`, or about the E2E Gate, which stays provider-free.

### 2 · The Run Budget Ceiling default is computed per unit

ADR 0065's default of 500,000 total tokens was set with no measurement behind it. `S40/smoke/1` produced the first: **8 units, 12,565 input and 101,202 output, 113,767 total**, with per-unit output ranging 4,374 to 24,225.

A flat default is wrong in both directions — generous for a short book, and capped by a short book's average for a long one. The default becomes **30,000 tokens multiplied by the frozen unit count of the Coverage Manifest**.

The multiplier is derived from the measurement rather than chosen: the largest observed unit consumed about 26,100 tokens (24,225 output plus 1,880 input), so 30,000 clears the observed maximum with margin. For `sample1`'s eight units that yields 240,000, about 2.1× what the Run actually used. It is one Run, on one book, with one model; the number is a starting point to be revisited as more Runs are measured, and the explicit `--run-budget-ceiling` argument overrides it as before.

**Recorded with it, because it is the trap in the measurement:** this model reports reasoning tokens inside its output count. Unit 1 produced 56,166 characters of reasoning against 12,795 of answer. Anyone reasoning about a ceiling as though output tokens were result size will be wrong by roughly four times for this model, and differently wrong for a model that reports reasoning separately or not at all.

### 3 · A conversion dependency is pre-authorized, narrowly

Multi-format manuscript intake (#313) needs to convert `.doc`, PDF, and other source formats into a DOCX working representation, and the bootstrap is a frozen closure. The Owner pre-authorizes adding a dependency for that purpose **provided it is pure JavaScript or WebAssembly and permissively licensed**, with the choice, its size, and its licence reported in the pull request that adds it.

This authorizes nothing else. It does not admit a native addon, a copyleft licence, a dependency for any other purpose, or a network-dependent conversion service. Import stays local and provider-free under V2-UX-IMP-001. Every other clause of the closure discipline continues.

## Consequences

- A live Run can now happen inside an ordinary working session, so the cost of *not* checking something against a real model falls. The discipline that keeps that from becoming waste is the named test item and its stated question, which is a Commander obligation and therefore visible in receipts rather than enforced by the machine.
- The ceiling default now depends on the Coverage Manifest, so it is computed after the manifest is frozen and before the plan is. A Run whose manifest is not yet frozen has no computed default and must carry an explicit ceiling.
- ADR 0065's "human-attended" wording no longer describes the scope. It is amended here rather than rewritten there; ADR 0065 stands as the record of what was decided when the scope was created.

## Rejected alternatives

- **Keep attendance and accept the latency.** Rejected by the Owner: the guarantees attendance stood for are now enforced in code, and waiting for a person to watch a diagnosis is a cost with no remaining benefit.
- **Keep the flat 500,000 and only record the measurement.** Rejected: it would leave a number nobody derived, next to a measurement that shows how to derive one.
- **Size the ceiling from the average unit.** Rejected: the observed spread is 5.5×, so an average-sized ceiling fails on the long units — which are the units most worth completing.
- **A blanket dependency authorization.** Rejected: the authorization is for conversion, in pure JavaScript or WebAssembly, permissively licensed, reported when used. Anything wider would retire the closure discipline rather than bound an exception to it.

This decision governs repository development and the `developer-live` scope only. It changes no product Model Role, no Provider Resolution Plan authority, no Effect, no export, publication, release, or `main` authority, and the E2E Functional Gate remains provider-free.
