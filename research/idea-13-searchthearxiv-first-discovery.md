# searchthearxiv-first discovery

## Goal

Use searchthearxiv as the primary discovery backend so the loop can find relevant papers without depending on Semantic Scholar search.

## Evidence

- Source: https://searchthearxiv.com/search?query=cs
- Observed shape: `{ papers: [...], authors: [...] }`
- Paper entries include `id`, `score`, `title`, `authors`, `abstract`, `year`, `month`, and `authors_parsed`.

## Findings

The API already returns a compact relevance-ranked paper list with abstract text, which is enough for discovery and first-pass evidence gathering. That makes it a better first-hop source than a heavier citation API when the loop is trying to stay fast and compaction-safe.

## Candidate implementation

Normalize searchthearxiv papers into the existing `search_literature` tool output, keep Semantic Scholar for detail/citation tools, and make the bootstrap prompt clearly say discovery should start here.

## Validation plan

Confirm the MCP `search_literature` tool now returns paper IDs and scores from searchthearxiv and no longer depends on Semantic Scholar search.

## Result

- Outcome: Implemented
- Notes: Search now starts from searchthearxiv and preserves the existing research workflow.
