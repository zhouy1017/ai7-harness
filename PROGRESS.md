# Current checkpoint

## What's done

- Issue #178 / PR #180 integrated the bounded P0 Electron window-close crash repair into exact `dev@6dc7d465bee9bbfe521ffb0d4b3494e9fcf6ce76`. Exact candidate `5a32c18e5c8eed8a206cc0872cde5e4a8ea2a31c` passed fresh Windows `doctor -> bootstrap -> build -> e2e:all` and paired Gate run `33684294651`; Windows and macOS each passed J-01, J-02, J-08, J-12, and J-15.
- The integrated implementation caches live renderer identity before Electron destruction, keeps a surviving Book workspace usable, proves unique reopen through public J-01, cancels invalidated completion frames and requires fresh visible-ready frames, uses the public Book route in J-12, bounds Browser/CDP/service teardown, and keeps setup Node from reading a raw protected credential.
- Issue #182 closes the resulting documentation lifecycle node. The outgoing Issue #178 root `PROGRESS.md` is archived byte-identically under `docs/archive/issue-178-electron-main-crash-2026-09-03/`; the outgoing root `HANDOFF.md` remains in Git history only. No product behavior, authority, workflow, test surface, or dependency changes here.
- Actions usage is Owner-monitored and is not a development, Ready, Gate, or integration precondition. Paired Gate, privacy, lifecycle, Provider/recording, and `main` boundaries remain unchanged.

## What's next

- Create and integrate one separately scoped documentation-only Issue correcting the stale J-12 protected-secret proof wording in `README.md` and `docs/development/source-checkout.md`, then close that Issue's scoped lifecycle.
- Record the Owner's Actions-usage supersession on Issue #176, rebase Draft PR #177 onto the newest exact `dev`, preserve the integrated #178 owners except for #176's authorized sidecar deltas, run fresh exact-head Windows completion, and permit one normal paired Gate before integration and lifecycle closure.
- Only after #176 lifecycle closes, refresh and implement Issue #47's provider-free J-03 authorization-recording slice. Continue the accepted provider-free sequence toward the separate exact `sample1` human-attended recording handoff.

## Key decisions

- The #178 repair and evidence now belong to integrated implementation, existing Journey owners, the merged Issue/PR, and the named archive checkpoint; root routing no longer carries its authoring instructions.
- The J-12 documentation correction is intentionally separate from this five-path lifecycle unit. Issue #176 remains Draft work until that documentation node closes.
- No Provider call, credential-secret resolution for execution, exact `sample1` recording, fixture admission, publication, release, or `main` promotion is authorized during autonomous development.

## Unresolved matters or blockers

- No current blocker prevents the separate J-12 documentation synchronization.
- Issue #47 remains blocked until Issue #176 and its lifecycle integrate. Actual recording remains a later human-attended action with fresh contemporaneous confirmation.

## Safe Resume Prompt

```text
Resume from current origin/dev. First create the separately scoped documentation-only Issue that corrects README.md and docs/development/source-checkout.md to state that setup Node observes only the public ready/missing projection and stable opaque reference and never reads the raw protected credential; integrate and close its lifecycle without product tests. Then record the Owner's Actions-usage supersession on Issue #176, rebase Draft PR #177 onto newest dev, preserve the integrated #178 owners exactly except for #176's authorized sidecar deltas, and run fresh exact-head Windows doctor -> bootstrap -> build -> e2e:all before its one Ready paired Gate. Keep Issue #47 blocked through #176 lifecycle. Do not query usage, call a Provider, record sample1, admit a fixture, publish, release, or promote main.
```
