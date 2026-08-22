# Codex Extension-Seam Evidence

Status: **Commander-curated read-only A2 input; noncanonical; no implementation authorized**

Recorded: **2026-08-22**

Repository evidence pin: `openai/codex@44e95c857f37f81a5731eab72c32a3d334d0e2c4`

This record answers the factual part of the Codex secondary-development question before the owner chooses a maintenance strategy. It distinguishes capabilities that can plausibly remain outside the Codex source tree from changes that may require a maintained source build. It does not prove AI7's full capability closure, select a component, or authorize a prototype, patch, fork, dependency, or source copy.

## Official product boundary

OpenAI's [Codex as a platform](https://developers.openai.com/blog/codex-as-a-platform) states that the open harness owns the reusable agent loop while a specialist host may retain its own interface, context, tools, operational boundaries, records, and approval flows. The [Codex App Server documentation](https://developers.openai.com/codex/app-server) identifies app-server as the deep product-integration surface for authentication, conversation history, approvals, and streamed agent events.

The documented production-suitable local transport is stdio JSONL over a bidirectional JSON-RPC protocol. WebSocket app-server transport is experimental and unsupported for production. AI7 therefore has evidence for an out-of-process stdio integration candidate, not for an in-process Node library or a Windows named-pipe transport.

## Strong out-of-tree seams

| Concern | Exact evidence | A2 implication |
| --- | --- | --- |
| AI7-owned product and UI | The platform article permits the host to retain dashboards, editors, records, tools, and approval flows around the harness. | AI7 can own Electron UI and every domain record while projecting Codex events through an adapter. |
| Thread lifecycle and event streaming | Pinned [`app-server/README.md`](https://github.com/openai/codex/blob/44e95c857f37f81a5731eab72c32a3d334d0e2c4/codex-rs/app-server/README.md) and current official App Server docs expose thread start/resume/fork/read/list, turn start/interrupt, streamed items, approvals, and generated protocol schemas. | Generate or pin an exact JSON-RPC client rather than equating the TypeScript SDK with app-server. |
| Per-thread configuration | Pinned [`ThreadStartParams`](https://github.com/openai/codex/blob/44e95c857f37f81a5731eab72c32a3d334d0e2c4/codex-rs/app-server-protocol/src/protocol/v2/thread.rs) includes model/provider, sandbox and approval settings, instruction fields, config overrides, and history controls. | Many execution boundaries can be selected by the AI7 host without changing the generic loop, subject to exact stability tests. |
| AI7 capabilities | App-server exposes configured MCP servers; pinned and current docs also expose host callback `dynamicTools`. | AI7-owned MCP is the stronger current candidate. `dynamicTools` is experimental and cannot be a production premise without a compatibility decision. |
| Execution approvals | App-server sends command, file-change, permission, and tool approval requests to the client. | AI7 can render and answer Codex execution requests out of tree, while keeping them strictly separate from AI7 Run Authorization, Effect Approval, and business decisions. |
| Responses-compatible providers | Pinned [`model-provider-info`](https://github.com/openai/codex/blob/44e95c857f37f81a5731eab72c32a3d334d0e2c4/codex-rs/model-provider-info/src/lib.rs) exposes configurable provider endpoints, auth, headers, retry, and capabilities around the Responses wire API. | An AI7 provider gateway can remain out of tree when it presents a compatible Responses contract; this must be proven per provider. |
| Technical Session isolation | Pinned [`ThreadStore`](https://github.com/openai/codex/blob/44e95c857f37f81a5731eab72c32a3d334d0e2c4/codex-rs/thread-store/src/store.rs) separates thread storage behind an internal trait, while the stock binary uses its local store. | A dedicated AI7-controlled Codex data location may isolate the Harness Session Ledger without copying it into the Task Ledger; exact storage and lifecycle behavior still require a spike. |
| Native binary launch | Pinned [`codex-cli/bin/codex.js`](https://github.com/openai/codex/blob/44e95c857f37f81a5731eab72c32a3d334d0e2c4/codex-cli/bin/codex.js) resolves platform-specific native binaries, including Windows targets. | Packaging a pinned sidecar is plausible but must prove license/NOTICE, update, child-process shutdown, Windows/macOS support, and Electron integration. |

## Surfaces that may require source-coupled development

The exact source exposes internal abstractions, but an internal Rust trait is not automatically a stable out-of-tree extension API. A maintained patch set or fork remains plausible for:

- changing the generic agent loop, compaction, turn semantics, built-in routing, event contract, sandbox internals, or approval algorithm rather than configuring them;
- registering arbitrary native Rust lifecycle, prompt, context, or tool contributors where the stock app-server does not expose a production runtime loader;
- replacing or transactionally coupling the stock Thread Store, including custom at-rest encryption, when no app-server selection seam exists;
- adding a provider wire protocol that cannot be presented through the Responses-compatible configuration or an AI7 gateway; or
- embedding app-server in Node/Electron without a sidecar, because the in-process surface is Rust and workspace-coupled.

These are categories to test, not evidence that AI7 needs any of them.

## Stability warnings

- `dynamicTools`, newer permissions fields, selected capability roots, parts of history pagination, and several per-turn controls are experimental.
- Plugin installation and related app-server plugin APIs are documented as under development and not ready for production clients.
- The audit has not proven that the stock app-server can exclude every coding-native prompt, tool, or default forbidden to an Editorial Run.
- The audit has not proven that desired DeepSeek or other provider endpoints satisfy Codex's Responses contract.
- The audit found no production claim for Windows named-pipe app-server transport; stdio is the supported local baseline.

## Evidence-backed Question 3 framing

The available official evidence supports **adapter/extension first** as the recommended maintenance policy:

1. pin the stock app-server and its exact generated protocol;
2. keep AI7 product/domain/UI authority in the host;
3. project AI7 Capabilities through stable MCP or another proven host seam;
4. use host-owned provider, approval, storage-location, and lifecycle adapters where the exact contract permits;
5. treat experimental seams as spikes rather than foundations; and
6. authorize a maintained source patch or fork only for a named load-bearing gap that survives both protocol/extension evaluation and a bounded adapter or sidecar spike, with an ADR accepting rebase, security, build, schema, license, and exit costs.

A default fork remains a real owner option, but the present evidence does not require it.
