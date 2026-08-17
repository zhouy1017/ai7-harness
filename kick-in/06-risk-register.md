# Risk Register

Status: **initial design risks**

| Risk | Severity | Early control / decision gate |
| --- | --- | --- |
| Harness is `0.1.0-rc.5` developer preview with breaking changes | Critical | Exact dependency/source pin, compatibility adapter, controlled upgrade PR, effective-config and behavior snapshots |
| Two agent/task lifecycle authorities survive migration | Critical | Accept one ownership map before scaffolding; retire legacy agent loop/scheduler as Harness paths land |
| AI7 business records are naively equated with Harness events | Critical | Enforce accepted Task Ledger/Harness Session Ledger authority plus exact Execution Bindings; never infer causality from timestamps or adjacency |
| ~~Private AI7 source has no declared license~~ **Resolved at Question 27** | — | Repo is private, `LICENSE` declares AI7 proprietary with all rights reserved to the sole rights-holder, and reuse of predecessor assets is authorized. Per-asset provenance, sanitization review, and provider-terms checks still apply |
| A manuscript is persisted into a repository or reaches a public channel | Critical | Manuscripts never enter any repository, public or private, in history or working tree; private visibility does not cure this. Keep them out of hosted CI, artifacts, fixtures, corpora, and the shipped product, and gate every public channel on Public Release Permission. Model processing is permitted and is not the risk here |
| Third-party upstream obligations are assumed to transfer to an AI7-branded distribution | High | Harness is MIT with BSD-3-Clause history, a BSD native component, and vendored payload obligations that may be identity- or distribution-scoped. Verify per component and maintain a third-party notices file in every build |
| A public repo accidentally imports private Git history or fixtures | Critical | Fresh unrelated history created 2026-08-17; provenance ledger; no unrelated-history merge; privacy scan before publication. Re-run a content and metadata scan before any change of visibility |
| “Full Harness” exposes shell/filesystem/network powers to unpublished editorial material outside the intended task | Critical | Separate safe editorial and developer profiles; least privilege; source-scope guards; deny public disclosure paths by default |
| Harness web server is exposed beyond loopback | Critical | Keep local-only unless a new authenticated TLS/origin design is accepted |
| Model-visible state is hidden outside the Session log | High | Durable AI7 event projection; invariant tests that every request is reconstructable |
| Harness session schema rejects future/older stored events and has no upgrader | High | Versioned AI7 event namespace, explicit migration tool design, compatibility fixtures per pin |
| Cordis config row replacement drops upstream fields during upgrade | High | Dump full composed config; compare whole rows on every pin update |
| Host-plane vs agent-preset realm mistakes leak services across sessions | High | Architecture tests for singleton ownership, isolated presets, and scoped registries |
| Harness sandbox is mistaken for full network/process isolation | High | Threat model each capability; treat dynamic plugins and `!!js` as trusted code; use OS-level controls where required |
| Harness one-shot approval weakens AI7 durable/exact-target consent | High | Keep AI7 Approval/Effect records and integrate with, not replace them by, `ctx.approval` |
| Harness Workflow/Job/Goal limitations weaken durable business continuation | High | Keep Workflow Instance, Run Continuation Checkpoint, decisions, and Effects in AI7 while Harness owns technical attempts; test restart/wait/retry/cancel semantics explicitly |
| Python SDK/runtime limitations on Windows block the assumed bridge | High | Prefer a custom bounded local provider/process contract; prototype only after topology decision |
| Electron/native dependencies conflict with Harness Node/package stack | High | Keep package boundary narrow; validate Node/Electron ABI; consider separate process for unstable/native pieces |
| Deferred Word code or parity obligations creep back into Standalone-only V1 | High | Exclude COM/add-in, synchronization, Word packaging, and Word gates from V1; retain only surface-neutral contracts and contingency evidence until a separate ADR changes scope |
| AI7 Task Skills are reduced to plain Harness `SKILL.md` instructions | High | Keep rich manifest/trust/schema/approval model; define projection and conformance tests |
| Legacy UI source dominates a “rewrite” and recreates monoliths | Medium-high | Preserve user journeys and semantic commands; set module/client seams before UI work |
| Old `projects.json`, indexes, outputs, and histories constrain the new store | Medium-high | Enforce the accepted production-data migration exclusion; build no general importer and allow only protected credentials, reviewed mock evidence, and selected test Books |
| Credential transfer leaks a legacy API key | Critical | Resolve and write locally between OS-protected stores through a user-initiated broker path; prohibit plaintext fallback, files, logs, prompts, environment variables, and clipboard |
| A synthetic/mock fixture leaks private corpus fingerprints or exact-size metadata | High | Scan content and metadata, regenerate fixtures under new public IDs/sizes, and retain exact provenance instead of assuming “synthetic” means non-sensitive |
| Tests freeze source shape instead of behavior | Medium | Classify before migration; retain highest-useful-seam and platform evidence |
| Harness fork drifts silently from upstream | Medium | Track upstream as authority; record fork SHA equality; automate ahead/behind checks in future workflow |
| Telemetry or diagnostics expose unpublished session content to public or unintended recipients | High | Disabled by default; explicit destination, consent, redaction, and retention design before enabling |
| Current AI7 claims are mistaken for completed production behavior | Medium-high | Use capability inventory and current tests; mark provider-free paths, scaffolded skills, rejected Standalone UX, Word dependence, and missing professional-editor evidence accurately |

## Immediate blockers before implementation

1. ~~Repository visibility, license, and private-source reuse authorization.~~ **Resolved.** Private `zhouy1017/ai7-harness` created 2026-08-17; proprietary `LICENSE` and sole-rights-holder reuse authorization accepted at Question 27.
2. Accepted meaning of full Harness capability and default exposure.
3. Accepted single-authority and record-correlation model.
4. Windows Standalone shell, professional editor, and local-process topology.
5. Exact dependency strategy and upgrade contract.
