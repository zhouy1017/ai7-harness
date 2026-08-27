# AI7 policy documents

This directory is the stable owner for Policy Document artifacts. For Provider Processing and External Export, each versioned JSON file is the authority-bearing canonical serialization of that immutable policy version. Its policy-specific JSON Schema constrains that exact decision, its version-specific Markdown file is a human-readable projection that must not drift, and an active-policy-set manifest selects exact immutable bytes by version, repository-relative path, and SHA-256 digest.

## Target qualification

The JSON value `lifecycleStatus: "active"` describes lifecycle inside that policy version. It does not by itself make a visible file current or canonical for a repository target.

A policy version is repository-current and repository-canonical only at an exact integrated `dev` commit that contains its canonical JSON and whose same-tree active-policy-set entry matches the policy identity, version, repository-relative path, and SHA-256 of those exact bytes. For a scope-mapped policy, that same tree must also bind exactly one trusted operational scope to the applicable pin. On any task branch not yet integrated into `dev`, the same record is `accepted-but-unintegrated`, even when its internal lifecycle status is `active` and all pins validate locally.

## Accepted target selection

| Policy selection | Canonical serialized policy | Schema | Human projection |
| --- | --- | --- | --- |
| Provider Processing v1 — `development-ci` | [`provider-processing-policy.v1.json`](provider-processing-policy.v1.json) | [`provider-processing-policy.v1.schema.json`](provider-processing-policy.v1.schema.json) | [`provider-processing-policy.md`](provider-processing-policy.md) |
| Provider Processing v2 — `fixture-recording` | [`provider-processing-policy.v2.json`](provider-processing-policy.v2.json) | [`provider-processing-policy.v2.schema.json`](provider-processing-policy.v2.schema.json) | [`provider-processing-policy.v2.md`](provider-processing-policy.v2.md) |
| Provider Processing v3 — `ordinary-production` | [`provider-processing-policy.v3.json`](provider-processing-policy.v3.json) | [`provider-processing-policy.v3.schema.json`](provider-processing-policy.v3.schema.json) | [`provider-processing-policy.v3.md`](provider-processing-policy.v3.md) |
| External Export v1 — all scopes | [`external-export-policy.v1.json`](external-export-policy.v1.json) | [`external-export-policy.v1.schema.json`](external-export-policy.v1.schema.json) | [`external-export-policy.md`](external-export-policy.md) |

At a qualifying integrated `dev` target, [`active-policy-set.v3.json`](active-policy-set.v3.json), validated by [`active-policy-set.v3.schema.json`](active-policy-set.v3.schema.json), is the active selection owner. Trusted build/launch authority must bind exactly one of its three Provider Processing scopes for each launch. An ordinary product setting, environment variable, Provider, artifact or Plugin cannot select the scope, and there is no cross-scope fallback. A selection is valid only when scope, policy identity, version, canonical path and SHA-256 digest all match at that exact target; missing or unknown scope denies Provider Processing. Selecting a predecessor for rollback means creating and reviewing the applicable active-set selection; it never means mutating an immutable policy version or restoring revoked authority.

This active set is a closed selection contract, not a runtime mode inside a Policy Document. It creates no trusted launch selector and makes no implementation claim.

When target-qualified as above, Provider Processing v2 denies by default and has exactly one eligible-only rule, `sample1-manual-model-fixture-recording`. Under [ADR 0044](../adr/0044-use-sample1-as-compatibility-and-recording-baseline.md), that rule is exact-source, local-only, human-attended, CI-denied, one-call, non-`unset`-budget, exact-binding and no-fallback. Policy eligibility does not implement or dispatch the future call; follow the [manual recording runbook](../development/manual-model-fixture-recording.md) only after separate action authorization and immediate human intervention.

Provider Processing v1 remains the provider-free `development-ci` selection and denies every live transmission. Provider Processing v3 is default-deny and contains exactly two ordinary-production eligible-only rules: a newly user-initiated Task may create an exact Run through direct authorization or a matching active Default Execution Rule, while a new autonomous background manuscript-analysis dispatch additionally requires a matching active Background Analysis Enrollment. Setup, import, credential configuration, artifact installation or enablement never creates either authority. Moving the same already-authorized Run into the background changes presentation only; a new idle, scheduled, post-checkpoint, import-triggered or cross-Run dispatch needs the Enrollment.

External Export v1 denies by default and contains only one policy-eligibility rule for a platform-native user-selected local-filesystem file Effect over an exact Delivery Package version or Editorial Deliverable Revision; every file still requires its own frozen preparation, exact Effect Intent and Effect Approval, atomic commit/verification, and Effect Receipt or classified outcome. The active set creates no provider, endpoint, model, credential, file-operation implementation, current recording, network/cloud/email destination, learning, publication, Public Release Permission, or outcome proof.

## Immutable predecessor records

Provider Processing v1 and v2, their schemas and human projections, plus [`active-policy-set.v1.json`](active-policy-set.v1.json), [`active-policy-set.v2.json`](active-policy-set.v2.json) and their schemas, remain byte-preserved immutable predecessor history. Active-set v3 references those exact v1/v2 Provider bytes for their retained scopes rather than rewriting them. External Export v1 is selected unchanged by all active-set generations.

## Existing design-phase policy references

[`learning-eligibility-policy.md`](learning-eligibility-policy.md) and [`factual-verification-policy.md`](factual-verification-policy.md) retain their existing design-baseline status and formats. They are not claimed to be migrated to, validated by, or selected through the new v1 schemas and active set.

## Local validation

The schemas deliberately declare JSON Schema Draft 7 and are self-contained. With PowerShell 7.6, validate from the repository root and treat schema-parser errors as failures:

```powershell
$cases = @(
  @('docs/policies/provider-processing-policy.v3.json', 'docs/policies/provider-processing-policy.v3.schema.json'),
  @('docs/policies/active-policy-set.v3.json', 'docs/policies/active-policy-set.v3.schema.json'),
  @('docs/policies/provider-processing-policy.v2.json', 'docs/policies/provider-processing-policy.v2.schema.json'),
  @('docs/policies/active-policy-set.v2.json', 'docs/policies/active-policy-set.v2.schema.json'),
  @('docs/policies/provider-processing-policy.v1.json', 'docs/policies/provider-processing-policy.v1.schema.json'),
  @('docs/policies/external-export-policy.v1.json', 'docs/policies/external-export-policy.v1.schema.json'),
  @('docs/policies/active-policy-set.v1.json', 'docs/policies/active-policy-set.v1.schema.json')
)

foreach ($case in $cases) {
  $valid = Test-Json -LiteralPath $case[0] -SchemaFile $case[1] -ErrorAction Stop
  if (-not $valid) { throw "Schema validation failed: $($case[0])" }
}
```

JSON Schema validates the manifest shape but cannot read repository files to prove a digest. Verify every pin separately against the exact file bytes:

```powershell
$set = Get-Content -Raw -LiteralPath 'docs/policies/active-policy-set.v3.json' | ConvertFrom-Json -ErrorAction Stop
$providerPins = $set.activePolicies.'provider-processing-policy'.scopePins.PSObject.Properties.Value
$pins = @($providerPins) + @($set.activePolicies.'external-export-policy')
foreach ($pin in $pins) {
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $pin.canonicalPath).Hash.ToLowerInvariant()
  if ($actual -cne $pin.sha256) { throw "Digest mismatch: $($pin.canonicalPath)" }
}
```

These are local validation instructions for the policy artifacts, not a new standing workflow or test gate.
