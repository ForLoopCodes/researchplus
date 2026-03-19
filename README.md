# researchplus MCP server

MCP server for autonomous overnight research loops.

## What this server exposes

- `search_literature`: queries searchthearxiv for relevance-ranked paper discovery.
- `instruction://overnight-research-loop`: strict loop protocol resource for coding agents.
- `instruction://research-memory-template`: markdown template for research memory files.
- `instruction://research-session-checkpoint`: compact live state buffer for compaction-safe continuation.
- `instruction://research-task-queue`: round-robin task queue for long-running sessions.
- `instruction://research-stop-condition`: bounded pause and resume guidance for exact stop targets.
- `overnight_research_bootstrap`: reusable MCP prompt to start the loop.

## Long-running loop pattern

The server is designed for restartable long sessions rather than literal infinite execution in one context window.

- Keep a small checkpoint in `instruction://research-session-checkpoint`.
- Keep a live round-robin queue in `instruction://research-task-queue`.
- Write one `research/` memory file per idea.
- Refresh the checkpoint after meaningful progress and before large task switches.
- Treat compaction or timeout as a normal pause, then resume from the checkpoint and queue.
- Use `research/ideas/` for per-idea notes, `research/evidence/` for supporting passages, `research/checkpoints/current.md` for the live state, `research/queues/live.md` for the work queue, and `research/templates/` for reusable forms.

## Build and run

- `npm run build`
- `npm run start`

For development:

- `npm run dev`
