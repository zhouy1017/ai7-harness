---
status: candidate
---

# Wait by default and stream only foreground interactive editorial dialogue

## Context

AI7 includes both background editorial work and strongly interactive user-side question answering. Streaming every Provider response would make ordinary writing, verification, research, Proposal, automation, and export work noisy and could visually promote incomplete content into apparent business authority. Waiting for every response before showing anything would preserve calmness but make a foreground editorial dialogue feel unresponsive. Inferring presentation from output length, latency, or Provider protocol would make behavior unpredictable, while exposing raw chain of thought would misrepresent protected model internals and create an unsafe durable record.

## Decision

Every task type has an explicit Response Presentation Mode and defaults to `Waiting Only`. Writing, rewriting, factual verification, research, Proposal generation, automation, export, and all other ordinary or background Runs show only exact wait/phase state while awaiting Provider content. Only Interactive Editorial Dialogue bound to one exact Book, work object, and Task context may use `Interactive Stream`, and it displays live content only while foregrounded.

The foreground dialogue may transiently show a user-facing Live Reasoning Summary of approach, checks, evidence comparison, and uncertainty. It never claims raw chain of thought, and it automatically hides before the formal answer begins. Formal prose appends by complete semantic fragment; structured content appends by complete item or row; citations appear only after exact source binding. Proposal content, factual conclusions, authoritative records, and executable actions wait for complete structurally valid objects.

Moving the dialogue to the background projects only `等待回答` and changes no execution semantics. Stop or interruption preserves only complete fragments as an explicitly Incomplete Dialogue Answer; continuation and regeneration are new traceable attempts, never silent Retry or Provider fallback. Dialogue Answer History is a recoverable, non-authoritative joined projection: exact Execution Bindings and Harness Execution Spans connect the Book/Task context to messages and attempt history owned only by the Harness Session Ledger, without copying a transcript into the AI7 Task Ledger or creating a third ledger. Live Reasoning Summary does not enter that projection. Answer content acquires no manuscript, factual, Proposal, learning, or execution authority; a named conversion action starts a separate governed object with provenance and cannot bypass Proposal Decision or Apply. Creating a Task Intent Draft does not itself create the `Task Input / 任务输入` Manuscript Checkpoint purpose.

## Considered options

- Stream every Provider-bound task: rejected because it creates background noise, focus pressure, unstable partial structures, and authority confusion.
- Wait for every task including foreground dialogue: rejected because it makes strongly interactive question answering unnecessarily opaque and unresponsive.
- Infer streaming or expose a per-Run user toggle: rejected because presentation would vary unpredictably and ordinary tasks could escape the product's quiet default.
- Display raw chain of thought during generation and hide it later: rejected because AI7 cannot promise access to hidden reasoning and should not treat protected internals as user-facing truth. Live Reasoning Summary supplies bounded process visibility instead.

## Consequences

The task catalog and presentation layer must carry a stable two-value mode and enforce foreground/background projection separately from execution. Dialogue rendering needs semantic-fragment buffering, atomic structured additions, source-binding gates, attempt identity, a recoverable two-ledger join, and explicit conversion commands. The design accepts some delay before the first formal fragment and preserves less interrupted tail text in exchange for readable output, calm background behavior, traceability, and unchanged authority boundaries.

This decision does not suppress incremental disclosure of independently completed local or source-assurance records such as a settled evidence metadata check. It prohibits progressive Provider-answer content outside the foreground Interactive Editorial Dialogue exception.
