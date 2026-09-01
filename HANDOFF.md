# Current handoff

Issue #166 is the active CI-governance restoration task from exact `origin/dev@12f66e229037b33d04c039ff9e3e679e00772b95`. ADR 0057 and the current runbooks record the Owner-authorized return to a usage-observed, integration-ready paired Hosted Gate. The workflow configuration now contains the exact real order J-01 → J-02 → J-08 → J-12 → J-15; J-03 remains dormant and absent until Issue #47's atomic executable cutover.

Exact workflow `342459594` remains `disabled_manually` and unrun throughout Issue #166 authoring and integration. The Commander may enable it only after the truthful configuration is integrated, the scoped lifecycle sweep is complete, and fresh checks find no Ready pull request or queued/in-progress run. Enablement performs no dispatch, probe, rerun, or backfill. No Provider action is authorized or performed.

## Safe Resume Prompt

```text
Complete Issue #166's local static/document validation and Draft PR integration while workflow 342459594 remains disabled. Run the scoped lifecycle sweep, then recheck exact workflow identity/state, zero queued/in-progress runs, no Ready PR, and the authoritative usage baseline before enabling without dispatch. Never run dormant J-03, use Hosted CI as a debugger, expand billing permissions silently, or touch Issue #47's separate product/authority scope.
```
