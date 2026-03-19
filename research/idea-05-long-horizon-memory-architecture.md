# Long-horizon memory architecture

## Goal

Make the server better at extended multi-day work by separating short-lived working context from durable memory.

## Papers

- Paper ID: arXiv:2304.03442
- Title: Generative Agents: Interactive Simulacra of Human Behavior
- Why relevant: Demonstrates a memory pipeline with observation, reflection, and retrieval that supports long-horizon behavior.

## Findings

The strongest takeaway is that long-running behavior depends on storing raw observations, synthesizing them into reflections, and retrieving only the relevant parts later. That suggests researchplus should keep a tiny working checkpoint and a larger set of research memories.

## Candidate implementation

Use the checkpoint as the active working state and the `research/` files as the durable archive. When the archive grows, summarize older notes into a short synthesis file so the agent can recover quickly.

## Validation plan

Verify the loop has both a short checkpoint resource and a longer memory store, with clear guidance on when to use each.

## Result

- Outcome: Research-backed design candidate
- Notes: Strong evidence for a tiered memory model rather than one giant prompt.
