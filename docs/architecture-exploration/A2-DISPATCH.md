# A2 Codex-first capability-closure dispatch

Status: **A2 Worker complete at `756f2f9`; bounded Commander-probe correction authorized before review**

This is a repository-development dispatch record, not canonical product architecture and not implementation authorization.

## Exact assignment

- Task: `AI7 V2 architecture — A2 Codex-first capability closure`
- Role / class: Worker / T3; returned candidate review floor remains T3-par.
- Requested binding: Claude Code / `claude-opus-5` / high.
- Session: `92ea5b6f-d0b3-45b8-90a3-804f9a4702e2`.
- Branch / worktree: `docs/4-v2-architecture-candidate` / `worktrees/1649`.
- Exact starting head: `b5076179a37f8d654e758ca0b4a8bdeec8caaaa5`.
- All A1 Workers are stopped before this transfer. This Worker becomes the sole writer only after exact branch/head/clean-tree verification.

The requested Opus Worker completed the seven-path A2 commit at `756f2f9b7de3316248834508b067e84b42a4522a` with verdict `Closure not proven` and stopped. Its own permission mode refused the two authorized local probes. The Commander then ran only those two commands read-only at `2026-08-22T14:50:23Z`: `codex --version` returned exit 0 / `codex-cli 0.147.0`; `codex app-server --help` returned exit 0 and identified the command as experimental, stdio as default, plus the displayed help surface. Session `fb73bf3a-2d6b-40fb-8d83-1aaad14beccc`, Worker/T1, is authorized to synchronize that exact evidence and correct the A1-history wording without changing the matrix dispositions or verdict, then amend only the A2 commit and stop.

## Question A2 must answer

Does one exact open-source Codex surface, together with narrowly named AI7-owned adapters that do not reproduce a second generic loop, satisfy every load-bearing row of **Harness Capability Closure** for AI7? If not, which rows remain unknown, experimental, gap claims, or verified **Codex Capability Gaps**?

The result must distinguish a decision-ready architecture candidate from a production-support claim. “Codex-first” is evaluation priority, not closure proof.

## Admitted evidence

Every source is labeled as owner direction, accepted AI7 rule, candidate invariant, official documentation, exact source snapshot, local observation, or unresolved claim.

1. Sealed A1 candidate head `b5076179a37f8d654e758ca0b4a8bdeec8caaaa5`, limited to:
   - `docs/architecture-v2/README.md`
   - `docs/architecture-v2/A1-PRODUCT-CONSISTENCY.md`
   - `docs/architecture-v2/A1-EVIDENCE-CROSSWALK.md`
   - `docs/architecture-v2/DECISION-QUEUE.md`
   - `docs/architecture-v2/GLOSSARY.md`
   - `docs/architecture-v2/domain/execution/CONTEXT.md`
   - `docs/architecture-v2/adr/0001-conditional-primary-agent-harness-and-gap-closure.md`
2. Exact owner-direction object `4741dd1b468e1fd88b9d71386446f761eef8e1e5:docs/architecture-exploration/CODEX-HARNESS-DIRECTIVE.md`, blob `29dcb3e6aa0a3180117400404ed0fa77504bb641`, 8213 bytes.
3. Exact owner resolutions:
   - `92e2160fef9ce8195f1fee7fe29b60ba7e9d33a3:docs/architecture-exploration/clarifications/0001-primary-agent-harness-role.md`, blob `9666dccafcce3d46711bc3ce18c820fa8cc377bb`, 6162 bytes.
   - `753db78c15a1853047a41c1402d80c0ad8dbe2ea:docs/architecture-exploration/clarifications/0002-codex-gap-closure-and-dsh-reentry.md`, blob `b041b743e081ed93bf6d3a9f8187e5945d202f24`, 6467 bytes.
4. Commander-curated seam audit `9af2a07f38b036b4bb26724d7af34768b9585a5a:docs/architecture-exploration/CODEX-EXTENSION-SEAMS.md`, blob `db0ed6a27db471a71402fb380ab7dd6eb5dc5f57`, 7851 bytes. It is an evidence index with warnings, not technical truth or an accepted maintenance policy.
5. Official OpenAI sources only for Codex product claims:
   - `https://developers.openai.com/blog/codex-as-a-platform`
   - `https://developers.openai.com/codex/app-server`
   - exact `openai/codex@44e95c857f37f81a5731eab72c32a3d334d0e2c4` source paths linked from the seam audit.
6. Separately authorized local observations: `codex --version` and `codex app-server --help` only. Record command, timestamp, exit code, and output class. These prove only the installed binary's identity/help surface.

Official guidance and source must be kept distinct. The official App Server documentation's recommendation for deep integration coexists with an experimental/unsupported-for-production maturity warning. Stdio JSONL is a documented default transport and an integration candidate, not by itself a supported production baseline. WebSocket, dynamic tools, plugins, permissions, and other experimental surfaces cannot close a production row without a recorded compatibility/risk decision.

## Inadmissible context and actions

- No task transcript, active foreign worktree, unlabeled context, third-party blog, source-tree clone, vendoring, copied Codex/DeepSeek source, dependency installation, model/provider call, authentication, credential access, prototype, app-server handshake, schema generation, external write, push, PR, merge, or publication.
- Do not inspect DeepSeek runtime source for re-entry. Canonical AI7 records may identify its current reference value, but exact DeepSeek runtime evidence becomes admissible only after an exact Codex gap remains and a separate brief evaluates a Mature Runtime Alternative.
- Do not answer DQ-A1-01 or the pending maintenance-policy Question 3, select adapter/upstream/patch/fork, enter A3, edit canonical V1, or authorize implementation.

## Required outputs

The Worker may write exactly these seven paths:

1. update `PROGRESS.md`;
2. update `docs/architecture-v2/README.md` with A2 status and links while preserving the sealed A1 head as historical authority;
3. update `docs/architecture-v2/DECISION-QUEUE.md` only for A2 findings, open decisions, and phase gates;
4. add `docs/architecture-v2/A2-CAPABILITY-CLOSURE.md`;
5. add `docs/architecture-v2/A2-CODEX-SEAM.md`;
6. add `docs/architecture-v2/A2-EVIDENCE-REGISTER.md`;
7. add `docs/architecture-v2/A2-GAP-REGISTER.md`.

No candidate ADR is authorized in this turn. A later ADR requires a reviewed, decision-ready result plus any outstanding owner disposition.

## Capability-closure matrix

`A2-CAPABILITY-CLOSURE.md` must define a closed row set before scoring it. At minimum cover:

- generic agent loop and one-execution-authority constraint;
- thread/conversation start, resume, fork, read, and list;
- turn lifecycle, streamed technical events, interruption, and in-turn recovery;
- AI7 Resume/Retry/Redo/Replay separation from executor primitives;
- context/instruction assembly and compaction;
- model invocation and provider/model/credential replaceability;
- domain-shaped capability projection and exact absence of generic shell, roaming filesystem, arbitrary network, coding defaults, and self-escalation;
- execution approvals separated from Run Authorization, Effect Approval, Public Release Permission, and Effect Receipts;
- sandbox, filesystem, network, cancellation, crash, shutdown, concurrency, scratch, and cache isolation;
- exact Execution Binding between AI7 Task/Run/Plan/attempt/Effect references and Codex technical history without transcript copying or authority promotion;
- Session Ledger storage, history, diagnostics, and data-location isolation;
- protocol/schema versioning and compatibility;
- headless verification and deterministic test adapter;
- Windows/macOS and CPU packaging/lifecycle evidence;
- licensing, NOTICE, trademark/branding, exact pin, release, and upgrade obligations.

Each row records: AI7 invariant, required interface behavior, owner, exact Codex surface, evidence object, evidence kind, maturity/stability, disposition, required AI7 adapter, whether source-coupled development is claimed, and exit test.

Allowed dispositions are **Proven**, **Candidate**, **Experimental**, **Unknown**, **Gap claim**, **Verified Codex Capability Gap**, and **Not applicable**. Missing documentation, an undiscovered seam, or an unrun test is never a verified gap. A closure pass requires every load-bearing row to be Proven against one coherent exact surface; Candidate/Experimental/Unknown/Gap claim fails the pass without proving a Codex gap.

## Deep-module seam design

`A2-CODEX-SEAM.md` uses the exact vocabulary **Module**, **Interface**, **Seam**, **Adapter**, **Depth**, **Leverage**, and **Locality**.

- Define one AI7-owned deep **Primary Agent Harness Module** interface in the AI7 service process. It hides Codex Thread/Turn/Item, JSON-RPC, schema drift, sidecar lifecycle, event translation, approvals, and storage-location details from domain callers and the renderer.
- Treat Codex as a true external dependency. The production candidate is a `Codex App Server Adapter`; the deterministic replay/test implementation is a second adapter, making the seam real rather than hypothetical.
- Keep protocol/tool/provider/storage sub-seams internal unless two justified adapters and a caller-visible variation require exposure.
- State the full interface: operations plus invariants, ordering, error modes, configuration, cancellation, performance, and restart behavior. The interface is the test surface.
- Apply the deletion test: removing the module must force Codex-specific complexity back into many callers; a pass-through wrapper is rejected.
- Do not expose generic protocol envelopes or raw executor approval as AI7 domain records. Do not let SDK, `codex exec`, and app-server become three overlapping loops.

The document may recommend a candidate seam, but it must not select the still-open maintenance form or call an unsupported App Server surface production-ready.

## Evidence and gap discipline

`A2-EVIDENCE-REGISTER.md` records exact URLs/commit/path, retrieval date, claim supported, evidence kind, stability warning, and whether direct verification occurred. Research snapshot and proposed dependency pin remain distinct.

`A2-GAP-REGISTER.md` separates Unknown, Experimental, Gap claim, and Verified Codex Capability Gap. Only a verified gap may receive costed Codex Secondary Development alternatives. DeepSeek Runtime Re-entry remains ineligible unless an exact verified gap remains unclosed and a later exact DeepSeek surface proves Mature Runtime Alternative; even then the owner must choose.

## Required verdict and stop

Return one of:

- **Closure pass** — every load-bearing row Proven for one exact coherent Codex surface;
- **Closure not proven** — one or more rows Candidate/Experimental/Unknown/Gap claim, with exact next evidence and no inferred gap; or
- **Verified gap** — at least one exact load-bearing gap proven, with costed Codex Secondary Development routes, while DeepSeek remains ineligible absent its separate two-condition gate.

The expected evidence may support a strong Codex-first architecture candidate without a closure pass. Truthful non-closure is a valid result.

Validate links, tables, source identities, row totals, allowed dispositions, seven-path write boundary, `git diff --check`, no forbidden evidence/actions, and a clean worktree. Commit one new local A2 candidate commit above sealed A1 head, report exact head and actual binding/fallback, then stop. Do not amend `b507617`.
