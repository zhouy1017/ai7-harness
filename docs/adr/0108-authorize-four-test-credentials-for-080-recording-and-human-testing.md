---
status: accepted
date: 2026-11-24
deciders: Owner
amends: ADR 0067, ADR 0073 §4 and ADR 0080 §5 (four development credential slots for the three 0.8.0 uses below)
decides: one full recording, one full live test and a local human-test preset for 0.8.0
---

# 0108 · Authorize four test credentials for 0.8.0 recording and human testing (#1540)

The Owner authorized the Commander on 2026-11-24 to use four Owner-supplied test credentials for the three uses below. The development Credential References come from the provider records, as in ADR 0073 §4. The enrollment helper also accepts these slots with the product-minted Credential Reference of a production connection for the packaged live test and the local human-test preset.

| File label | Development credential slot |
| --- | --- |
| `gemini` | `google-gemini` |
| `opencodego` | `opencode-go` |
| `openai` | `openai-platform` |
| `claude` | `anthropic-claude` |

## Authorized uses

1. **One full recording.** Use OpenCode Go with `gemini-4-argon` for Pro and `deepseek-v4.1-flash` for Flash. The Commander supplies the Owner with the call-point inventory before recording. Keep every existing recording that 0.8.0 still replays and capture only missing or stale call points. Record against the admitted Public SampleBook under the existing [fixture conversion and review procedure](../development/manual-model-fixture-recording.md). Recordings enter the repository only through that procedure.
2. **One full live test.** Start with the reduced matrix across the four providers and the four roles from [ADR 0107](0107-rename-fast-interaction-to-underlying-flash-role-and-unify-low-level-model-services.md), using the model choices below. For each provider, exercise each Pro role with whole-book analysis, one review and editorial dialogue, and exercise every Flash call point in its assigned Flash role. Widen the matrix where a problem is found. Live results stay in a local report and are ineligible as Gate evidence.
3. **Local human-test preset.** After 0.8.0 reaches `dev`, the human-test folder is refreshed, and the Owner has opened 0.8.0 and completed the in-app upgrade, preset the four connections and model choices below in the local human-test data root. Store credential values only in this Windows user's Protected Secret Store and retain them there after the live test for human testing.

| Provider | Pro | Flash |
| --- | --- | --- |
| Google Gemini | `gemini-4-argon` | `gemini-4-hydrogen` |
| OpenCode Go | `gemini-4-argon` (catalogue ID `opencode-go/gemini-4-argon`) | `deepseek-v4.1-flash` |
| OpenAI | `gpt-5.6-sol` | `gpt-5.6-luna` |
| Anthropic Claude | `claude-opus-5` | `claude-haiku-4-5` |

The Owner confirmed the Argon and Hydrogen choices on 2026-11-24. One authorized query through the product's Gemini model discovery confirmed the two Google Gemini IDs for the test account. These choices apply to the stated 0.8.0 uses. The provider records add catalogue entries and keep their existing recommended model lists.

## Credential and automation boundary

Only `tools/enroll-dev-credential.mjs` reads the Owner-local labelled file. It selects one `label=value` or `label: value` line in place and writes the value directly to the Protected Secret Store. Connection records carry references. Credential values stay out of packages, installers, repositories and logs.

Automated tests, Journeys, the hosted Gate, the nightly queue and CI remain provider-free. They never carry these credentials or make live model calls. This authorization extends [ADR 0067](0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md) for the stated 0.8.0 uses.
