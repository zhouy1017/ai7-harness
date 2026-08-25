# Provider Processing Policy v1

Status: **active minimum baseline; no provider allow rule and no live transmission authorization**

The authority-bearing Policy Document is the canonical serialized [`provider-processing-policy.v1.json`](provider-processing-policy.v1.json), validated by its policy-specific [`provider-processing-policy.v1.schema.json`](provider-processing-policy.v1.schema.json) and selected by the digest-pinned [`active-policy-set.v1.json`](active-policy-set.v1.json). This Markdown file is its human-readable projection. It carries no independent authority; any difference from the canonical JSON is a defect and must be resolved by correcting the projection or issuing a new reviewed policy version, never by silently changing the meaning here.

## Identity and decision

- Policy identity: `provider-processing-policy`
- Version: `v1`
- Lifecycle status: `active`
- Predecessor: none
- Default decision: **deny**
- Provider allow rules: **zero**
- Authorized live transmissions: **zero**

The four categories below are classifications only. Their presence does not make any datum eligible for transmission because v1 contains no provider allow rule.

| Outbound Data Category | Chinese label | v1 transmission authority |
| --- | --- | --- |
| `public-or-synthetic` | 公开或合成内容 | None |
| `unpublished-metadata` | 未公开材料元数据 | None |
| `unpublished-excerpts` | 未公开材料选段 | None |
| `unpublished-full-content` | 未公开材料全文 | None |

An unknown or unmatched provider, scope, category, payload, or rule remains denied. A configured provider, configured credential, readable Run Source Scope, or Run Authorization cannot fill the missing allow rule or override this policy.

## Credential boundary

Credentials are not an Outbound Data Category and are never outbound or model-visible material. Credential values are prohibited from prompts, Session content, generated context, tool schemas or results, generic environments, diagnostics, or any general outbound payload. Outside a separately authorized final protocol consumer, only an opaque Credential Reference may exist. This v1 policy does not authorize credential use or a provider transmission.

## Separate authorities

Provider Processing Policy remains separate from External Export Policy and Public Release Permission. Neither local export eligibility nor permission to release exact material publicly authorizes provider processing. Conversely, this policy would govern controlled provider processing only; it would never grant export or public-release authority.

## v1 consequence

AI7 must send nothing to a live Model Provider under v1. Selecting a provider, endpoint, model, adapter, or credential; implementing a live call; or adding the first provider allow rule requires separate substantive authority, a new immutable policy version, activation through the active-policy-set owner, and separately authorized implementation work.

## Authority basis

This projection preserves the canonical JSON's provenance routes: the [Execution context](../domain/execution/CONTEXT.md), [ADR 0007](../adr/0007-separate-decisions-authority-and-effect-proof.md), [ADR 0016](../adr/0016-proprietary-license-and-local-only-sample-manuscripts.md), [ADR 0018](../adr/0018-tiered-activation-for-agent-authored-revisions.md), the [Harness integration contract](../architecture-v2/HARNESS-INTEGRATION.md), and the accepted [Task Skill / provider boundary](../../kick-in/22-task-skill-capability-trust-provider-boundary.md).
