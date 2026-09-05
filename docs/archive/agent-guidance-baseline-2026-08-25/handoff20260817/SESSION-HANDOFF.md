# Session handoff — 2026-08-17

What this session did, for a successor who needs recent history rather than end state. For end state read `HANDOFF.md`; for the whole design read `PROJECT-OVERVIEW.md`.

---

## How the session started

Codex ran the design interview through Question 23 and then hit its usage limit mid-question, leaving no curated handoff. The raw transcript was exported to `raw-conversation.md` and this session began by reconstructing project state from it under a strict authority order — owner statements are authoritative, later supersedes earlier, an agent recommendation is only a proposal unless explicitly accepted, and absence of objection is never acceptance.

That reconstruction is `STATE-RECONSTRUCTION.md`. Its most consequential finding: **Question 24 had been asked and answered with a correction, not an acceptance**, and the correction was never recorded because the session died first. The repository's own checkpoint still said "Ask Question 24".

## What the session produced

| | |
| --- | --- |
| Questions closed | 24, 25, 26, 27, 28, 29, 30, 31, 33, 34, 35, and a newly opened 36 |
| Interview | Complete — all 36 resolved or explicitly deferred |
| ADRs added | 0014 through 0026 |
| Repository | Initialized and published as private `zhouy1017/ai7-harness` |

The repository did not exist as a git repository when the session began. It was initialized, published, and every subsequent decision committed individually with its rationale.

## Owner decisions that overrode recommendations

Recorded as overrides rather than smoothed into agreement, because a successor should see where the owner's judgment differed:

| Recommendation | Owner decision |
| --- | --- |
| Data root outside the app folder, to avoid cloud-sync exposure | **Inside** the AI7 folder; keep sync detection as a warning |
| Composition frozen at build time | Everything **proposable** by agents, including plugins and tools; only activation is tiered |
| Commander at `high` effort, since `ultra` spawns internal subagents that overlap external dispatch | Commander at **top capability** |
| Portable as the only V1 channel | **Both** zip portable and NSIS installer |

## Corrections the agent made to its own earlier work

Stated plainly because each one was wrong in the record for a period:

- **Manuscript processing boundary.** Recorded that sending manuscripts to a cloud model needed separate authorization. The owner corrected this: it is the basic feature of AI7. The constraint governs persistence and publication, not processing.
- **Term collision.** Named the Q29 security profile `Editorial Profile`, colliding with the accepted Q9 term for dimension defaults. The repository's own validator caught it; renamed to `Editorial Capability Profile`.
- **Registry misreading.** `npm view <pkg> version` returns the `latest` dist-tag rather than the highest version, which briefly produced a false conclusion that the Harness package set was version-incoherent. Caught before it reached a decision.
- **Over-unified retrieval model.** Recorded that the Manuscript Block "does three jobs" and treated that as evidence it was the right primitive. The owner corrected it; replaced by *one authority, many projections*.

## Verification findings worth keeping

Established by checking rather than assuming:

- The audited Harness pin `0.1.0-rc.5` **was never published to npm**. The consumed baseline is `0.1.0-rc.6`; the audited commit is provenance only.
- `latest` points at `0.0.1-rc.1` on nearly every `@deepseek-ai/dsh-*` package while `next` is `0.1.0-rc.6`. Ranges are a live hazard.
- Upstream has **zero git tags and zero GitHub releases**. There is no release channel to track.
- Electron 43.4.0 bundles **Node 24.18.1**, satisfying the Harness engines constraint directly.
- The legacy Python carried **zero third-party dependencies** and handled DOCX with stdlib zip and XML. Nothing required it.
- Landlock native addons are **Linux-only**, so the Windows sandbox path under the Agent Data Root is unverified.

## Open threads a successor should not lose

1. **Phase 0 exit review has not been run.** Its gate is that every decision-map row is resolved or explicitly deferred.
2. **Decomposition into issues is not authorized.** The owner said "no decomposing yet".
3. **Windows sandbox enforcement is unverified.** Do not describe the Agent Data Root boundary as *enforced* until someone checks.
4. **Question 16 scope was never itemized.** The answer was "mostly okay" with one correction; whether the other four content and evidence classes were endorsed is unconfirmed, and ADR 0005 treats them as accepted.
5. **`handoff20260817/` may be scratch or permanent.** It currently holds the raw transcript, the reconstruction, the overview, this file, and the kickoff prompt. The owner has not said which of these should live somewhere more durable.

## Working style that produced this

Recorded because it shaped the output and a successor may want to continue it: one question at a time, with a recommendation rather than a survey; investigation of code and registries rather than asking the owner what could be checked; explicit confidence levels where confidence was not high; and every acceptance recorded immediately across the standing rules, the affected design note, an ADR where the decision was hard to reverse, the glossary, the risk register, and the checkpoint — followed by a link, term-index, and duplicate-owner validation pass before each commit.
