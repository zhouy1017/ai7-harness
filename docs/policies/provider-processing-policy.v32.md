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

## Channel admission — Wave 23 / #1281

The Owner's #1279 intent and #1281 revision 1 replace individual model tuples with `allowedChannels` on each role and the connection test. Each channel fixes `route`, `endpointHost`, `protocolFamily` and `credentialSlot`; the runtime resolves the exact endpoint from the route profile and checks all four fields. The allowed channels cover Go Chat Completions, DeepSeek official Chat Completions, OpenAI Responses, Claude Messages, Gemini generateContent, and Zen's Chat Completions, Responses and Messages routes.

Any selected model ID on an admitted channel inherits text, streaming and function tools from the implemented adapter protocol. Unknown IDs receive a dynamic ModelProfile; optional context size, reasoning controls and structured output remain undeclared unless a model record supplies them. Static catalogue rows and historical live-test evidence do not grant or refuse runtime capabilities. Explicit text connection tests remain diagnostics, and are not required for model selection.

Each Run still freezes its exact route, endpoint, model ID, credential reference and policy pin. Egress rejects a different model or route, credential release stays bound to its slot, and channel admission grants no source, Apply, export or release authority. Existing source scopes, budget ceilings and search-backend bindings remain enforced. Missing model credentials and missing search setup produce direct Chinese setup reasons; failed background factual-recheck readiness leaves its onceKey unused.

The canonical JSON, closed schema, selected manifest and build/launch pins are synchronized under the Owner's direct Wave 23 authority. Earlier versions retain their original bytes. These changes establish provider-free adapter behavior, not live account availability or successful live validation on an account without credentials. Live model discovery and independent Main/Fast selection remain #1282.
