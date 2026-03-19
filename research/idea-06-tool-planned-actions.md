# Tool-planned actions

## Goal

Make the loop better at deciding when to call tools and how to fold results back into the next step.

## Papers

- Paper ID: arXiv:2302.04761
- Title: Toolformer: Language Models Can Teach Themselves to Use Tools
- Why relevant: Shows that models can learn when to call tools, what to pass, and how to incorporate results into future generation.

## Findings

For researchplus, the useful lesson is not tool use alone but disciplined tool use. The agent should pick a tool, make one call, ingest the result, and immediately update its checkpoint before moving on.

## Candidate implementation

Strengthen the prompt so every external action is followed by a terse state update. That keeps the loop from drifting into long ungrounded reasoning and makes recovery after compaction easier.

## Validation plan

Confirm the bootstrap prompt emphasizes one action at a time and a short state update after each external call.

## Result

- Outcome: Research-backed design candidate
- Notes: Best fit for the server’s existing search/detail/citation tools.
