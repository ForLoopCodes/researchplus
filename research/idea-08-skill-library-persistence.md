# Skill library persistence

## Goal

Keep successful actions reusable across long runs by treating them like stored skills rather than one-off generations.

## Papers

- Paper ID: arXiv:2305.16291
- Title: Voyager: An Open-Ended Embodied Agent with Large Language Models
- Why relevant: Uses an ever-growing skill library plus iterative prompting to improve over time without forgetting.

## Findings

Voyager suggests that long-running agents improve when they preserve successful procedures and reuse them later. For researchplus, that means promoting repeated good patterns into stable loop instructions or reusable templates.

## Candidate implementation

Record proven loop tactics in the checkpoint or a compact synthesis file: how to search, how to summarize, how to rank ideas, and how to recover from rate limits.

## Validation plan

Check that the protocol encourages reusing a known-good pattern rather than re-deriving it each cycle.

## Result

- Outcome: Research-backed design candidate
- Notes: Good fit for turning successful runs into durable operating habits.
