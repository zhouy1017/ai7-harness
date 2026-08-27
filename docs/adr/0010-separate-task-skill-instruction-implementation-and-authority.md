---
status: superseded
---

# Separate Task Skill instruction, implementation, and authority

This historical Task Skill package/projection model is fully superseded by [ADR 0045](./0045-preserve-native-dsh-artifacts-behind-ai7-authority-sidecars.md). The paragraph below remains as history. Its safety principle survives: an artifact, manifest, sidecar, validation result, installation or enablement grants no authority, and every AI7 Capability use still requires exact per-Run activation plus independent AI7 enforcement. The parallel AI7 Task Skill package/runtime owner does not survive.

AI7 preserves Task Skills as immutable declarative packages but separates their Harness instructional projection, code-bearing Capability Implementations, and per-Run Task Skill Activation. Provenance-derived trust plus content-addressed admission and validation constrain an enablement Authority Ceiling; exact Capability Grants then intersect that ceiling with the Task Intent, Plan Envelope, Run Source Scope, Provider Resolution Plan, policies, and runtime constraints, enforced at both tool and service boundaries. This prevents a skill, tool, plugin, provider, manifest, or validation result from granting itself authority while retaining locally authored skills, bounded provider processing, and Harness extensibility.
