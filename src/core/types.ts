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

export type SearchTheArxivAuthor = {
  author: string;
  papers?: SearchTheArxivPaper[];
  avg_score?: number;
};

export type SearchTheArxivResult = {
  papers?: SearchTheArxivPaper[];
  authors?: SearchTheArxivAuthor[];
};

export type SearchHealth = {
  cacheHit: boolean;
  fallbackUsed: boolean;
  variantCount: number;
  networkAttempts: number;
  retried: boolean;
  emptyResults: boolean;
  queryUsed: string;
};

export type SearchTheArxivToolData = {
  requestedQuery: string;
  queryUsed: string;
  attemptedQueries: string[];
  payload: SearchTheArxivResult;
  health: SearchHealth;
};
