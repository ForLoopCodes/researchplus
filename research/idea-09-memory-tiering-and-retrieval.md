# Memory tiering and retrieval

## Goal

Use a two-level memory model so short working state stays compact while the longer research archive remains available for recovery.

## Papers

- Paper ID: arXiv:2304.03442
- Title: Generative Agents: Interactive Simulacra of Human Behavior
- Why relevant: Shows that observation, reflection, and retrieval together enable long-horizon behavior.
- Paper ID: arXiv:2310.08560
- Title: MemGPT: Towards LLMs as Operating Systems
- Why relevant: Provides a virtual context management model with hierarchical memory tiers.

## Findings

The core design pattern is a small active state plus a larger archive that gets summarized and retrieved as needed. That is exactly the shape researchplus needs when sessions become long and compaction starts stripping the live context.

## Candidate implementation

Keep the checkpoint extremely small and move richer detail into the `research/` files. Add a short synthesis note whenever the archive gets too large for immediate reuse.

## Validation plan

Verify that the docs and prompt clearly distinguish between the live checkpoint and the durable research archive.

## Result

- Outcome: Research-backed design candidate
- Notes: Strong support for explicit memory tiers.
