---
status: accepted
---

# Admit the legacy `.doc` to the background test guests for J-01's `.doc` scenario

On 2026-09-19, minutes after [ADR 0083](./0083-run-every-agent-s-electron-journeys-on-the-background-test-guests.md) landed (#477), the Owner decided: 「DOC场景中允许doc文件进入客机」 — for the DOC scenario, the `.doc` file is allowed into the guests. The Owner's direction is this record's acceptance, as it was for ADR 0083.

ADR 0083 moved every agent's Electron Journeys to the background test guests and forbade copying any local-only SampleBook there. J-01's `doc-manuscript` scenario is the only Journey coverage of legacy binary `.doc` intake, and no generator for the format exists, so under ADR 0083 every guest run disclosed that scenario as skipped and its end-to-end coverage came to depend on an Owner-run J-01 on the development host. The Owner removes that gap for the one file the scenario needs.

## Decision

### 1. One file

Exactly one local-only SampleBook is admitted to a guest: `3天兽（定稿395870字)##＊.doc`, 1,173,504 bytes, SHA-256 `931d8035946f7689aaaa25c14c5822f46eedc59d23925081ded7b06618d9e4d2`, as [`SampleBooks/README.md`](../../SampleBooks/README.md) records it. The other four local-only files are never materialized on a guest; the one case gated on one of them still skips there and runs only where the Owner keeps those files.

### 2. Where it sits and who places it

The file sits outside the guest's checkout, at `C:\ai7\local-samplebooks\`, which the guest runner names in `AI7_LOCAL_SAMPLEBOOKS` for every layer, so that J-01 and the `.doc`-gated unit and service cases find it exactly as they do on a developer's machine. It never sits in the guest's working tree: the guest cleans its checkout before every run.

Placing, restoring or removing the file is part of provisioning a guest, and so an Owner action like every other change to a guest (ADR 0083 §2): it is done by the Owner, or on the Owner's word given in that session, with the provisioning script kept beside the runner. That script materializes the file on the guest from the repository history the guest's clone already holds — it was a tracked file until S88 (#446), and [ADR 0079](./0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md) §5.1 left that history in place — and accepts it only when the byte count and the SHA-256 match, so nothing new travels from the host for it. Should that history ever be purged, the Owner delivers the Owner's own copy instead, verified the same way. A guest cloned from an image that holds the file inherits it. Both guests were provisioned this way on 2026-09-19, on the Owner's direction.

An agent that runs a ladder never places, copies or repairs the file: when a run shows it missing, the agent reports that (§4) and changes nothing on the guest.

When the directory exists, the guest self-check verifies before every run that it holds that file — same byte count and SHA-256 — and nothing else, and blocks the run otherwise. A guest with no such directory passes the self-check, and J-01 discloses the skip.

### 3. What stays forbidden

- **No other manuscript, and no extraction.** No other manuscript is placed on a guest. No agent extracts any of the five local-only files from repository history, on a guest or on the host: the Owner's decision admits this one file to a guest, and the presence of that history admits nothing.
- **No new copy in Git or the tracker.** Beyond the history objects ADR 0079 §5.1 left in place — which every clone and every runner bundle of a head has always carried — nothing of the file enters a repository, a commit, an Issue or a pull request.
- **No derivative in a repository.** No fixture, no cache export and no generated text carrying its content. A run's converted working representation lives in the disposable external test data root and is deleted with it.
- **No model, no Provider, no hosted occurrence.** The file is never transmitted to a model under any scope, a guest never calls a Provider, and there is still no hosted occurrence of it.
- **Debug artifacts are not opened.** The full-fidelity artifacts of an `e2e:debug` or `e2e:repeat` run may render the file's content when the failing stage belongs to the `doc-manuscript` scenario. They stay where ADR 0083 §3 and §7 keep them, in the guest's ignored `test-results/` and the runner's results directories outside every repository. Reading one would carry that content into the agent's own model, so no agent opens, quotes or uploads an artifact of a failing `doc-manuscript` stage: it reports the stage marker the runner printed and tells the Owner.

For this one file a background test guest on the development host counts as a local test host: holding it there is what ADR 0079 §5.2 calls local tests reading the local files, not a hosted occurrence and not a transmission.

### 4. What changes in ADR 0083

- **The attestation (§4).** The ladder line repeats every disclosed-skip marker the run printed. A guest that holds the file prints none for J-01; the trailing `disclosed skip: J-01 doc-manuscript-local-only-absent` of that section's example belongs only to a run on a guest without the file, which still discloses the skip rather than losing the scenario silently.
- **Legacy `.doc` changes (§5).** A change that touches legacy `.doc` intake is covered by its guest ladder when the attested `e2e:all` printed no `doc-manuscript-local-only-absent` marker; the Owner-run J-01 on the development host and the Draft wait are then withdrawn. When the marker was printed they stand: the agent uses the other guest or tells the Owner, and the pull request stays Draft until the closure records a guest `e2e:all` without the marker or an Owner-run J-01. `e2e:all` prints the marker as `LOCAL_COMPLETION/J-01/disclosed-skip/…` and a single-Journey layer as `DISCLOSED_SKIP/J-01/…`; `e2e:debug` and `e2e:repeat` print no disclosure and are never evidence that the scenario ran.
- **Protected material (§5).** "No … manuscript … is ever copied there" now excepts this one file, placed as §2 says and by nobody else.

### 5. Clauses amended

| Owner | Clause | Now |
| --- | --- | --- |
| ADR 0083 §4 | "on a guest J-01's `doc-manuscript-local-only-absent` is always one of them" | Only on a guest without the file |
| ADR 0083 §5, Local-only SampleBooks | "No agent copies a local-only SampleBook … to a guest"; the Owner-run J-01 and the Draft wait for a change that touches legacy `.doc` intake | Still binds every agent and every file; the one legacy `.doc` is placed on a guest as an Owner action (§1–§2); the Owner-run J-01 and the Draft wait are withdrawn only for an attested `e2e:all` that printed no such marker (§4) |
| ADR 0083 §5, Protected material | "No credential, `*.key.txt`, manuscript, private sample Book or derivative is ever copied there" | Excepts this one file; the history objects a bundle carries are named in §3 |
| ADR 0083, Consequences and Rejected alternatives | The `.doc` scenario "loses its routine local run"; "Copy the local-only `.doc` to a guest … Rejected" | The scenario runs on every guest ladder; the alternative is adopted by this decision, by materializing from history rather than copying |
| ADR 0079 §5.1 | "keeps them as local-only test material in the untracked source directory" | A background test guest additionally holds the one legacy `.doc`, outside its checkout |
| [ADR 0062](./0062-adopt-a-local-verification-ladder-with-ci-as-delivery-gate.md), local debug fidelity; [CI and test boundaries](../agents/ci-test-boundaries.md), Local debug artifacts | "E2E inputs remain public synthetic material or admitted Public SampleBooks" | Except J-01's `doc-manuscript` scenario where the local-only `.doc` is held; no agent opens, quotes or uploads that scenario's artifacts (§3) |
| [CI and test boundaries](../agents/ci-test-boundaries.md), Where the ladder runs | the local-only bullet, the "A run sends a guest only …" bullet, the example ladder line and the Owner-actions sentence | Rewritten to this decision |
| [`SampleBooks/README.md`](../../SampleBooks/README.md) | where the local-only files live; "may be read by local tests alone" | Names the guests' copy of the `.doc` and reads a guest as a local test host for that file |
| [E2E journeys](../development/e2e-journeys.md), J-01 | where the `.doc` scenario runs | Names the guests |

## Consequences

- Legacy `.doc` intake is covered by every guest ladder again, at no cost to the Owner's desktop. On 2026-09-19, at `dev@bf94f03` (PR #477), `ai7-testbed-02` ran J-01 alone with the file in place: pass in 128 s, with no disclosure. While the pull request that lands this record was prepared, both guests ran the complete ladder with the file in place: every layer passed, no disclosed-skip marker was printed, and the `.doc`-gated unit and service cases ran unskipped.
- A guest now holds one full manuscript outside its checkout. The self-check bounds that directory to exactly this file; the guests still hold no credential and never call a Provider (they keep the outbound NAT adapter of ADR 0083 §2).
- Nothing fails silently. If the directory is absent, J-01 discloses the skip and the closure repeats it; if it exists without exactly that file, the self-check blocks the run.
- An agent cannot read the artifacts of a failing `doc-manuscript` stage, so a failure there that the payload-safe output does not explain goes to the Owner.

## Rejected alternatives

- **Admit all five local-only files.** Not what the Owner decided. Of the other four only `2听漏（定稿368544字）.docx` gates anything: one unit case, which opens no window and runs where the Owner keeps the file.
- **Put the file in the guest checkout's `SampleBooks/`.** Rejected: the guest cleans its checkout before every run, and the working tree stays free of manuscripts.
- **Copy it from the development host on every run.** Rejected: the guest's clone already holds the bytes, and a per-run copy would widen what a run sends for no gain.
- **Let any agent run the provisioning script when a run shows the file missing.** Rejected: changing a guest is an Owner action, and an agent that may place a manuscript "to fix a run" is one step from placing another.

This decision governs one test input on the repository-development test guests. It changes no AI7 product behaviour, Journey definition, Gate occurrence, repository admission, Provider Processing scope, credential, policy document, export, publication, release, or `main` authority.
