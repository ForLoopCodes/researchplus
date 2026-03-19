# Batch retrieval and snippet evidence

## Goal

Make the loop better at handling many related papers and verifying exact source passages.

## Papers / docs

- Source: Semantic Scholar Graph API documentation
- Why relevant: The API supports `/paper/batch` for multiple papers and `/snippet/search` for text passages.
- Paper ID: arXiv:2308.03688
- Title: AgentBench: Evaluating LLMs as Agents
- Why relevant: Reinforces that agent systems need evaluation, instruction following, and recovery patterns to remain usable.

## Findings

Batch retrieval reduces round trips when the loop already has multiple paper IDs. Snippet search adds a way to verify exact supporting text, which is especially helpful when abstracts are too thin or ambiguous.

## Candidate implementation

Keep `get_paper_batch` for efficient metadata pulls and `search_snippets` for exact evidence lookup. Use them together when the loop is ranking candidate papers or checking claims before writing memories.

## Validation plan

Confirm both tools are exposed, accept the expected inputs, and return structured payloads that match the API shapes.

## Result

- Outcome: Research-backed design candidate
- Notes: This is the next strongest upgrade after checkpointing and retry/backoff.
