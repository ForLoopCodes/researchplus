# Round-robin task queue

## Goal

Prevent the loop from drifting off topic by keeping a large on-theme queue that is rotated in round-robin order.

## Evidence

- ReAct: interleaving reasoning and acting keeps work tightly coupled to evidence.
- Reflexion: failed attempts should feed a small reflection buffer, not a reset.
- AgentBench: long-term reasoning and instruction following are key failure modes for agent systems.

## Findings

A queue-based loop is better than a single linear checklist for long overnight sessions. It lets the agent add new follow-up work when files reveal it, while still keeping the current research theme centered.

## Candidate implementation

Add a live task queue resource, tell the bootstrap prompt to keep at least 200 queued micro-tasks, and rotate across discovery, evidence, implementation, validation, and cleanup.

## Validation plan

Verify the prompt mentions the task queue and round-robin lanes, and that new follow-up work is appended without changing the research theme.

## Result

- Outcome: Implemented
- Notes: The loop now has an explicit queue discipline instead of pretending a single pass is enough.
