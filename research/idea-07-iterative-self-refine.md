# Iterative self-refine

## Goal

Improve answer quality during long loops by giving the agent a built-in revision step after each draft or plan.

## Papers

- Paper ID: arXiv:2303.17651
- Title: Self-Refine: Iterative Refinement with Self-Feedback
- Why relevant: Demonstrates that iterative feedback and refinement can improve outputs without extra training.

## Findings

A research loop benefits from a short revise-and-resubmit pattern when it generates summaries, hypotheses, or research notes. Instead of freezing the first draft, the agent should critique it briefly and refine it once before saving.

## Candidate implementation

Add a reminder to the protocol that every important summary should be self-checked for missing evidence, weak assumptions, or poor structure before the checkpoint is updated.

## Validation plan

Look for one explicit self-check step in the instructions for summaries and final writeups.

## Result

- Outcome: Research-backed design candidate
- Notes: Especially useful for checkpoint text and idea ranking.
