---
status: accepted
---

# Admit the legacy `.doc` to the background test guests for J-01's `.doc` scenario

On 2026-09-19, hours after [ADR 0083](./0083-run-every-agent-s-electron-journeys-on-the-background-test-guests.md) landed, the Owner decided: 「DOC场景中允许doc文件进入客机」 — for the DOC scenario, the `.doc` file is allowed into the guests. The Owner's direction is this record's acceptance, as it was for ADR 0083.

ADR 0083 moved every agent's Electron Journeys to the background test guests and forbade copying any local-only SampleBook there. J-01's `doc-manuscript` scenario is the only coverage of legacy binary `.doc` intake, and no generator for the format exists, so under ADR 0083 every guest run disclosed that scenario as skipped and its coverage came to depend on an Owner-run J-01 on the development host. The Owner removes that gap for the one file the scenario needs.

## Decision

### 1. One file

Exactly one local-only SampleBook is admitted to a guest: `3天兽（定稿395870字)##＊.doc`, 1,173,504 bytes, SHA-256 `931d8035946f7689aaaa25c14c5822f46eedc59d23925081ded7b06618d9e4d2`, as [`SampleBooks/README.md`](../../SampleBooks/README.md) records it. The other four local-only files stay on the development host alone; the cases gated on them still skip on a guest and still run on the host, where those layers open no window.

### 2. Where it sits and how it gets there

The file sits outside the guest's checkout, at `C:\ai7\local-samplebooks\`, which the guest runner names in `AI7_LOCAL_SAMPLEBOOKS` so that the Journey runner and the gated tests find it exactly as they do on a developer's machine. It never sits in the guest's working tree: the guest cleans its checkout before every run.

A guest materializes the file from the repository history its clone already holds — it was a tracked file until S88 (#446), and [ADR 0079](./0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md) §5.1 left that history in place — and accepts it only when the byte count and the SHA-256 match. Nothing new travels from the host for it. Should that history ever be purged, the Owner's own copy is delivered instead and verified the same way. A guest cloned from an image that holds the file inherits it.

The guest self-check verifies, before every run, that the directory holds that file and nothing else; anything else there fails the gate.

### 3. What stays forbidden

No other manuscript goes to a guest, and no derivative of this one exists anywhere: no fixture, no cache export, no generated text carrying its content. Nothing of it enters a repository, a commit, a bundle, an Issue or a pull request. It is never transmitted to a model under any scope, a guest never calls a Provider, and there is still no hosted occurrence of it. The full-fidelity artifacts of an `e2e:debug` or `e2e:repeat` run of that scenario may render its content; they stay where ADR 0083 §3 already keeps them, in the guest's ignored `test-results/` and the runner's results directories outside every repository, and are cited by nobody.

A background test guest on the development host is a local test host: holding the file there is what ADR 0079 §5.2 calls local tests reading the local files, not a hosted occurrence and not a transmission.

### 4. What changes in ADR 0083

- **The attestation (§4).** The ladder line repeats every disclosed-skip marker the run printed. A guest that holds the file prints none for J-01; the trailing `disclosed skip: J-01 doc-manuscript-local-only-absent` of that section's example belongs only to a run on a guest without the file, which still discloses the skip rather than losing the scenario silently.
- **Legacy `.doc` changes (§5).** A change that touches legacy `.doc` intake no longer needs an Owner-run J-01 on the development host, and its pull request no longer waits in Draft for one, when its guest run executed J-01 without that marker.
- **Protected material (§5).** "No … manuscript … is ever copied there" now excepts this one file, placed as §2 says.

### 5. Clauses amended

| Owner | Clause | Now |
| --- | --- | --- |
| ADR 0083 §4 | "on a guest J-01's `doc-manuscript-local-only-absent` is always one of them" | Only on a guest without the file |
| ADR 0083 §5, Local-only SampleBooks | "No agent copies a local-only SampleBook … to a guest"; the Owner-run J-01 and the Draft wait for a change that touches legacy `.doc` intake | The one legacy `.doc` is admitted (§1–§2); the Owner-run J-01 and the Draft wait are withdrawn for a guest run that executed the scenario |
| ADR 0083 §5, Protected material | "No credential, `*.key.txt`, manuscript, private sample Book or derivative is ever copied there" | Excepts this one file |
| ADR 0083, Consequences and Rejected alternatives | The `.doc` scenario "loses its routine local run"; "Copy the local-only `.doc` to a guest … Rejected" | The scenario runs on every guest ladder; the alternative is adopted by this decision, by materializing from history rather than copying |
| ADR 0079 §5.1 | "keeps them as local-only test material in the untracked source directory" | A background test guest additionally holds the one legacy `.doc`, outside its checkout |
| [CI and test boundaries](../agents/ci-test-boundaries.md), Where the ladder runs | the local-only bullet, the "A run sends a guest only …" bullet and the example ladder line | Rewritten to this decision |
| [`SampleBooks/README.md`](../../SampleBooks/README.md) | where the local-only files live; "may be read by local tests alone" | Names the guests' copy of the `.doc` and reads a guest as a local test host |
| [E2E journeys](../development/e2e-journeys.md), J-01 | where the `.doc` scenario runs | Names the guests |

## Consequences

- Legacy `.doc` intake is covered by every guest ladder again, at no cost to the Owner's desktop. On 2026-09-19, at `dev@bf94f03` (PR #477), `ai7-testbed-02` ran J-01 with the file in place: pass in 128 s, with no disclosed-skip marker.
- A guest now holds one full manuscript outside its checkout. The self-check bounds that to exactly this file, and the guests still hold no credential and reach no Provider.
- If the file is ever missing from a guest, nothing fails silently: J-01 discloses the skip and the closure repeats it.

## Rejected alternatives

- **Admit all five local-only files.** Not what the Owner decided; the other four gate unit and service cases that already run on the development host without a window.
- **Put the file in the guest checkout's `SampleBooks/`.** Rejected: the guest cleans its checkout before every run, and the working tree stays free of manuscripts.
- **Copy it from the development host on every run.** Rejected: the guest's clone already holds the bytes, and a per-run copy would widen what a run sends for no gain.

This decision governs one test input on the repository-development test guests. It changes no AI7 product behaviour, Journey definition, Gate occurrence, repository admission, Provider Processing scope, credential, policy document, export, publication, release, or `main` authority.
