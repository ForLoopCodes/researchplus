export type ApiSuccess = {
  ok: true;
  data: unknown;
  fromCache: boolean;
};

export type ApiFailure = {
  ok: false;
  status: number;
  message: string;
  details: unknown;
};

export type ApiResult = ApiSuccess | ApiFailure;

export type CacheEntry = {
  expiresAt: number;
  data: unknown;
};

export type SearchTheArxivPaper = {
  id: string;
  score: number;
  title?: string;
  authors?: string;
  abstract?: string;
  year?: number;
  month?: string;
  authors_parsed?: string[];
};

export type EnhancedPaper = SearchTheArxivPaper & {
  consolidatedScore: number;
  sourceQueries: string[];
  authorCredibility: number;
  temporalBoost: number;
  confidence: number;
  diversityPenalty?: number;
  keywords?: string[];
  provenanceVariant?: string;
  snippet?: string;
  field?: string;
  methodology?: string;
  freshnessScore?: number;
  rankingExplanation?: string;
};

export type SearchTheArxivAuthor = {
  author: string;
  papers?: SearchTheArxivPaper[];
  avg_score?: number;
};

export type SearchTheArxivResult = {
  papers?: SearchTheArxivPaper[];
  authors?: SearchTheArxivAuthor[];
};

export type SearchFacets = {
  years: Record<number, number>;
  authorCounts: Record<string, number>;
  topAuthors: string[];
};

export type SearchHealth = {
  cacheHit: boolean;
  fallbackUsed: boolean;
  variantCount: number;
  networkAttempts: number;
  retried: boolean;
  emptyResults: boolean;
  queryUsed: string;
  circuitState?: "closed" | "open" | "half-open";
  degradedMode?: boolean;
  feedbackApplied?: boolean;
  feedbackKeywords?: string[];
  parallelExecution?: boolean;
  recencyApplied?: boolean;
  rateLimited?: boolean;
  mmrApplied?: boolean;
  suggestedQueries?: string[];
  facets?: SearchFacets;
  sessionContext?: boolean;
  queryComplexity?: "simple" | "moderate" | "complex";
  earlyExit?: boolean;
  semanticCacheHit?: boolean;
  topicClusters?: Record<string, string[]>;
  variantEffectiveness?: Record<string, number>;
  typoCorrections?: string[];
  acronymsExpanded?: boolean;
  queryScope?: "broad" | "narrow" | "moderate";
  methodologyGroups?: Record<string, string[]>;
};

export type SearchTheArxivToolData = {
  requestedQuery: string;
  queryUsed: string;
  attemptedQueries: string[];
  payload: SearchTheArxivResult;
  health: SearchHealth;
};
