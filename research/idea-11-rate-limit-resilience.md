# Rate-limit resilience

## Goal

Keep overnight research runs alive when the Semantic Scholar API returns 429 or transient server errors.

## Papers

- Paper ID: arXiv:2308.03688
- Title: AgentBench: Evaluating LLMs as Agents
- Why relevant: Identifies long-term reasoning and instruction-following as core obstacles for usable agents, which aligns with handling recovery rather than failing fast.
- Paper ID: arXiv:2302.04761
- Title: Toolformer: Language Models Can Teach Themselves to Use Tools
- Why relevant: Reinforces that external tool use should be deliberate and recoverable.

## Findings

A long-running research loop is only as durable as its ability to recover from transient tool failures. Backoff, retry, and a compact checkpoint prevent a single 429 from interrupting the whole run.

## Candidate implementation

Retry transient HTTP failures with exponential backoff and respect `Retry-After` when available. Keep the checkpoint current so the loop can continue after a delayed retry or a restarted session.

## Validation plan

Verify the request layer retries 429/503/504 responses and still returns useful structured failures when retries are exhausted.

## Result

- Outcome: Research-backed design candidate
- Notes: Directly addresses the rate limit that blocked the first research pass.
