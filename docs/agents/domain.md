# Domain Docs

Before exploring domain behavior, read root `CONTEXT-MAP.md`, the relevant context `CONTEXT.md`, root `GLOSSARY.md` for cross-context navigation and collision warnings, and applicable system-wide or context-specific ADRs.

This repository uses a multi-context layout under `docs/domain/`. Canonical term definitions live in context `CONTEXT.md` files. `GLOSSARY.md` is a maintained reference index only and must link to definitions rather than duplicate them.

Use canonical vocabulary in issues, tests, designs, and code. When AI7 and Harness use the same word differently, qualify the term and preserve both definitions instead of silently choosing one. If an output contradicts an accepted ADR, surface the conflict explicitly.

Create context files and ADR directories lazily. `kick-in/` contains migration design material; it is not a substitute for accepted ADRs or canonical glossary definitions.
