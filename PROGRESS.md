# Current checkpoint

## What's done

- Issue #178 / PR #180 and lifecycle Issue #182 / PR #183 are integrated through exact `dev@082f0112ab79654340dcd0719fce0430e84b67b2`. The P0 Electron close-crash and unattended teardown repair remains owned by the production and existing Journey code.
- Issue #184 synchronizes the two stale J-12 documentation claims with that implementation. `README.md` and `docs/development/source-checkout.md` now describe only the public ready/missing projections and one stable opaque Credential Reference across save, restart, replacement, removal, and final restart; setup Node never reads a raw OS-store value.
- The failure-only cleanup description now names the exact pinned Electron executable in Node mode, opaque-reference-only stdin, suppressed stdout/stderr, and native deletion confirmation. It does not turn cleanup into a scenario oracle or secret-reading path.
- The implementation comparison remains exact: `e2e/run-j12.mjs` contains no `readSyntheticCredentialDirect` path, binds the same reference through public product state, uses `ELECTRON_RUN_AS_NODE=1`, passes only `credentialReference`, ignores child output, is deadline-bounded, and fails closed when deletion is not confirmed.
- This is a four-path documentation-only change. It changes no runtime, E2E, workflow, schema, protocol, policy, authority, privacy, credential, Provider, or supported-Journey behavior.

## What's next

- Complete documentation validation, open a Draft pull request, then use one normal Ready transition for the Markdown-only route occurrence; the product matrix must remain skipped. Squash-integrate only on unchanged exact `dev`.
- After Issue #184 closes, create its separate five-path lifecycle Issue/PR and route current state to Issue #176 / Draft PR #177.
- Record the Owner's Actions-usage supersession on Issue #176, rebase and fully revalidate PR #177 on the newest exact `dev`, then require its one normal paired Gate before integration and lifecycle closure. Issue #47 remains blocked until then.

## Key decisions

- A public ready/missing projection plus stable opaque reference proves the credential lifecycle without giving setup Node or the controller secret-reading authority.
- Direct native deletion is a failure-only, bounded cleanup fallback and receives no secret. Product removal remains preferred.
- Actions usage is Owner-monitored and is not queried or treated as a development/Gate precondition. Paired Gate, privacy, lifecycle, Provider/recording, and `main` boundaries remain.

## Unresolved matters or blockers

- No documentation blocker is known. Integration drift or any need to change code or a fifth path is a stop condition.
- Provider calls, execution-time secret resolution, exact `sample1` recording, fixture admission, publication, release, and `main` promotion remain outside autonomous work.

## Safe Resume Prompt

```text
Resume Issue #184 from exact dev@082f0112 on docs/184-sync-j12-secret-proof. Validate only README.md, docs/development/source-checkout.md, PROGRESS.md, and HANDOFF.md; compare the protected-secret wording to e2e/run-j12.mjs, confirm no stale exact-value claims, local links, and git diff --check. Keep PR #177 untouched. Open Draft, then permit one route-only Ready occurrence with the product matrix skipped; squash-merge only on unchanged dev. After closure, execute the separate five-path Issue #184 lifecycle sweep before recording the usage-precondition supersession and rebasing PR #177. Do not query usage, call a Provider, resolve an execution secret, record sample1, admit a fixture, publish, release, or promote main.
```
