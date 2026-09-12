# Provider support

Derived from `dev@203ed692ac60daa8771b31721003c964a92bbe26`: `src/service/provider/model-profile.ts`, `src/service/provider/deepseek-adapter.ts`, `src/service/provider/egress-gate.ts`, `src/shared/protocol.ts`.

## Three senses of "supported"

- **Declared** — a `ProviderModelProfile` exists in `PROVIDER_MODEL_PROFILES` (`src/service/provider/model-profile.ts`). A declared profile whose `answerChannel` is `'none'` is inert: it can read no response.
- **Live-verified** — a capability whose evidence is `{ kind: 'live-test-item' }`, cited by its item ids.
- **Bindable** — a route in `ExecutionRoute` (`src/service/provider/egress-gate.ts`), which a Provider Resolution Plan may bind. `RemoteExecutionRoute` is the wider set a profile may be declared for, bindable or not.

## DeepSeek official

| | |
| --- | --- |
| Route id / endpoint | `deepseek-open-platform` → `https://api.deepseek.com/chat/completions` |
| Request shape | `openai-chat-completions` |
| Credential slot | `deepseek-api-key` |
| Bindable | yes |

Admitted model:

| Model id | Display name | Request-shape evidence | Tool calling | Web search tool |
| --- | --- | --- | --- | --- |
| `deepseek-v4-pro` | DeepSeek V4 Pro High | `frozen-request-baseline`, since `adapter revision 1` | `function` | `none` |

Live-verified: none. Not established: `structuredOutput`, `reasoningChannel`, and `usageAttribution` are all `unverified`/`none` — no Run has ever transmitted on this route, so every read-side capability beyond the request-side `answerChannel` (`message-content-string`, also `frozen-request-baseline`) and `reasoningControl` (`deepseek-thinking`, also `frozen-request-baseline`) is unestablished.

`toolCalling` and `webSearchTool` (ADR 0080 §2, §3, §7.8 step 1; this slice is inert — nothing consumes either field yet):

- `toolCalling: function` — `vendor-documentation`, DeepSeek official Tool Calls guide (api-docs.deepseek.com/guides/tool_calls), read 2026-09-11: it documents function tools with `strict` JSON-schema parameters and states tool use is supported in thinking mode from DeepSeek-V3.2; the `tool_choice` values and the thinking-mode round-trip rules are not on that page and remain for the first live item.
- `webSearchTool: none` — `vendor-documentation`, the Tool Calls guide, the Chat Completions reference and the Responses API guide (api-docs.deepseek.com), read 2026-09-10: the Tool Calls guide admits only `"type": "function"` ("the model itself does not execute specific functions"), the Chat Completions reference states "Currently, only functions are supported as a tool", and the Responses API guide marks `web_search` `Ignored`.

## OpenCode Go

`toolCalling` and `webSearchTool` (ADR 0080 §2, §3, §7.8 step 1; this slice is inert — nothing consumes either field yet) are declared the same way on every model on every path below:

- `toolCalling: none` — `unverified` for every model on every path. On `chat/completions`, `deepseek-v4-flash` carries the same value for a more specific reason: ADR 0080 §5.3 records the Owner's own Claude Code session observing a well-formed client tool call through this gateway (`deepseek-v4.1-flash`, Anthropic shape), but that is an informal observation, not a recorded live-test item, so it stays `none` until an item repeats it on the record.
- `webSearchTool: none` — `vendor-documentation`, the OpenCode Go and Zen pages plus the Tools page and the opencode source (`anomalyco/opencode` branch `dev`, `packages/opencode/src/tool/{websearch,webfetch,mcp-websearch}.ts`), read 2026-09-10 and 2026-09-11: neither gateway page prints a capability table or mentions tools, web search or web fetch anywhere, and the source shows `websearch` / `webfetch` are client-side tools of the opencode agent, not of the gateway wire API. The gateway wire API therefore carries no search tool for any model reached through it (ADR 0080 §3, §5.2).

### `chat/completions`

| | |
| --- | --- |
| Route id / endpoint | `opencode-go` → `https://opencode.ai/zen/go/v1/chat/completions` |
| Request shape | `openai-chat-completions` |
| Credential slot | `opencode-go` |
| Bindable | yes |

Admitted models:

| Model id | Display name | Request-shape evidence | Read on |
| --- | --- | --- | --- |
| `deepseek-v4-flash` | DeepSeek V4 Flash | `vendor-documentation`, ADR 0067 · OpenCode Go documentation | 2026-09-06 |
| `deepseek-v4-pro` | DeepSeek V4 Pro（OpenCode Go） | `vendor-documentation`, ADR 0067 · OpenCode Go documentation | 2026-09-06 |
| `glm-5.3-flash` | GLM-5.3-Flash（OpenCode Go） | `vendor-documentation`, OpenCode Go docs · Zen model table | 2026-09-08 |
| `glm-5.3` | GLM-5.3（OpenCode Go） | `vendor-documentation`, OpenCode Go docs · Zen model table | 2026-09-08 |
| `glm-5.2` | GLM-5.2（OpenCode Go） | `vendor-documentation`, OpenCode Go docs · Zen model table | 2026-09-08 |
| `glm-5.1` | GLM-5.1（OpenCode Go） | `vendor-documentation`, OpenCode Go docs · Zen model table | 2026-09-08 |
| `kimi-k3` | Kimi K3（OpenCode Go） | `vendor-documentation`, OpenCode Go docs · Zen model table | 2026-09-08 |
| `kimi-k2.7-code` | Kimi K2.7 Code（OpenCode Go） | `vendor-documentation`, OpenCode Go docs · Zen model table | 2026-09-08 |
| `kimi-k2.6` | Kimi K2.6（OpenCode Go） | `vendor-documentation`, OpenCode Go docs · Zen model table | 2026-09-08 |
| `deepseek-v4-flash-vision-exp` | DeepSeek V4 Flash Vision Exp（OpenCode Go） | `vendor-documentation`, OpenCode Go docs · Zen model table | 2026-09-08 |

The OpenCode Go docs pair is `https://opencode.ai/docs/go/` · `https://opencode.ai/docs/zen/`.

Live-verified, `deepseek-v4-flash` only:

- `answerChannel: message-content-string`, `reasoningChannel: message-reasoning-content`, `usageAttribution: includes-reasoning` — item ids `S40/first-baseline/1` through `S40/first-baseline/8`, observed 2026-09-07.
- `structuredOutput: json-object` — item id `S40/reanalyze-range/1`, observed 2026-09-08.

Every other model on this path is inert (`answerChannel: 'none'`): its request shape is established from the documentation pair and nothing else is, because no live item has been sent to it. `deepseek-v4-pro` on this route is a distinct profile from `deepseek-v4-pro` on `deepseek-open-platform`: the same model id, a different route, and no capability carries across.

Not established: whether any inert model on this path accepts a request at all. Named by the documentation and deliberately absent from this table — the Go page names the product but the Zen model table states no id for it, so there is nothing to key a row by: LongCat-2.0, Hy4 preview, Hy3, Omen Alpha, MiMo-V2.5, MiMo-V2.5-Pro. Also absent: Qwen3.8 Flash — the Go page places it on `/messages`, but the Zen table states no id for it.

### `/messages`

| | |
| --- | --- |
| Route id / endpoint | `opencode-go-messages` → `https://opencode.ai/zen/go/v1/messages` |
| Request shape | `anthropic-messages` |
| Credential slot | `opencode-go` |
| Bindable | no — not in `ExecutionRoute` |

Admitted models, all inert (`answerChannel: 'none'`), request-shape evidence `vendor-documentation`, OpenCode Go docs · Zen model table, read on 2026-09-08:

| Model id | Display name |
| --- | --- |
| `qwen3.7-plus` | Qwen3.7 Plus（OpenCode Go） |
| `qwen3.6-plus` | Qwen3.6 Plus（OpenCode Go） |
| `minimax-m3` | MiniMax M3（OpenCode Go） |
| `minimax-m2.7` | MiniMax M2.7（OpenCode Go） |
| `minimax-m2.5` | MiniMax M2.5（OpenCode Go） |

MiniMax path disagreement, recorded rather than resolved: the Go page places MiniMax on `/messages`; the Zen model table's own table places it on `chat/completions`. The Go page decides, because it is the page that describes this plan; the first live item on one of these ids settles it, and until then declaring the wrong path costs nothing, since no profile on this route can read a response at all.

Live-verified: none. Not established: whether any model on this path accepts a request at all, and which path MiniMax actually answers on.

### `/responses`

| | |
| --- | --- |
| Route id / endpoint | `opencode-go-responses` → `https://opencode.ai/zen/go/v1/responses` |
| Request shape | `openai-responses` |
| Credential slot | `opencode-go` |
| Bindable | no — not in `ExecutionRoute` |

Admitted models, both inert (`answerChannel: 'none'`):

| Model id | Display name | Request-shape evidence | Read on |
| --- | --- | --- | --- |
| `grok-4.6` | Grok 4.6（OpenCode Go） | `vendor-documentation`, OpenCode Go docs · Zen model table · OpenAI Node SDK `src/resources/responses/responses.ts@eecbebe294be7e657c99a34eb104a6a4b507335c` | 2026-09-08 |
| `gpt-5.6-luna` | GPT 5.6 Luna（OpenCode Go） | `vendor-documentation`, OpenCode Go docs · Zen model table · OpenAI Node SDK `src/resources/responses/responses.ts@eecbebe294be7e657c99a34eb104a6a4b507335c` | 2026-09-08 |

Muse Spark id disagreement, excluded rather than admitted: the two pages disagree on the id itself, not on the path — the Go page prints `muse-spark-1.3-contributor` and `muse-spark-1.2-contributor`, the Zen table prints `muse-spark-1.3` and `muse-spark-1.2`. No id is stated by both, so there is none to key a row by. Also excluded: the Zen table's further `/responses` rows — the GPT 5.x family, Grok 4.5, Grok Build — are Zen rather than the Go plan, and this table declares the plan the credential slot reaches.

Live-verified: none. Not established: whether `grok-4.6` or `gpt-5.6-luna` accepts a request at all.

## Google Gemini

Not established: no `google-generate-content` request shape is implemented yet (plan slot S54d), and no OpenCode Go path serves Gemini. Gemini's official endpoint needs a new credential slot, which is plan slot 1c.10; no route or model profile exists for it at this base.

## OpenAI

The `openai-responses` shape the official endpoint would speak already exists in the adapter (assembled for the OpenCode Go `/responses` path). No route or model profile exists for the OpenAI official endpoint at this base: it needs a new credential slot, so it is deferred to plan slot 1c.10. Not established: any admitted model id or capability for the official endpoint.

## Claude

The `anthropic-messages` shape the official endpoint would speak already exists in the adapter (assembled for the OpenCode Go `/messages` path). No route or model profile exists for the Claude official endpoint at this base: it needs a new credential slot and its own header form (`x-api-key` / `anthropic-version`), so it is deferred to plan slot 1c.10. Not established: any admitted model id or capability for the official endpoint.

## Qwen

A chat-completions-compatible shape (DashScope compatible mode) is the shape the official endpoint would speak. No route or model profile exists for the Qwen official endpoint at this base: it needs a new credential slot, so it is deferred to plan slot 1c.10. On the OpenCode Go plan, `qwen3.7-plus` and `qwen3.6-plus` are admitted on `/messages` — see above; both are inert.

## HY

A chat-completions-compatible shape (Hunyuan compatible mode) is the shape the official endpoint would speak. No route or model profile exists for the HY official endpoint at this base: it needs a new credential slot, so it is deferred to plan slot 1c.10. HY is also named on the OpenCode Go plan (`Hy4 preview`, `Hy3`), but the Zen model table states no id for either, so no row is admitted — the Go page names the product, the Zen table states no id for it, so there is nothing to key a row by.

## Credential slots

| Slot | Serves |
| --- | --- |
| `deepseek-api-key` | `deepseek-open-platform` |
| `opencode-go` | `opencode-go`, `opencode-go-messages`, `opencode-go-responses` |

From `CredentialSlot` (`src/service/provider/egress-gate.ts`) and `CredentialSlotId` (`src/shared/protocol.ts`).

A credential slot is a logical slot of the Main Editorial Role. A route on an existing slot moves no credential boundary; a new provider endpoint does, and that change is plan slot 1c.10's. See [ADR 0067](../adr/0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md) for the live-once ledger and the Provider Result Cache.

## How a provider is added

A model is a row: an unverified capability is declared absent (Issue #310). A row is admitted only when the vendor's documentation places the model on a path and states its id verbatim (the rule S54a, S54b, and S54c applied). Anything needing a new credential slot, or matching no implemented request shape, waits for plan slot 1c.10 or 1c.11 (Issue #322).

See Issue #310, Issue #321, and Issue #322.
