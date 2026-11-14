---
status: accepted
---

# Use authority-bearing Plan Envelopes

Ordinary task starts migrated under [ADR 0104](0104-launch-tasks-with-an-immutable-execution-snapshot.md) create their authority and immutable execution snapshot in the start action; their optional estimates carry no authority and create no prepared task. The pre-start Plan Preview and renewed-approval requirements below apply to retained preparation workflows outside that path.

AI7 keeps each frozen execution envelope as an authority-bearing boundary: Run Authorization binds an exact Task Intent and Plan Envelope digest, recorded Plan Adaptations may proceed only inside that unchanged envelope, and material drift suspends work for a versioned Plan Revision and renewed authorization. Effect Approval, Proposal Decision, Review Decision, and Public Release Permission remain independent; this preserves useful autonomy without per-step prompting or silent expansion of agent authority, while legacy Task Composer/workbench/agent-console presentation is not inherited.
