---
status: accepted
date: 2026-11-24
deciders: Owner
amends: ADR 0067, ADR 0073 §4 and ADR 0080 §5 (four development credential slots for the three 0.7.9 uses below)
decides: one full recording, one full live test and a local human-test preset for 0.7.9
---

# 0108 · Authorize four test credentials for 0.7.9 recording and human testing (#1540)

The Owner authorized the Commander on 2026-11-24 to use four Owner-supplied test credentials for the three uses below. The development Credential References come from the provider records, as in ADR 0073 §4. The enrollment helper also accepts these slots with the product-minted Credential Reference of a production connection for the packaged live test and the local human-test preset.

| File label | Development credential slot |
| --- | --- |
| `gemini` | `google-gemini` |
| `opencodego` | `opencode-go` |
| `openai` | `openai-platform` |
| `claude` | `anthropic-claude` |

## Authorized uses

1. **One full recording.** Finish and accept 0.7.9 on the integration branch for Owner review. After the Owner confirms that review passed and the Commander gives the go-ahead, run the four-provider recording and its separate search step. The whole 0.7.9 candidate, including the reviewed recordings, then merges into `dev`. Capture every missing or stale call point, after replaying existing recordings against 0.7.9. Keep the stages and tool turns of each task with one provider. Allocate estimated tokens across OpenAI, Anthropic Claude, Google Gemini and OpenCode Go in the ratio 4:4:1:1. The Commander supplies the Owner with the call-point inventory and allocation before recording. Developer-live binds the explicit provider from the named validation case and selects the model by the actual task role. Recording-only admissions require a named case and proof of the admitted Public SampleBook or a bounded, approved public or synthetic input. This applies to scoped dialogue, learning, connection testing, factual recheck and the other underlying Flash services. Each send uses the existing live-once Ledger and Result Cache. Recordings enter the repository through the existing [fixture conversion and review procedure](../development/manual-model-fixture-recording.md).
2. **One full live test.** Run the reduced matrix across the four providers and the actual task roles from [ADR 0107](0107-rename-fast-interaction-to-underlying-flash-role-and-unify-low-level-model-services.md), using the model choices below. Foreground Pro covers whole-book analysis and one review. Foreground Flash covers editorial dialogue and every other call point assigned to that role. Underlying Pro covers learning curation, and Underlying Flash covers its registered call points. Skip each call point in a provider and role cell already exercised by the recording. Widen the matrix where a problem is found. Live results stay in a local report and are ineligible as Gate evidence.
3. **Local human-test preset.** After 0.7.9 reaches `dev`, the human-test folder is refreshed, and the Owner has opened 0.7.9 and completed the in-app upgrade, preset the four connections and model choices below in the local human-test data root. Store credential values only in this Windows user's Protected Secret Store and retain them there after the live test for human testing.

| Provider and tier | Model | Request family | Documented choices | Wire for `high` | Evidence read 2026-11-24 |
| --- | --- | --- | --- | --- | --- |
| OpenAI Pro | `gpt-6.2-sol` | Responses | `low`, `medium`, `high`, `xhigh`, `max` | `reasoning.effort` | [OpenAI deployment checklist](https://developers.openai.com/api/docs/guides/deployment-checklist#set-up-reasoningeffort) |
| OpenAI Flash | `gpt-6.1-terra` | Responses | `none`, `low`, `medium`, `high`, `xhigh`, `max` | `reasoning.effort` | [OpenAI Terra model page](https://developers.openai.com/api/docs/models/gpt-6.1-terra) |
| Anthropic Claude Pro | `claude-opus-5-5` | Messages | `low`, `medium`, `high`, `xhigh`, `max` | `output_config.effort` with `thinking.type=adaptive` | Account discovery with [Claude effort documentation](https://platform.claude.com/docs/en/build-with-claude/effort#recommended-effort-levels) as fallback |
| Anthropic Claude Flash | `claude-sonnet-5-5` | Messages | `low`, `medium`, `high`, `xhigh`, `max` | `output_config.effort` with `thinking.type=adaptive` | Account discovery with [Claude effort documentation](https://platform.claude.com/docs/en/build-with-claude/effort#recommended-effort-levels) as fallback |
| Google Gemini Pro | `gemini-4-argon` | generateContent | `low`, `medium`, `high` | `generationConfig.thinkingConfig.thinkingLevel` | [Google generateContent thinking guide](https://aistudio.google.com/docs/thinking?generate-content=true) |
| Google Gemini Flash | `gemini-4-hydrogen` | generateContent | `low`, `medium`, `high`, `xhigh` | `generationConfig.thinkingConfig.thinkingLevel` | [Google generateContent thinking guide](https://aistudio.google.com/docs/thinking?generate-content=true) |
| OpenCode Go Pro | `gemini-4-argon` | Native generateContent | `low`, `medium`, `high` | `generationConfig.thinkingConfig.thinkingLevel` | [OpenCode Go endpoints](https://opencode.ai/docs/console/go/#endpoints), [native Gemini request](https://opencode.ai/docs/console/api/inference/#gemini), [Go catalogue row](https://github.com/anomalyco/models.dev/blob/dev/providers/opencode-go/models/gemini-4-argon.toml) |
| OpenCode Go Flash | `deepseek-v4.1-flash` | Chat Completions | `low`, `high`, `max` | `reasoning_effort` | Documented by the [Go catalogue row](https://github.com/anomalyco/models.dev/blob/dev/providers/opencode-go/models/deepseek-v4.1-flash.toml) and [DeepSeek request reference](https://api-docs.deepseek.com/api/create-chat-completion/). Gateway acceptance is unverified. |

The Owner confirmed these models and selected `high` for the recording, reduced live test and human-test preset. Ordinary role defaults use the provider default until the editor chooses a level. Product recommendations remain as previously configured. One authorized discovery query per provider confirmed the Google, OpenAI and Anthropic model IDs for the test accounts. The Go Argon model uses the Go native route for production and recording. The first authorized recording probes establish whether those account routes accept the planned requests.

## Credential and automation boundary

Only `tools/enroll-dev-credential.mjs` reads the Owner-local labelled file. It selects one `label=value` or `label: value` line in place and writes the value directly to the Protected Secret Store. Connection records carry references. Credential values stay out of packages, installers, repositories and logs.

The Owner also released the two model-backed search slots `search-openai` and `search-anthropic` for the separate final search step of the recording. The Commander enrolls each using its provider's labelled value under the search slot's own development reference. Search queries and connection tests remain subject to their own product admission and the Commander's go-ahead.

Automated tests, Journeys, the hosted Gate, the nightly queue and CI remain provider-free. They never carry these credentials or make live model calls. This authorization extends [ADR 0067](0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md) for the stated 0.7.9 uses.
