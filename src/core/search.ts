import {
  type ApiFailure,
  type ApiResult,
  type CacheEntry,
  type SearchHealth,
  type SearchTheArxivResult,
  type SearchTheArxivToolData
} from "./types.js";

const searchTheArxivBaseUrl = process.env.SEARCH_THE_ARXIV_BASE_URL?.trim() || "https://searchthearxiv.com/search";
const searchTheArxivCacheTtlMs = Number(process.env.SEARCH_THE_ARXIV_CACHE_TTL_MS || "1800000");
const searchTheArxivCache = new Map<string, CacheEntry>();
const apiRetryCount = 3;
const apiRetryBaseDelayMs = 1000;
const stopWords = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with"]);

const sleep = async (durationMs: number): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, durationMs));
};

const retryAfterMs = (header: string | null): number | null => {
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const timestamp = Date.parse(header);
  if (!Number.isNaN(timestamp)) return Math.max(0, timestamp - Date.now());

  return null;
};

const toErrorMessage = (details: unknown, fallback: string): string => {
  if (typeof details === "string" && details.trim()) return details;
  if (details && typeof details === "object" && "error" in details) {
    const value = (details as { error?: unknown }).error;
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
};

export const normalizeSearchQuery = (query: string): string => query.trim().replace(/\s+/g, " ");

const compactKeywords = (query: string): string => {
  const tokens = normalizeSearchQuery(query)
    .toLowerCase()
    .split(" ")
    .filter(token => token && !stopWords.has(token))
    .slice(0, 8);

  return tokens.join(" ");
};

export const buildSearchQueryVariants = (query: string): string[] => {
  const normalized = normalizeSearchQuery(query);
  const focused = compactKeywords(normalized);
  const variants = [
    normalized,
    `"${normalized}"`,
    normalized.replace(/\s+/g, "+"),
    focused,
    focused ? `${focused} benchmark` : "",
    `${normalized} llm agent`,
    `${normalized} benchmark`
  ];

  return Array.from(new Set(variants.map(variant => normalizeSearchQuery(variant)).filter(Boolean)));
};

const parseSearchTheArxivResponse = (details: unknown): SearchTheArxivResult => {
  if (details && typeof details === "object") return details as SearchTheArxivResult;
  if (typeof details !== "string") return {};

  const parseCandidate = (candidate: string): SearchTheArxivResult | null => {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as SearchTheArxivResult) : null;
    } catch {
      return null;
    }
  };

  const trimmed = details.trim();
  if (!trimmed) return {};

  const parsedDirect = parseCandidate(trimmed);
  if (parsedDirect) return parsedDirect;

  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return {};

  return parseCandidate(trimmed.slice(jsonStart, jsonEnd + 1)) || {};
};

const hasSearchResults = (payload: SearchTheArxivResult): boolean => {
  const papers = Array.isArray(payload.papers) ? payload.papers : [];
  const authors = Array.isArray(payload.authors) ? payload.authors : [];
  return papers.length > 0 || authors.length > 0;
};

const buildHealth = (queryUsed: string, attemptedQueries: string[], networkAttempts: number, cacheHit: boolean, fallbackUsed: boolean, payload: SearchTheArxivResult): SearchHealth => ({
  cacheHit,
  fallbackUsed,
  variantCount: attemptedQueries.length,
  networkAttempts,
  retried: networkAttempts > 1,
  emptyResults: !hasSearchResults(payload),
  queryUsed
});

export const requestSearchTheArxiv = async (query: string): Promise<ApiResult> => {
  const attemptedQueries = buildSearchQueryVariants(query);
  let lastFailure: ApiFailure | null = null;
  let networkAttempts = 0;

  for (let queryIndex = 0; queryIndex < attemptedQueries.length; queryIndex += 1) {
    const queryVariant = attemptedQueries[queryIndex];
    const isLastVariant = queryIndex === attemptedQueries.length - 1;
    const url = new URL(searchTheArxivBaseUrl);
    url.searchParams.set("query", queryVariant);

    const cacheKey = `searchthearxiv:${url.toString()}`;
    const cached = searchTheArxivCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const payload = parseSearchTheArxivResponse(cached.data);
      if (hasSearchResults(payload) || isLastVariant) {
        return {
          ok: true,
          data: {
            requestedQuery: query,
            queryUsed: queryVariant,
            attemptedQueries,
            payload,
            health: buildHealth(queryVariant, attemptedQueries, networkAttempts, true, queryVariant !== normalizeSearchQuery(query), payload)
          } satisfies SearchTheArxivToolData,
          fromCache: true
        };
      }
    }

    for (let attempt = 0; attempt <= apiRetryCount; attempt += 1) {
      try {
        networkAttempts += 1;
        const response = await fetch(url, { headers: { accept: "application/json" } });
        const isJson = (response.headers.get("content-type") || "").toLowerCase().includes("application/json");
        const details = isJson ? (await response.json()) as unknown : await response.text();

        if (!response.ok) {
          if (attempt < apiRetryCount && [429, 502, 503, 504].includes(response.status)) {
            const delayMs = retryAfterMs(response.headers.get("retry-after")) ?? Math.min(8000, apiRetryBaseDelayMs * 2 ** attempt);
            await sleep(delayMs);
            continue;
          }

          lastFailure = {
            ok: false,
            status: response.status,
            message: toErrorMessage(details, `HTTP ${response.status}`),
            details
          };
          break;
        }

        const payload = parseSearchTheArxivResponse(details);
        searchTheArxivCache.set(cacheKey, { data: payload, expiresAt: Date.now() + (Number.isFinite(searchTheArxivCacheTtlMs) ? searchTheArxivCacheTtlMs : 1800000) });
        if (hasSearchResults(payload) || isLastVariant) {
          return {
            ok: true,
            data: {
              requestedQuery: query,
              queryUsed: queryVariant,
              attemptedQueries,
              payload,
              health: buildHealth(queryVariant, attemptedQueries, networkAttempts, false, queryVariant !== normalizeSearchQuery(query), payload)
            } satisfies SearchTheArxivToolData,
            fromCache: false
          };
        }

        break;
      } catch (error) {
        if (attempt < apiRetryCount) {
          await sleep(Math.min(8000, apiRetryBaseDelayMs * 2 ** attempt));
          continue;
        }

        const message = error instanceof Error ? error.message : "Unknown network error";
        lastFailure = { ok: false, status: 0, message, details: error };
      }
    }
  }

  if (lastFailure) return lastFailure;
  return {
    ok: false,
    status: 0,
    message: "Request retries exhausted",
    details: { query }
  };
};
