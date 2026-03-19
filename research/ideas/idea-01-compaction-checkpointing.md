# Compaction-safe checkpointing

## Goal

Make the loop survive context loss by forcing the agent to persist a compact checkpoint it can reload after compaction or timeout.

## Papers

- Paper ID: arXiv:2310.08560
- Title: MemGPT: Towards LLMs as Operating Systems
- Why relevant: Shows that limited context windows can be handled with virtual context management and interrupt-driven control flow.

## Findings

MemGPT treats context like a managed resource instead of a fixed buffer. That maps directly to this server: the loop should maintain a small, structured checkpoint containing the current objective, latest completed action, blockers, and the next action.

## Candidate implementation

Add a `instruction://research-session-checkpoint` resource and tell the bootstrap prompt to refresh it before and after each meaningful work burst. The checkpoint should be short enough to survive compression and explicit enough to resume without rereading everything.

## Validation plan

Confirm the prompt text tells the agent to treat compaction as normal and to resume from the checkpoint. Then verify the new resource is exposed in the MCP server.

## Result

- Outcome: Research-backed design candidate
- Notes: Best fit for long-running autonomous loops because it directly addresses context limits.
