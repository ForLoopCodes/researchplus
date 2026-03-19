# Bounded planning and ranking

## Goal

Improve idea selection so the loop chooses promising paths without getting stuck in over-exploration.

## Papers

- Paper ID: arXiv:2305.10601
- Title: Tree of Thoughts: Deliberate Problem Solving with Large Language Models
- Why relevant: Shows that exploring and ranking several reasoning paths can improve planning.
- Paper ID: arXiv:2210.03629
- Title: ReAct: Synergizing Reasoning and Acting in Language Models
- Why relevant: Supports a tight reason-act loop with explicit action feedback.

## Findings

A bounded ranking step works well for choosing between candidate ideas, but the loop should not fan out endlessly. The best balance for researchplus is a small fixed shortlist followed by immediate execution and checkpoint refresh.

## Candidate implementation

Ask the agent to produce a tiny ranked shortlist when choosing the next research direction, then commit to the top item and log why it won.

## Validation plan

Confirm the protocol says to keep branching small and always return to execution quickly.

## Result

- Outcome: Research-backed design candidate
- Notes: Best used at decision points, not inside every micro-step.
