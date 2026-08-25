# Foundation-model and Editorial-intelligence Invariant

Status: **accepted product and architecture invariant**

## Product thesis

AI7 does not aim to train an LLM. It combines replaceable provided Foundation Models with knowledge, materials, decisions, feedback, and revisions supervised, produced, approved, or modified by professional editors. The goal is editor-comparable delivery quality with materially less repetitive work, while editors retain judgment, source authority, and publication authority.

## AI7-owned Editorial Intelligence Layer

The durable product value lives outside model weights:

- exact Book and Series sources with revision provenance;
- Professional Editorial Knowledge and explicit style/policy entries;
- Editorial Dimensions and task-specific rubrics;
- approved House Editorial Memory and explicitly promoted Series Knowledge Revisions;
- Learning Eligibility Policy and complete Learning Lineage;
- Task Skills, tools, workflows, plans, approvals, and effect controls;
- provider-neutral context assembly and retrieval;
- deterministic fixtures, evaluations, and editor-review outcomes.

Foundation Models supply general language and reasoning capability through Harness adapters. Changing the model or provider must not erase AI7's professional knowledge or governance.

## Harness Agent Behavior Layer

DeepSeek Harness is not only transport for the Foundation Model. AI7 studies and uses its framework to shape how an agent gathers context, plans, chooses and sequences tools, coordinates subagents, follows policy, requests approval, recovers from interruptions, records evidence, and finishes a task. Those choices form a versioned Harness Behavior Composition using profiles, bundles, presets, plugins, prompt/context providers, tools, policies, workflows, and session hooks.

Agent Behavior Improvement is evaluation-driven revision of that composition. It is distinct from Editorial Learning, which changes AI7-owned professional knowledge and memory, and from Model Training, which changes LLM weights. This accepted purpose does not by itself authorize dynamic packages, unrestricted tools, or silent agent self-modification; Question 29 decides the production capability and authority boundary.

## Allowed adaptation mechanisms

- Structured preferences and policies.
- Retrieval over exact sources and approved knowledge.
- Versioned memory candidates and human promotion.
- Prompt/context composition with logged inputs.
- Embedding indexes and reranking used as retrieval infrastructure.
- Model selection, role routing, and fallback under AI7 policy.
- Evaluation-driven changes to skills, tools, prompts, retrieval, and workflows.

## Outside the product thesis

- Pretraining or fine-tuning an LLM on manuscripts or editorial behavior.
- LoRA, DPO, reinforcement-learning, or weight-update pipelines.
- Silent provider training or retention of editorial material.
- Treating raw logs, comments, diffs, or the Working Corpus as a training dataset.
- Claiming that a stronger Foundation Model substitutes for approved editorial knowledge or professional review.

## Model-design review questions

Every future model-facing design must answer:

1. Which provided Foundation Model capability is being used, and through which replaceable Harness boundary?
2. Which AI7-owned professional knowledge, source revisions, memory, and policies become model-visible?
3. Is every model-visible input reconstructable through provenance and the Learning Audit Log where applicable?
4. Does the design improve editor-comparable delivery quality or reduce workload at a measurable user journey?
5. Can the provider/model change without losing AI7 knowledge or changing Book/Series authority?
6. Could any data flow be mistaken for model training or provider data reuse? If so, the design fails this invariant until corrected.
7. Which versioned Harness Behavior Composition shapes the agent, what behavior evidence justifies it, and how can it be rolled back without changing editorial truth?

See [ADR 0003](../docs/adr/0003-use-foundation-models-with-governed-editorial-intelligence.md).
