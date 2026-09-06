---
status: accepted
---

# Authorize the OpenCode Go development credential with live-once provider testing

On 2026-09-06 the Owner placed an OpenCode Go subscription key in the main checkout root as `opencodego.key.txt` and authorized development agents to use it for Provider-related testing and integration while its quota remains, on one condition: the same or a similar test item is executed live at most once, and its result is saved and reused afterwards. This decision records that authorization and the rules that make it safe. It amends the binding and capture clauses of [ADR 0065](./0065-admit-a-developer-live-provider-processing-scope.md) and changes nothing about CI, the Gate, production defaults, or [ADR 0044](./0044-use-sample1-as-compatibility-and-recording-baseline.md) recording.

## Facts about the Provider

OpenCode Go is a fixed-price subscription over the OpenCode Zen gateway. Its OpenAI-compatible chat-completions endpoint is `https://opencode.ai/zen/go/v1/chat/completions` with `Authorization: Bearer <key>`; DeepSeek, GLM, and Kimi models use that endpoint, while Qwen and MiniMax use the Anthropic-compatible `/messages` path and GPT and Grok models use `/responses`. The plan includes `deepseek-v4-flash` and `deepseek-v4-pro`. Usage is capped by rolling dollar limits (about $12 per five hours, $30 per week, $60 per month); when a limit is exhausted, requests are blocked until it resets. These facts were read from the OpenCode documentation on 2026-09-06 and are re-verified by the slice that implements the route.

## Decision

### The credential

- The key lives only in the untracked file `opencodego.key.txt` at the main checkout root; `.gitignore` excludes `*.key.txt`. It is never committed, copied into a worktree, or moved into any repository path.
- No agent reads, prints, echoes, hashes, quotes, or copies the value, and no command line, environment dump, Issue, receipt, log, diagnostic, or tool result may contain it. The only reader is the developer credential helper the implementing slice adds (`tools/enroll-dev-credential.mjs`), which reads the file, stores the value in the product's Protected Secret Store under the `opencode-go` slot without any output, and answers `--check` with `present` or `absent` only. Ad hoc `curl` or script calls that carry the key are prohibited.
- The Credential Broker releases the value only against a `transmit-remote` ticket for a bound Run under the `developer-live` scope, exactly as ADR 0065 already requires.

### The binding

Under the `developer-live` scope the Main Editorial Role binds route `opencode-go`, endpoint `https://opencode.ai/zen/go/v1/chat/completions`, model `deepseek-v4-flash`, through the existing OpenAI-compatible adapter generalized by route and endpoint. The `deepseek-open-platform` route remains the production binding and is unchanged. A second Go model reachable through the same chat-completions endpoint may be used only as a separately named comparison test item; models behind the `/messages` or `/responses` paths are out of scope until an adapter exists. The optional `x-opencode-session` header may carry the opaque technical Session identity and nothing else.

### Live once, then replay

- Every live call is a **test item** with an identifier `<slice>/<purpose>/<n>`, a one-line purpose, the model, the prompt-contract digest, and the request digest.
- A host-level **Provider Result Cache** at `C:\Users\Chooo\Playground\ai7-harness-provider-cache\` (outside every checkout and worktree, never committed, never uploaded) stores each raw response, its usage, and timestamps keyed by model and request digest, beside a **Provider Test Ledger** (`ledger.jsonl`) listing every test item.
- Before any live call the tooling consults both: an identical request (same model and request digest) replays from the cache; a test item whose identifier already has a result is refused unless the Owner has marked it stale in the ledger. "Similar" means the same purpose under the same contract version with only trivially different inputs; an agent that needs a variation names a new item and justifies it in its report.
- The cache is the one permitted capture under the `developer-live` scope; ADR 0065's "no capture" clause is amended accordingly. Cache entries reach the repository only through the S41 fixture-generation tool with human review of every free-text field.

### Quota

A limit response (HTTP 429 or the gateway's limit error) is classified `quota-exhausted`, recorded in the ledger with the reset window when the response states one, and ends the Run as a Provider Account Limit; no retry loop, no fallback to Zen balance, no second model. Agents report the state and stop. The ADR 0065 Run Budget Ceiling still applies per Run, and the ledger's cumulative usage lets the Commander see spend before dispatching another live item.

### Who may run live

A Worker whose Brief names provider testing, and the Commander for a smoke check, only through the tooling above. CI, the E2E Gate, and every hosted execution never receive the key.

## Consequences

- Plan slice S40 implements the `opencode-go` route, the endpoint generalization, the enrollment helper, the ledger, the cache, and the quota classification; S41 promotes cache entries into fixtures. Until S40 integrates, no live route exists and the key stays unused.
- The ledger and cache make every live test reproducible and countable; the Owner's constraint becomes a mechanical check, not an agent's memory.
- The development-interval binding no longer depends on a DeepSeek open-platform key; the DeepSeek route stays available for production.

## Rejected alternatives

- **Read the key from the file at run time with an environment variable.** Rejected: the value would enter generic environments and tool output, which every existing rule forbids.
- **Let agents decide case by case whether a test is "similar".** Rejected: the ledger makes the decision visible and the refusal automatic.
- **Use the key from CI.** Rejected: the Gate stays provider-free.
