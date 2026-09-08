---
status: proposed
---

# Configure a compatible provider by declaring its format in a repository document, and defer agent-driven discovery

On 2026-09-08 the Owner settled the question [#322](https://github.com/zhouy1017/ai7-harness/issues/322) was blocked on — agent-driven provider discovery is repository tooling, not an in-product capability — and added a tier the Issue lacked: most unlisted providers announce a compatibility format, so configuring one is *selecting that format* and supplying an endpoint, a credential, and model ids, with no agent involved. The plan carries the first tier as slot 1c.10 and the second as 1c.11.

Three facts of the provider layer shape how the first tier can be built. The route and model profiles of ADR 0046 and [#310](https://github.com/zhouy1017/ai7-harness/issues/310) are pure data with evidence on every capability, but they are TypeScript constants, and the identifiers around them — `RemoteExecutionRoute`, `RemoteProviderId`, `CredentialSlotId` — are closed unions that the wire protocol, the Credential Broker, the enrollment helper, and the production connection's schema all rely on. The four request shapes now exist ([#321](https://github.com/zhouy1017/ai7-harness/issues/321)), so a provider that speaks one of them needs no code beyond a declaration. And the `developer-live` policy (`provider-processing-policy.v4`) pins the one live binding exactly — route, endpoint, model, and credential slot — so a configured provider transmits nothing until a policy rule names it, whatever the configuration says.

## Decision

### 1 · Two tiers, and the cheap one first

A provider whose compatibility format AI7 already implements is configured by declaration (this ADR). A provider that fits no implemented format is characterized, if ever, by a discovery agent that runs in this repository and emits a *proposal* for a person to admit; the product ships reviewed configurations only. The second tier is deferred and is not designed here beyond that boundary.

### 2 · A provider configuration is a repository document, and the profiles it implies are generated, not hand-written

A configuration lives at `config/providers/<provider-id>.json` and validates against `config/providers/provider-configuration.v1.schema.json`: the provider id (which becomes the route id), a display name, one `https` endpoint, one request shape from the four the adapter implements, a credential slot id, the credential header form the shape's vendor documents (`authorization: Bearer`, `x-api-key` with `anthropic-version`, or `x-goog-api-key`), the limit policy, the per-turn output cap where the shape requires one, and the model ids with display names — every one with `vendor-documentation` evidence naming the page and the day it was read. A repository tool generates one checked-in TypeScript module from these documents — the route profiles, the model profiles, and the extensions of the closed unions — and the ladder's `check` rung fails when the generated module is not current. The unions stay closed and the wire stays typed; they are extended by generation from reviewed documents, never by hand and never at run time.

### 3 · A declared format is a claim about the request shape and nothing else

A generated profile carries `requestShape` with the document's evidence and every other capability as `none` or `unverified`, exactly as #310 rules and as the OpenCode Go routes landed: no `structuredOutput`, no reasoning channel, no usage attribution until a live test item or vendor documentation is recorded beside it. A configured route is not in `ExecutionRoute` and no Model Role can bind to it. It becomes bindable under `developer-live` only when a provider-processing policy revision names its exact binding, which is the Owner's decision per provider, and its first transmission is a named test item under ADR 0067. The production connection is untouched by this ADR.

### 4 · One credential slot per configured provider, enrolled the one way credentials are enrolled

Each configuration declares its own slot; the slot set of the Credential Broker and of `tools/enroll-dev-credential.mjs` is generated from the same documents, so a slot cannot exist without a reviewed configuration and a configuration cannot exist without a slot. A developer enrolls a key exactly as ADR 0067 established for `opencode-go`: from an untracked key file at the checkout root that the enrollment helper alone reads, into the Protected Secret Store, under a credential reference the document fixes. No agent reads, prints, or copies a key file; CI has no slot; the Credential Broker's release rule does not change.

### 5 · The first configurations are the five the plan names, all inert on arrival

Slot 1c.10 lands the schema, the generator, the `check` verification, the generated slot sets, and the first five documents: Claude official (`anthropic-messages`, `x-api-key` with `anthropic-version`), OpenAI official (`openai-responses`), Qwen through its OpenAI-compatible endpoint (`openai-chat-completions`), HY through its OpenAI-compatible endpoint (`openai-chat-completions`), and Gemini (`google-generate-content`, `x-goog-api-key`). Each document's endpoint, header form, and model ids come from the vendor's own documentation read on a stated day, admitted by the rule S54a used — the vendor page states the id — and every profile is inert under §3. Which of the five is ever transmitted to, in what order, and with which model is a later policy decision per provider; this ADR authorizes no credential, no policy rule, and no live call.

### 6 · Discovery, when it comes, produces a document

A discovery agent (1c.11) probes with synthetic content under a bounded budget, records request and response *shapes* and never a body, and emits a candidate `config/providers/<id>.json` with `establishedBy` on every value, for a person to review and commit. A probe never transmits manuscript content, not even from an admitted SampleBook; a discovered capability is a proposal, not an admission; and the agent never runs inside the product. Nothing more is decided about it here.

## Consequences

- The provider list in `docs/development/provider-support.md` grows by editing documents and regenerating, and the support page can itself be generated from the same source, which 1c.10 may do or leave to its successor.
- The generated module is a build input that is committed; a reviewer reads the document diff, not the generated diff, and `check` guarantees they agree. Regeneration is deterministic, so the generated module never carries a clock reading or a hash of its own.
- A configured provider is visible in the settings surface only when a Model Role can bind to it, which needs the policy rule of §3; until then it exists for the developer-live path alone. The renderer's route labelling reads generated data rather than a hand-written switch, which is a small renderer change 1c.10 makes once.
- The `developer-live` policy's exact-binding rule stays as it is: a configuration is a claim, a policy rule is an authorization, and a test item is a transmission. The three remain three different acts by three different authorities.
- The closed unions gain members per configuration; the production connection's schema `CHECK` on its credential slot does not change, because production binds to no configured provider under this ADR.

## Rejected alternatives

- **An in-product form that configures providers in the settings surface now.** This is the CC Switch shape the Owner named, and it is where the first tier should end up for a shipped product. Rejected for now because the `developer-live` policy forbids a product setting or provider selector from configuring the live provider (`ordinaryProductSettingAllowed: false`, `providerSelectorAllowed: false`, `selectionConfiguresProvider: false`), because a user-entered endpoint has no admitted retention under any policy document, and because the production connection's authority is DeepSeek official's alone. A form that writes the same document shape into the product's store, gated by a policy revision, is the natural successor once the document shape has been used.
- **Loading the documents at run time and widening the unions to strings.** Rejected: the closed unions are what let #310's exhaustiveness hold in the adapter, the broker, and the renderer, and widening them moves every guarantee from the type checker to a validator that runs after the fact.
- **Hand-writing one TypeScript profile per provider, as S54a to S54d did for OpenCode Go.** Rejected as the ongoing pattern: it worked for four routes on one gateway, and the Owner's direction is that adding a provider must not be a code change.
- **A broker whose slot set is any string.** Rejected: the Issue's own warning stands — widening the broker is easy to make and hard to reverse — and generation from reviewed documents gives an open list without an open set.

## Status

Proposed by the Commander on 2026-09-08, against the Owner's decision of the same day on #322. The decisions that are the Owner's alone are §2's choice of a repository document over an in-product form for the first tier and §5's five configurations; §3 and §4 restate rules that already govern the provider layer. Slot 1c.10's T3 Brief is written against this ADR once accepted.
