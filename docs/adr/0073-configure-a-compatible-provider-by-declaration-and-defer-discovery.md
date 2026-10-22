---
status: accepted
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

A generated profile carries `requestShape` with the declaration’s evidence and every other capability as `none` or `unverified` until established beside that exact binding. [ADR 0094 §1](0094-unified-multi-provider-runtime-global-learning-agent-and-word-track-changes-intake.md#1-one-model-service-interface-and-one-governed-runtime) admits the unified channel/model selector and intended multi-provider production set. A declaration alone remains unbindable: implemented protocol/capability support, selected Provider Processing policy and a ready protected credential must agree before any exact task transmission. Developer-live first-use evidence remains governed by ADR 0067; no in-product selector changes its operational scope.

### 4 · One credential slot per configured provider, enrolled the one way credentials are enrolled

Each configuration declares its own slot; the slot set of the Credential Broker and of `tools/enroll-dev-credential.mjs` is generated from the same documents, so a slot cannot exist without a reviewed configuration and a configuration cannot exist without a slot. A developer enrolls a key exactly as ADR 0067 established for `opencode-go`: from an untracked key file at the checkout root that the enrollment helper alone reads, into the Protected Secret Store, under a credential reference the document fixes. No agent reads, prints, or copies a key file; CI has no slot; the Credential Broker's release rule does not change.

### 5 · Initial declarations and their successor production selection

Slot 1c.10 established the schema, generator, checks and initial official provider declarations. [ADR 0094 §1](0094-unified-multi-provider-runtime-global-learning-agent-and-word-track-changes-intake.md#1-one-model-service-interface-and-one-governed-runtime) now owns the intended production selector set, including Zen, Go and the official Anthropic, Gemini, OpenAI and DeepSeek services. Each binding still needs reviewed vendor evidence and separately activated runtime policy; no catalogue entry alone grants capability, enrollment or transmission.

### 6 · Discovery, when it comes, produces a document

A discovery agent (1c.11) probes with synthetic content under a bounded budget, records request and response *shapes* and never a body, and emits a candidate `config/providers/<id>.json` with `establishedBy` on every value, for a person to review and commit. A probe never transmits manuscript content, not even from an admitted SampleBook; a discovered capability is a proposal, not an admission; and the agent never runs inside the product. Nothing more is decided about it here.

## Consequences

- The provider list in `docs/development/provider-support.md` grows by editing documents and regenerating, and the support page can itself be generated from the same source, which 1c.10 may do or leave to its successor.
- The generated module is a build input that is committed; a reviewer reads the document diff, not the generated diff, and `check` guarantees they agree. Regeneration is deterministic, so the generated module never carries a clock reading or a hash of its own.
- The unified selector may show the intended channels/models with honest readiness; only capability- and policy-eligible bindings may be selected for a Task (ADR 0094). Credentials and endpoint detail remain in Settings, with compact channel/model choice in the workbench.
- The `developer-live` policy's exact-binding rule stays as it is: a configuration is a claim, a policy rule is an authorization, and a test item is a transmission. The three remain three different acts by three different authorities.
- Closed unions remain generated from reviewed declarations. Production-connection schema changes needed for ADR 0094 belong to its coherent implementation successor, not this documentation change.

## Rejected alternatives

- **Arbitrary unreviewed endpoints and implicit activation.** Rejected. ADR 0094 accepts an in-product channel/model selector over admitted declarations; configuration, policy selection, capability proof and task transmission remain separate acts. A selector cannot change trusted operational scope or waive the final egress check.
- **Loading the documents at run time and widening the unions to strings.** Rejected: the closed unions are what let #310's exhaustiveness hold in the adapter, the broker, and the renderer, and widening them moves every guarantee from the type checker to a validator that runs after the fact.
- **Hand-writing one TypeScript profile per provider, as S54a to S54d did for OpenCode Go.** Rejected as the ongoing pattern: it worked for four routes on one gateway, and the Owner's direction is that adding a provider must not be a code change.
- **A broker whose slot set is any string.** Rejected: the Issue's own warning stands — widening the broker is easy to make and hard to reverse — and generation from reviewed documents gives an open list without an open set.

## Status

Proposed by the Commander on 2026-09-08, against the Owner's decision of the same day on #322. The decisions that are the Owner's alone are §2's choice of a repository document over an in-product form for the first tier and §5's five configurations; §3 and §4 restate rules that already govern the provider layer. Accepted by the Owner on 2026-09-10 by merging PR #377, after the evaluation of ADR 0078 found it compatible with the editor-facing surface specification (`设置 › 模型服务` shows a configured provider only when a Model Role can bind to it, V2-UX-MSET-006 and MSET-007); the status line was set to `accepted` in the pull request of ADR 0074. Slot 1c.10's T3 Brief (#435) is written against this ADR.
