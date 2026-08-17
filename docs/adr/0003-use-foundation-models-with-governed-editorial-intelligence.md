---
status: accepted
---

# Use foundation models with governed editorial intelligence, not LLM training

AI7 invokes replaceable provided Foundation Models and does not train, fine-tune, or update their weights from editorial material. It approaches editor-comparable delivery quality through an AI7-owned Editorial Intelligence Layer: professionally supervised knowledge, exact source retrieval, approved memory, task skills, structured policies, tools, provenance, feedback, and evaluations. This keeps professional knowledge inspectable and portable across model providers while reducing editorial workload without transferring publication authority to the model.

## Consequences

Embeddings, indexes, retrieval, reranking, prompt/context construction, and provider-independent memory are allowed when their inputs and outputs remain governed and traceable; they are not treated as LLM training. Any future proposal to create training datasets, LoRA/DPO artifacts, fine-tune weights, or send editorial evidence into provider training requires an explicit product re-charter and an ADR that supersedes this decision.
