# researchplus MCP server

MCP server for autonomous overnight research loops.

## What this server exposes

- `search_literature`: queries searchthearxiv for relevance-ranked paper discovery.
- `get_paper_details`: fetches `/paper/{paper_id}` details and abstracts.
- `get_paper_batch`: fetches multiple papers at once via `/paper/batch`.
- `search_snippets`: searches `snippet/search` for exact evidence passages.
- `traverse_citations`: traverses `/paper/{paper_id}/citations` or `/paper/{paper_id}/references`.
- `instruction://overnight-research-loop`: strict loop protocol resource for coding agents.
- `instruction://research-memory-template`: markdown template for research memory files.
- `instruction://research-session-checkpoint`: compact live state buffer for compaction-safe continuation.
- `instruction://research-task-queue`: round-robin task queue for long-running sessions.
- `overnight_research_bootstrap`: reusable MCP prompt to start the loop.

The request layer retries transient 429, 502, 503, and 504 responses with exponential backoff and honors `Retry-After` when present.

`search_literature` now uses searchthearxiv for discovery, while paper detail and citation tools still use Semantic Scholar for deeper metadata and graph traversal.

## Long-running loop pattern

The server is designed for restartable long sessions rather than literal infinite execution in one context window.

- Keep a small checkpoint in `instruction://research-session-checkpoint`.
- Keep a live round-robin queue in `instruction://research-task-queue`.
- Write one `research/` memory file per idea.
- Refresh the checkpoint after meaningful progress and before large task switches.
- Treat compaction or timeout as a normal pause, then resume from the checkpoint and queue.

## Environment

Copy `.env.example` to `.env` and set `SEMANTIC_SCHOLAR_API_KEY` when available.

Unauthenticated requests also work with lower service limits from Semantic Scholar.

## Build and run

- `npm run build`
- `npm run start`

For development:

- `npm run dev`
