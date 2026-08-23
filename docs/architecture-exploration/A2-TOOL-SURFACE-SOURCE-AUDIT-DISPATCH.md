# A2 exact Codex tool-surface source-audit dispatch

Status: **prepared after bounded Commander briefing preflight; blocked until this exact control head passes independent Standards and Spec review; no Worker source audit, candidate write, re-score, runtime probe, A3, DeepSeek comparison, maintenance-form choice, or implementation is authorized yet**

This is a repository-development evidence brief. It is not canonical product architecture, a dependency decision, a Codex production-support claim, or implementation authorization.

## Purpose and bounded question

The review-clean A2 candidate at `8eb70e315ea4a4103c1820fe9fd0bdeae49f5f93` remains **Closure not proven** with 44 rows / 43 load-bearing, `0 Proven / 17 Candidate / 2 Experimental / 24 Unknown / 1 Not applicable / 0 Gap claims / 0 Verified Codex Capability Gaps`.

Its highest-leverage blocker is `BLK-A2-03`: admitted documentation exposes shell, process, filesystem, web, marketplace, plugin, review, Git, collaboration, skill, and hook surfaces, but does not show whether those capabilities are present in the model-visible tool registry for every Codex turn or can be structurally absent from an AI7 editorial Run. This audit answers only the source-evidence half of `EV-A2-01` for `CC-16`–`CC-19` / `UNK-A2-06`–`UNK-A2-09`:

> At exact source commit `758ef40f50c1a458425c7cfbf1eb12cbc07af0b0`, what constructs the model-visible tool registry for an App Server thread, which inputs register or suppress each coding-native capability family, and can one exact configuration keep the Codex agent loop while registering only AI7 domain capabilities?

The audit must distinguish five different surfaces that may coexist without being equivalent:

1. model-visible tool specifications included in a Responses request;
2. the executor's registered router/handler set, including `ToolExposure::Hidden` or Code Mode-nested tools that are not directly model-visible;
3. App Server client RPC methods such as `thread/shellCommand`, `command/exec`, `process/*`, and `fs/*`, which a host may call independently of the model-visible registry;
4. handlers and facilities that remain compiled or packaged even when neither model-visible nor client-exposed by the AI7 Adapter; and
5. AI7-owned domain capabilities projected through documented MCP or experimental `dynamicTools` seams.

Showing that AI7's adapter never calls a host RPC is not proof that the corresponding model tool is absent. `ToolExposure::Hidden`, Code Mode wrapping, or omission from a model-visible list is not proof that an internal runtime is unregistered or undispatchable. Conversely, finding a host RPC or compiled handler is not proof that the model can call it in an editorial turn. The audit must trace closed construction, registration, exposure, routing, and reachability rather than infer any of them from names, package presence, grep silence, UI hiding, or adapter non-use.

## Exact assignment

- Task: `AI7 V2 A2 — exact Codex tool-surface source audit`.
- Role / class: Worker / T3, read-only; any later repository evidence synthesis and candidate change receive separate authority and T3-par review.
- Requested binding: Claude Code / `claude-opus-5` / high.
- Actual binding rule: the exact prior Claude session `1540bd4c-0b54-4454-8a5f-6b2dec2b1cc8` returned API HTTP 429 before inference at `$0`, and no later availability evidence exists; therefore use the existing same-class GPT-5.6 Sol / `xhigh` fallback and record the task identity. This changes neither task class nor authority.
- Repository: control worktree `worktrees/6bbc`, read-only for the audit; candidate worktree `worktrees/1649`, read-only at exact head `8eb70e315ea4a4103c1820fe9fd0bdeae49f5f93`.
- Write boundary: none. Return a structured report to the Commander; do not create or edit a repository file, branch, commit, issue, pull request, or external record.

The Worker may begin only after both independent review axes pass the exact control commit containing this brief. Before research, verify both worktrees are exact and clean and record their heads. If either predicate fails, stop without research.

## Admitted authorities and sources

Read these exact repository objects only for requirements, current evidence state, and terminology:

1. `3796de65f12257932ca3acc199a6f244c7a705bf:docs/architecture-exploration/A2-STATIC-EVIDENCE-RESCORE-DISPATCH.md` as the reviewed authority for the latest candidate re-score.
2. Candidate head `8eb70e315ea4a4103c1820fe9fd0bdeae49f5f93`, limited to:
   - `docs/architecture-v2/A2-CAPABILITY-CLOSURE.md`;
   - `docs/architecture-v2/A2-GAP-REGISTER.md`;
   - `docs/architecture-v2/A2-CODEX-SEAM.md`;
   - `docs/architecture-v2/A2-EVIDENCE-REGISTER.md`;
   - `docs/architecture-v2/domain/execution/CONTEXT.md`;
   - `docs/architecture-v2/GLOSSARY.md`;
   - `docs/architecture-v2/adr/0001-conditional-primary-agent-harness-and-gap-closure.md`.
3. Exact accepted AI7 rules in `AGENTS.md` at sealed A1 head `b5076179a37f8d654e758ca0b4a8bdeec8caaaa5`, limited to the one-agent-loop, domain-capability, authority, Run Source Scope, provider/network, dependency-absence, and DeepSeek-re-entry constraints cited by those candidate records.
4. Current official OpenAI App Server documentation at [`https://developers.openai.com/codex/app-server/`](https://developers.openai.com/codex/app-server/), including its final OpenAI-owned redirect, current maturity warning, default local Code Mode host statement, and model/tool, RPC, approval, permission, sandbox, process, filesystem, MCP, and dynamic-tool descriptions. Current documentation is a moving source and may cross-check exact source only; it must not be represented as exact `0.149.0` behavior.
5. Immutable official `openai/codex` source at exact commit `758ef40f50c1a458425c7cfbf1eb12cbc07af0b0`, reached only through commit-bound `github.com/openai/codex`, `raw.githubusercontent.com`, or unauthenticated read-only `api.github.com/repos/openai/codex` GETs.

The Commander performed a bounded briefing preflight against the exact tree: read-only tree metadata plus selected in-memory textual GETs, with no clone, archive, package, binary, schema, execution, persisted source copy, repository write, or candidate change. That preflight exposed the `ToolExposure::Hidden` false-proof risk and locked the 43-file allowlist below. It is not a completed audit or admitted candidate evidence.

The Worker may fetch textual content only for the paths in the **Closed exact-source allowlist** and only to trace:

- App Server thread/turn creation into the core session or conversation;
- construction of Responses tool specifications and the executor tool router/handlers;
- configuration, feature, model-capability, collaboration-mode, skill/hook, MCP, dynamic-tool, web-search, review/Git, shell/process, filesystem/file-change/apply-patch, and permission-request gates that affect registration;
- App Server RPC registration for host-only command, process, shell, filesystem, marketplace, plugin, review, and related methods; and
- the exact compile-time or composition boundaries contained in the allowlist that distinguish documented configuration, internal-only configuration, and source-coupled development.

The allowlist is closed. Do not enumerate the tree again or chase imports beyond it. Fetch only the blobs actually needed from that list, verify their recorded identity and size, and cite exact symbols and line ranges. If a required constructor or override path leaves the list, report the exact missing path and stop that conclusion; do not fetch it. Do not fall back to `main`, another tag, a local installed `0.147.0` binary, the earlier `44e95c` research snapshot, third-party commentary, or search-result summaries as evidence for the selected subject.

## Closed exact-source allowlist

Every row is under exact commit `758ef40f50c1a458425c7cfbf1eb12cbc07af0b0`. The Commander re-derived these 43 tree entries during briefing preflight; their total recorded size is 1,665,858 bytes. Blob identity or size mismatch stops the audit.

| Path | Git blob | Bytes |
| --- | --- | ---: |
| `codex-rs/app-server/README.md` | `483924a572f47fd08c32b0705e98ea7399ebfd87` | 175277 |
| `codex-rs/app-server/src/lib.rs` | `b0f5062389ebec738bb56321af3dd8b9308c9ea1` | 57332 |
| `codex-rs/app-server/src/in_process.rs` | `31fc42153212495527f57e533731998aad478aff` | 45484 |
| `codex-rs/app-server/src/code_mode_host.rs` | `6a0ceae5e91e4af2ee83510e550d91da81353a3c` | 2933 |
| `codex-rs/app-server/src/extensions.rs` | `21855dffcac857eaaee196bae6ffc5cff12d7466` | 25329 |
| `codex-rs/app-server/src/message_processor.rs` | `4c7ca2e8de84aa2eda9152d79e3ef5be4e3b338c` | 67938 |
| `codex-rs/app-server/src/request_processors.rs` | `e1e359f1735fcebf83f9994d39e0485eeedc540f` | 33698 |
| `codex-rs/app-server/src/request_processors/thread_processor.rs` | `afea864aff81b8096aa9622e8820d36f1a885b40` | 231872 |
| `codex-rs/app-server/src/request_processors/turn_processor.rs` | `822dcace40a6474cd260226495eb056d59ce3b2b` | 59901 |
| `codex-rs/app-server/src/request_processors/command_exec_processor.rs` | `0c03ceede4695f98c2e72ff01df0d51d77168283` | 12910 |
| `codex-rs/app-server/src/request_processors/process_exec_processor.rs` | `e44a75e929e695fb152e3c2d3f4133f2279b95be` | 23913 |
| `codex-rs/app-server/src/request_processors/fs_processor.rs` | `5767af6124a0aec799f854aeb0d0daff1c7387e1` | 7512 |
| `codex-rs/app-server/src/request_processors/marketplace_processor.rs` | `18270279f52dffaa838f59a5d6cd653de4983be7` | 5093 |
| `codex-rs/app-server/src/request_processors/plugins.rs` | `4802228999370a23e609180311cc5297c1090a2e` | 99840 |
| `codex-rs/app-server-protocol/src/protocol/v2/mod.rs` | `97f8b053d987f1babd78a654b62be09c5236982c` | 1201 |
| `codex-rs/app-server-protocol/src/protocol/v2/thread.rs` | `75fe5091b188f1f2fc601fadd169dc737cba31bd` | 72432 |
| `codex-rs/app-server-protocol/src/protocol/v2/turn.rs` | `0b2c092ec83a7c4c29827ad8c735db73ee61142a` | 16175 |
| `codex-rs/app-server-protocol/src/protocol/v2/command_exec.rs` | `15d747bd2121b1cdbff353cb04601fe775a87811` | 8395 |
| `codex-rs/app-server-protocol/src/protocol/v2/process.rs` | `11a8d687d43a84ac0cce208f0a27ffc2994b4de5` | 8040 |
| `codex-rs/app-server-protocol/src/protocol/v2/fs.rs` | `951b7af9b6ff3831676ce28836f37ef0ab447d9a` | 7270 |
| `codex-rs/app-server-protocol/src/protocol/v2/review.rs` | `2896418e22dc451729177b7e6d422cb31039a9ec` | 2090 |
| `codex-rs/app-server-protocol/src/protocol/v2/collaboration_mode.rs` | `250719229e8d365b6914d7694f5137594b0b798e` | 1550 |
| `codex-rs/app-server-protocol/src/protocol/v2/plugin.rs` | `de2bdc3a4e391b1f9b70e7c220b5840c223ba0dc` | 33241 |
| `codex-rs/app-server-protocol/src/protocol/v2/item.rs` | `c2b59e45942fad1a917a0076a649d2473d513355` | 60838 |
| `codex-rs/core/src/tools/spec_plan.rs` | `2141f3d30b6b977693ecdc28dde02508d507b33f` | 54163 |
| `codex-rs/core/src/tools/registry.rs` | `e7c416d0779ff50e163173dc896c4e458057d8af` | 31564 |
| `codex-rs/core/src/tools/router.rs` | `b3e60a5986a445fad1756338316ea8231460fb80` | 9162 |
| `codex-rs/core/src/tools/hosted_spec.rs` | `af7cdf801364b79af9e24924a63ed32543348f95` | 1791 |
| `codex-rs/core/src/tools/code_mode/mod.rs` | `0ce1e66b9cf04fb4e3a255ae1cd1e044e25b1d2c` | 17712 |
| `codex-rs/core/src/session/turn_context.rs` | `728749a4109928072e0b56c5513a6d057f65496f` | 42599 |
| `codex-rs/core/src/client_common.rs` | `1e98b25d11d12790f1dd29f1b338848a7bf48642` | 4056 |
| `codex-rs/core/src/client.rs` | `f26d41955e59be126f3551788f5eb76dba8dd970` | 100288 |
| `codex-rs/core/src/config/mod.rs` | `0a3ebf45872b4015e42762db59dcdfee001c0268` | 184997 |
| `codex-rs/core/src/session/mcp.rs` | `caf6a279244a829564e6af1d62fabec4b43366a5` | 41157 |
| `codex-rs/core/src/mcp.rs` | `9bb1678e71d4a90b2b8b8a638023c29af461de33` | 13988 |
| `codex-rs/core/src/mcp_tool_exposure.rs` | `43b490ecc204f9401c26a958a28a6878ea492829` | 6125 |
| `codex-rs/features/src/lib.rs` | `71abcb1bd9e5d8d8063b8d16a4dd4e4c849de4a0` | 53283 |
| `codex-rs/features/src/feature_configs.rs` | `a39da8757aa0f2d19acbc9de58d813db1c2e1cd7` | 17930 |
| `codex-rs/tools/src/tool_config.rs` | `990d4a3c58cabaa1c27b934602e9d4b0c501eb90` | 6414 |
| `codex-rs/tools/src/tool_spec.rs` | `530da1be164ce3c6aa4b128ccb878bda7025e217` | 6750 |
| `codex-rs/tools/src/responses_api.rs` | `e450dcf35f93ab4af7bf3f34956755066114ccae` | 5346 |
| `codex-rs/protocol/src/dynamic_tools.rs` | `bbe92b8fe0c75802cc1784d900926612b170a6b5` | 5992 |
| `codex-rs/models-manager/src/collaboration_mode_presets.rs` | `72731c52d34a8151cc2825c5029d39ef0833605a` | 2277 |

## Allowed actions

- Read the named local objects and exact clean Git state.
- Retrieve current official documentation and the minimum exact-commit official source text through bounded HTTP GETs.
- Search, parse, and correlate returned text in memory.
- Return one structured read-only report to the Commander.

No GitHub authentication, credential access, repository clone/fetch/checkout, release-asset or binary download, package installation, dependency resolution, compilation, schema generation, App Server or CLI execution, model/provider call, MCP connection, network capture, dynamic probe, source edit, external write, or publication is allowed. If unauthenticated retrieval is unavailable or rate-limited, report the exact missing objects and stop; do not broaden the source set.

## Required source trace

Build one call-and-registration trace from App Server thread/turn configuration to the exact outbound model tool list and corresponding handler router. The trace must answer each question with a direct source fact, a labeled inference, or an unresolved link:

1. Where is the tool registry/specification list built, and where is it serialized into the model request?
2. Which exact inputs and defaults register shell/process tools, filesystem/file-change/apply-patch tools, web/network tools, review/Git/collaboration tools, skills/hooks, MCP tools, and dynamic tools?
3. Can each capability family be omitted from the model-visible list without replacing the generic agent loop? Is the omission controlled by a documented configuration, an undocumented/internal configuration, a model/provider capability branch, a compile-time feature, or a source modification?
4. If all coding-native families are omitted, can documented MCP tools or experimental `dynamicTools` still supply only AI7-shaped capabilities? Record maturity separately; do not turn documentation or experimental availability into production proof.
5. Does the executor router reject a tool-call name that was not registered, or can an unadvertised built-in handler still be invoked through another path?
6. Which host-callable App Server RPC methods remain compiled and reachable independently of the model-visible registry? Could an AI7 adapter exclude them at its own interface without claiming they vanished from the binary?
7. Do presets, collaboration modes, skills, hooks, plugins, marketplace configuration, model/provider differences, resume metadata, or per-turn overrides silently reintroduce a forbidden tool after thread creation or resume?
8. What exact source-controlled property would a deterministic test have to assert at thread start, resume, model switch, and turn start to prove the effective list remains AI7-only?

Apply these row-specific boundaries:

- **`CC-16` / `UNK-A2-06`:** Under one named immutable configuration with shell, Code Mode, native environments, MCP/plugin sources, and undeclared dynamic tools disabled, inventory `shell_command`, `exec_command`, `write_stdin`, `apply_patch`, Code Mode execution, and every source-visible equivalent. State separately whether each is absent from the registered set, hidden, nested, model-visible, or client-callable. Trace whether start, resume, fork, model selection, or turn override can re-enable it.
- **`CC-17` / `UNK-A2-07`:** Distinguish agent tools, `fileChange` event/item types, environment backends, and client `fs/*` RPCs. Do not claim Run Source Scope, Windows effective-target enforcement, symlink/junction containment, or runtime refusal; those remain outside this static source audit.
- **`CC-18` / `UNK-A2-08`:** Inventory hosted web search, standalone web extensions, MCP/apps, plugin suggestion/install, marketplace RPCs, the default or remote Code Mode host, and any source-visible background startup. For each, record default, enablement predicate, caller, model visibility, internal dispatchability, and whether the named configuration removes or only hides it. Configured model traffic and AI7's future bounded research capability are exceptions to classify, not proof that arbitrary network is absent.
- **`CC-19` / `UNK-A2-09`:** Inventory `review/start`, Git metadata, collaboration presets/instructions, skills, hooks, Code Mode, and coding-specific item/metadata paths. Classify each as model-visible, registered/hidden, client-only RPC, automatically populated metadata, or optional input. If proving instruction or prompt replacement necessarily enters `CC-09` / `UNK-A2-03`, stop and name the required widened brief instead.

No adjacent row enters this task. `CC-09`, `CC-15`, `CC-20`, `CC-23`, `CC-40`, and `CC-43` remain frozen even if the audit encounters relevant source. Record such facts only as `INCIDENTAL — NO ROW AUTHORITY`; do not use them in a recommendation or later synthesis under this brief.

## Required report

Return these sections and nothing that claims a candidate decision:

1. **Start attestation** — include one operational line stating role, task class, requested binding, actual provider/model/effort, fallback status and exact reason, control head, candidate head, both clean-state results, and reviewer independence. Because this Worker returns no repository unit, state `returned-unit independent review N/A`; any Commander synthesis commit must receive separate T3-par Standards and Spec review.
2. **Retrieval manifest** — URL, exact commit/path, blob identity and byte count when obtainable, retrieval time, and purpose for every official source object.
3. **Registration call graph** — exact symbols and source ranges from App Server inputs to model-visible specs and handler routing.
4. **Surface-plane table** with one row for each of shell/process, filesystem/file-change/apply-patch, web/network/marketplace/plugin, coding review/Git/collaboration/skills/hooks, MCP, and `dynamicTools`. Columns: model-visible specification; registered/`Hidden` runtime; environment backend; App Server client RPC; MCP/extension/dynamic contributor; Code Mode host or nesting; preset/instruction/metadata plane; default and override predicates; exact source; and unresolved link.
5. **Four-row evidence mapping** — `CC-16`/`UNK-A2-06` through `CC-19`/`UNK-A2-09`; state only what direct source now establishes, what remains unproven, and the minimum next evidence. Do not assign a new disposition.
6. **Exact-source/current-documentation delta** — current moving documentation may corroborate or conflict with the exact source, but never substitute for it.
7. **False-proof audit** — explicitly reject conclusions based only on compiled code, RPC presence, package filenames, sandbox/approval constraint, UI hiding, adapter non-use, model non-selection, or absence from current documentation.
8. **Potential decision impact** — one non-authoritative recommendation per target row: `no candidate change`, `later re-score may be justified`, or `possible gap claim requires separate proof`. Never report a Verified Codex Capability Gap.
9. **Incidental observations** — if any, each labeled `INCIDENTAL — NO ROW AUTHORITY`; otherwise state none.
10. **Stop report** — exact unperformed actions and confirmation of no repository write, clone, binary acquisition/execution, runtime probe, candidate re-score, A3, DeepSeek inspection, maintenance-form selection, or implementation.

## False-proof rules

- Not model-visible does not mean not registered, not dispatchable, no client RPC, or absent from compiled/package content.
- `ToolExposure::Hidden`, Code Mode nesting, a disabled model-facing specification, or AI7 Adapter non-use is not structural absence by itself.
- A feature whose default is false is not an immutable fail-closed configuration until every configuration, managed-requirement, start, resume, fork, model-capability, and per-turn override path inside the allowlist is traced. If that trace leaves the allowlist, the result is unresolved.
- `web_search = disabled` proves nothing by itself about MCP, apps, plugins, Code Mode host traffic, marketplace, telemetry, provider traffic, or another extension contributor.
- A plugin feature flag or absent plugin configuration does not by itself prove plugin or marketplace RPC removal.
- Event or item types such as `commandExecution`, `fileChange`, and `webSearch` are records, not automatically callable capabilities.
- Source tests and assertions are design evidence only; this task does not execute them.
- Grep silence is never negative proof. An absence claim requires a closed constructor and control-flow inventory over the exact allowlist.
- Current documentation cannot be attributed to `0.149.0` unless exact source independently agrees.

## Decision and stop boundaries

- This task creates source evidence only. It cannot edit `S-A2-*` registrations, `CC-*` dispositions, `UNK-A2-*` status, `BLK-A2-03`, the seam, the ADR, or any canonical artifact.
- Source proof that a stock configuration can omit a family may support a later Candidate disposition, not Proven; deterministic exact-artifact verification still remains.
- Source proof that omission requires a patch may identify a possible seam gap, but does not verify a Codex Capability Gap or select adapter/upstream/patch/fork. The maintenance-policy Question 3 remains deferred until the Commander has separately reviewed gap evidence.
- Source proof about current `main` or another release cannot be projected onto selected stable `0.149.0`.
- DeepSeek Harness remains a Development Reference Framework. Do not inspect or compare its runtime.
- A3 remains blocked because this static source audit neither launches the selected process nor establishes its truthful OS isolation, process tree, network behavior, or lifecycle.

After returning the report, stop. Because the audit Worker has no write authority, the Commander records the required `PROGRESS.md` checkpoint, independently verifies the exact source identities, synthesizes any evidence record in a separate reviewed commit, and issues a separate exact candidate-writing brief before any re-score.
