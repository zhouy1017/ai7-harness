# AI7 policy documents

This directory is the stable owner for Policy Document artifacts. For the Provider Processing and External Export minimum baselines, the versioned JSON file is the authority-bearing canonical serialization of that immutable policy version. Its policy-specific JSON Schema constrains the exact v1 decision, the Markdown file is a human-readable projection that must not drift, and the active-policy-set manifest can select exact immutable bytes by version, repository-relative path, and SHA-256 digest.

## Target qualification

The JSON value `lifecycleStatus: "active"` describes lifecycle inside that policy version. It does not by itself make a visible file current or canonical for a repository target.

A policy version is repository-current and repository-canonical only at an exact integrated `dev` commit that contains its canonical JSON and whose same-tree active-policy-set entry matches the policy identity, version, repository-relative path, and SHA-256 of those exact bytes. On any task branch not yet integrated into `dev`, the same record is `accepted-but-unintegrated`, even when its internal lifecycle status is `active` and all pins validate locally.

## Restrictive v1 policy records

| Policy | Canonical serialized policy | Schema | Human projection |
| --- | --- | --- | --- |
| Provider Processing v1 | [`provider-processing-policy.v1.json`](provider-processing-policy.v1.json) | [`provider-processing-policy.v1.schema.json`](provider-processing-policy.v1.schema.json) | [`provider-processing-policy.md`](provider-processing-policy.md) |
| External Export v1 | [`external-export-policy.v1.json`](external-export-policy.v1.json) | [`external-export-policy.v1.schema.json`](external-export-policy.v1.schema.json) | [`external-export-policy.md`](external-export-policy.md) |

At a qualifying integrated `dev` target, [`active-policy-set.v1.json`](active-policy-set.v1.json), validated by [`active-policy-set.v1.schema.json`](active-policy-set.v1.schema.json), is the active selection owner for these two policies. A policy selection is valid only when its policy identity, version, canonical path, and SHA-256 digest all match at that exact target. Selecting a predecessor for rollback means changing the active-set selection through reviewed policy activation; it never means mutating an immutable policy version.

When target-qualified as above, Provider Processing v1 denies by default, has exactly zero provider allow rules, and authorizes no live transmission. External Export v1 denies by default and contains only one policy-eligibility rule for a platform-native user-selected local-filesystem file Effect over an exact Delivery Package version or Editorial Deliverable Revision; every file still requires its own frozen preparation, exact Effect Intent and Effect Approval, atomic commit/verification, and Effect Receipt or classified outcome. The active set creates no provider, endpoint, model, credential, file-operation implementation, network/cloud/email destination, Public Release Permission, or outcome proof.

## Existing design-phase policy references

[`learning-eligibility-policy.md`](learning-eligibility-policy.md) and [`factual-verification-policy.md`](factual-verification-policy.md) retain their existing design-baseline status and formats. They are not claimed to be migrated to, validated by, or selected through the new v1 schemas and active set.

## Local validation

The schemas deliberately declare JSON Schema Draft 7 and are self-contained. With PowerShell 7.6, validate from the repository root and treat schema-parser errors as failures:

```powershell
$cases = @(
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
$set = Get-Content -Raw -LiteralPath 'docs/policies/active-policy-set.v1.json' | ConvertFrom-Json -ErrorAction Stop
foreach ($pin in $set.activePolicies.PSObject.Properties.Value) {
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $pin.canonicalPath).Hash.ToLowerInvariant()
  if ($actual -cne $pin.sha256) { throw "Digest mismatch: $($pin.canonicalPath)" }
}
```

These are local validation instructions for the policy artifacts, not a new standing workflow or test gate.
