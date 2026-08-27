# Current checkpoint

## What's done

- Issue #108 corrected the current-implementation snapshots in `docs/architecture-v2/README.md`, `ARCHITECTURE.md`, `HARNESS-INTEGRATION.md`, and `MIGRATION.md`, plus `docs/ui-ux-v2/README.md` and `HANDOFF.md`.
- The stable documents now consistently record integrated provider-free J-01 new-Book identity disclosure and interrupted-import continuity/reconciliation, complete provider-free J-02 10M bounded editing, and complete provider-free J-08 Recovery Workspace.
- No design, domain, policy, ADR, source, schema, test, workflow, dependency, Provider, artifact, Issue, PRD, release, or protected-line state changed. Archive sweep: none; Git history is sufficient for the superseded wording.

## What's next

- If Issue #108 is not yet integrated, Commander reviews and integrates only its seven-path documentation diff against then-current `dev`; once it is integrated, the Owner resolves Issue #38's exact native Workflow-definition carrier and the Commander refreshes #38 against then-current `dev` before considering any implementation dispatch.
- Owner decisions for #42 (Product Data Location/macOS mechanics), #88 (artifact source/carrier/adapter), and #91 (production Provider binding) remain separate and out of scope.

## Key decisions

- The implemented interval is not full J-01 or the broader Book Workspace. Native artifact lifecycle, Provider/egress, retrieval/Exact Fetch, covered analysis/Result Sets, Background Analysis Enrollment execution, metrics, Proposal/Effect, and AI7 Apply remain unimplemented.
- The current `WORKFLOW_PROFILE` / `workflow_profiles.definition_json` persistence remains a legacy/future migration gap; it is not evidence of the successor native-definition/AI7-projection seam.
- Provider setup, credential configuration, import, artifact acquisition, installation, and enablement authorize neither a Provider call nor a Run. Imported updates remain inert until explicit adoption or the narrow eligible Artifact Update Rule.

## Unresolved matters or blockers

- Issue #108 introduces no implementation authority. No action on `main`, Provider work, artifact installation, implementation, or release is authorized by this documentation correction.
- Requested binding: Claude Sonnet 5 / medium. Actual same-class fallback: OpenAI Codex `gpt-5.6-terra` / high, because Claude Sonnet 5 was unavailable in the Commander window.

## Safe Resume Prompt

```text
If Issue #108 is not yet integrated, Commander: review and integrate only its seven-path documentation snapshot correction, keeping the provider-free J-01/J-02/J-08 implementation interval distinct from future design. Once integrated, Owner: resolve Issue #38's exact native Workflow-definition carrier while AI7 retains durable phases, gates, signoffs, and transitions; Commander: refresh #38 against then-current dev before considering implementation dispatch. Do not expand into Provider, artifact, source, or main work.
```
