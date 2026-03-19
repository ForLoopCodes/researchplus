# Reflection buffer for retries

## Goal

Improve long-running task quality by storing brief self-reflections after failures and using them on the next iteration.

## Papers

- Paper ID: arXiv:2303.11366
- Title: Reflexion: Language Agents with Verbal Reinforcement Learning
- Why relevant: Demonstrates that agents can improve through textual reflection stored in episodic memory rather than weight updates.

## Findings

Reflexion is useful when the loop must keep running across many attempts. A short reflection after each failed search, bad hypothesis, or API error can prevent repeated mistakes without bloating context.

## Candidate implementation

Add a second template for failure reflections with fields like mistake, evidence, fix, and next attempt. Encourage the agent to write one entry whenever a step fails or a result looks weak.

## Validation plan

Check that the protocol explicitly asks for a reflection after failures and that the template is compact enough to reuse repeatedly.

## Result

- Outcome: Research-backed design candidate
- Notes: Best used alongside checkpointing, not instead of it.
