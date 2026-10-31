# Provider Processing v32

This ordinary-production successor of [v31](provider-processing-policy.v31.json) records Issue #1221's two bounded terms under ADR 0094 §2 and ADR 0095 §6. The [canonical JSON](provider-processing-policy.v32.json) and [closed schema](provider-processing-policy.v32.schema.json) own every term. [Active set v23](active-policy-set.v23.json) selects it, together with unchanged development-ci v1, fixture-recording v2, developer-live v24 and External Export v2. Every other v31 term, rule, category, tool and bound is unchanged. Predecessor bytes remain immutable.

## Search fallback chain and bounded resend

These terms live in the review rule's factual-verification `research` block only. The enrolled background factual recheck keeps its v31 block.

`backendSelection` keeps its frozen single-backend wording. The sibling `backendFallback` admits a chain of at most one item. That item is a different backend among those that are measured and shipped at this head: `search-tinyfish`, `search-brave`, `search-parallel`, `search-deepseek` (the legacy Messages backend) and `search-bochaai`, whose registry profiles were measured on 2026-10-15. The fallback is frozen in the Plan beside `webToolsBackend` (backend id, host, configuration digest and credential reference) and bound in the Run's search binding. Each submission it carries is attributed `fallback-from` in the research ledger. It adds no endpoint or credential beyond the review rule's `platformTools.websearch` list. The unmeasured DeepSeek direct search candidate stays unselectable, and no model fallback exists: every role binding keeps `fallbackAllowed: false`.

`knownOrUnknownFailedSubmissionResendAllowed` changes from `false` to a bounded term. A failed submission may be resent at most once, and only when the failure is one of these:

- a transport failure before any response byte;
- an HTTP 5xx;
- an HTTP 429, after honouring Retry-After.

A submission that was accepted, and may therefore be billed, is never resent. An in-stream or post-acceptance unknown stays unknown and is never resent. A resend repeats the same canonical query and is not a new distinct query against the per-claim budget of three (`maximumDistinctCanonicalQuerySubmissions`). This declaration supplies no consumer; the fallback and resend execution is a separate slice.

## Protocol-family admission

The Main Editorial Role and the Fast Interaction Role admit bindings in every protocol family the adapter implements. Each binding states its route, endpoint and model id as its provider document declares them:

- **Claude 官方 Messages** (`anthropic-claude`, slot `anthropic-claude`): `claude-opus-5`, `claude-fable-5-1`, `claude-sonnet-5`, `claude-haiku-4-5`.
- **Gemini 官方 generateContent** (`google-gemini`, slot `google-gemini`): `gemini-3.8-flash`, `gemini-3.1-pro-preview`, `gemini-2.5-pro`. The binding endpoint is the models collection the document declares; the adapter appends `/{model}:generateContent`. The document's open questions about the shape are unchanged, and this binding is admission only.
- **OpenCode Zen**, one `opencode-zen` slot for its three routes:
  - chat completions: `deepseek-v4.1-flash`, `glm-5.3-flash`, `kimi-k3`, `qwen3.8-max`;
  - Messages: `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`;
  - Responses: `gpt-6.1-sol`, `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-luna`.
- **OpenAI Responses for Main**: `gpt-5.6-luna` and `gpt-5.6-sol`, which Fast already admitted.

Every rule's `providerBinding.allowedRoutes` and the connection test's `allowedBindings` widen to these bindings. A reviewed runtime configuration record inside an admitted family therefore needs no further policy version. The Difficult Escalation and Frontier roles stay as in v31. `userConfiguredBindingAuthorizesTransmission` stays `false`.

Admission is not choice. The runtime model table's `policyBaseline` equals these bindings exactly, so a newly admitted model is disposed by its own evidence (`untested:text` until text evidence exists). Its `ordinaryProduction` choices are a subset that the launch verifier checks, and they are unchanged by this declaration. A model becomes choosable only with a reviewed runtime record, its credential slot and its evidence.

## CI and activation

Development-ci remains unchanged v1: default deny, no remote Provider allow rule, zero authorized live transmissions. This declaration and its selection supply no consumer implementation, live-call evidence or readiness claim. The exact implementation candidate still passes the existing provider-free verification ladder and guest Journeys before Owner merge.
