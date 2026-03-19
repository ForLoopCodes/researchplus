# Deliberate planning tree

## Goal

Improve decision quality when the loop has to choose between several candidate ideas or search paths.

## Papers

- Paper ID: arXiv:2305.10601
- Title: Tree of Thoughts: Deliberate Problem Solving with Large Language Models
- Why relevant: Shows that exploring multiple reasoning paths with self-evaluation improves planning and search tasks.

## Findings

A strict single-path loop can miss better alternatives. Lightweight branching is valuable when ranking ideas, but it should stay bounded so it does not explode context or delay execution.

## Candidate implementation

Have the agent generate a small fixed set of candidate next actions, score them, and commit only the best one. Keep the branch count low to preserve the compact loop.

## Validation plan

Check whether the prompt supports a tiny internal ranking step before each major action.

## Result

- Outcome: Research-backed design candidate
- Notes: Best for idea selection and prioritization, not for every micro-step.
