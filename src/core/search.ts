// Enhanced search: circuit breaker, semantic expansion, PRF, session memory, topic clustering
// Papers: 2503.12228, 1810.07354, 2406.00057, 2406.03592, 2104.04830, 2507.07061, 2010.12626

import {
  type ApiResult,
  type CacheEntry,
  type EnhancedPaper,
  type SearchFacets,
  type SearchHealth,
  type SearchTheArxivAuthor,
  type SearchTheArxivPaper,
  type SearchTheArxivResult,
  type SearchTheArxivToolData
} from "./types.js";

enum CircuitState { CLOSED, OPEN, HALF_OPEN }
enum QueryIntent { DISCOVERY, VALIDATION, BENCHMARK, IMPLEMENTATION, SYNTHESIS }
enum QueryComplexity { SIMPLE, MODERATE, COMPLEX }

const searchTheArxivBaseUrl = process.env.SEARCH_THE_ARXIV_BASE_URL?.trim() || "https://searchthearxiv.com/search";
const searchTheArxivCacheTtlMs = Number(process.env.SEARCH_THE_ARXIV_CACHE_TTL_MS || "1800000");
const searchTheArxivCache = new Map<string, CacheEntry>();
const semanticCacheIndex = new Map<string, { tokens: Set<string>; cacheKey: string }>();
const semanticCacheThreshold = 0.7;
const apiRetryCount = 3;
const apiRetryBaseDelayMs = 1000;
const stopWords = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with"]);
const currentYear = new Date().getFullYear();

const circuitBreaker = { state: CircuitState.CLOSED, failures: 0, threshold: 5, resetTimeout: 30000, lastFailureTime: 0 };

const tokenBucket = {
  tokens: 20,
  maxTokens: 20,
  refillRate: 10,
  lastRefill: Date.now(),
  refillIntervalMs: 60000
};

const intentKeywords: Record<QueryIntent, string[]> = {
  [QueryIntent.DISCOVERY]: ["survey", "review", "overview", "state-of-the-art", "recent", "advances", "trends"],
  [QueryIntent.VALIDATION]: ["evaluation", "comparison", "empirical", "study", "analysis", "evidence"],
  [QueryIntent.BENCHMARK]: ["benchmark", "dataset", "metric", "performance", "accuracy", "results"],
  [QueryIntent.IMPLEMENTATION]: ["implementation", "code", "algorithm", "method", "technique", "approach"],
  [QueryIntent.SYNTHESIS]: ["framework", "architecture", "system", "model", "design", "unified"]
};

const domainExpansions: Record<string, string[]> = {
  "llm": ["large language model", "gpt", "transformer", "foundation model"],
  "rag": ["retrieval augmented generation", "retrieval-augmented", "knowledge retrieval"],
  "agent": ["autonomous agent", "multi-agent", "agentic", "tool use"],
  "embedding": ["vector representation", "dense retrieval", "semantic embedding"],
  "transformer": ["attention mechanism", "self-attention", "encoder decoder"],
  "bert": ["bidirectional encoder", "masked language model", "pretrained"],
  "diffusion": ["denoising", "score-based", "generative model"],
  "reinforcement": ["rl", "reward learning", "policy gradient"],
  "contrastive": ["contrastive learning", "self-supervised", "representation learning"],
  "graph": ["graph neural network", "gnn", "knowledge graph"],
  "retrieval": ["information retrieval", "search", "dense retrieval", "semantic search"],
  "summarization": ["abstractive", "extractive", "text summarization"],
  "classification": ["text classification", "sentiment", "categorization"],
  "generation": ["text generation", "language generation", "autoregressive"],
  "reasoning": ["chain-of-thought", "cot", "logical reasoning", "inference"],
  "multimodal": ["vision-language", "cross-modal", "multi-modal"],
  "fine-tuning": ["finetuning", "adaptation", "transfer learning", "lora", "peft"],
  "prompt": ["prompting", "in-context learning", "few-shot", "zero-shot"],
  "memory": ["long-term memory", "episodic memory", "memory-augmented"],
  "hallucination": ["factuality", "grounding", "faithfulness", "factual consistency"]
};

const recencyKeywords = ["recent", "latest", "new", "2024", "2025", "2026", "cutting-edge", "state-of-the-art", "sota", "emerging"];

const complexityIndicators = {
  multiHop: ["compare", "versus", "vs", "difference", "between", "relationship", "combined", "synthesis"],
  technical: ["algorithm", "optimization", "architecture", "implementation", "method"],
  broad: ["survey", "review", "overview", "state-of-the-art", "comprehensive"]
};

const sessionMemory = {
  queries: [] as { query: string; keywords: string[]; timestamp: number }[],
  maxSize: 5,
  ttlMs: 1800000
};

const cleanSessionMemory = (): void => {
  const now = Date.now();
  sessionMemory.queries = sessionMemory.queries.filter(q => now - q.timestamp < sessionMemory.ttlMs);
};

const addToSessionMemory = (query: string, keywords: string[]): void => {
  cleanSessionMemory();
  sessionMemory.queries.push({ query, keywords, timestamp: Date.now() });
  if (sessionMemory.queries.length > sessionMemory.maxSize) sessionMemory.queries.shift();
};

const getSessionTopicBoost = (query: string): string[] => {
  cleanSessionMemory();
  if (sessionMemory.queries.length === 0) return [];
  const queryWords = new Set(query.toLowerCase().split(/\W+/));
  const topicKeywords = new Map<string, number>();
  for (const session of sessionMemory.queries) {
    for (const kw of session.keywords) {
      if (!queryWords.has(kw.toLowerCase())) topicKeywords.set(kw, (topicKeywords.get(kw) || 0) + 1);
    }
  }
  return Array.from(topicKeywords.entries()).filter(([_, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([kw]) => kw);
};

const generateSessionCompletions = (prefix: string, maxCompletions = 5): string[] => {
  cleanSessionMemory();
  if (sessionMemory.queries.length === 0 || prefix.length < 2) return [];
  const lowerPrefix = prefix.toLowerCase();
  const keywordFreq = new Map<string, number>();
  for (const session of sessionMemory.queries) {
    for (const kw of session.keywords) {
      if (kw.toLowerCase().startsWith(lowerPrefix) || kw.toLowerCase().includes(lowerPrefix)) {
        keywordFreq.set(kw, (keywordFreq.get(kw) || 0) + 1);
      }
    }
  }
  const pastQueries = sessionMemory.queries.filter(s => s.query.toLowerCase().startsWith(lowerPrefix)).map(s => s.query);
  const completions = new Set<string>([...pastQueries, ...Array.from(keywordFreq.entries()).sort((a, b) => b[1] - a[1]).map(([kw]) => `${prefix} ${kw}`)]);
  return Array.from(completions).slice(0, maxCompletions);
};

const estimateQueryComplexity = (query: string): QueryComplexity => {
  const lower = query.toLowerCase();
  const termCount = query.split(/\W+/).filter(w => w.length > 2).length;
  const multiHopScore = complexityIndicators.multiHop.filter(kw => lower.includes(kw)).length;
  const technicalScore = complexityIndicators.technical.filter(kw => lower.includes(kw)).length;
  const broadScore = complexityIndicators.broad.filter(kw => lower.includes(kw)).length;
  const totalScore = multiHopScore * 2 + technicalScore + broadScore + (termCount > 6 ? 2 : termCount > 3 ? 1 : 0);
  if (totalScore >= 4) return QueryComplexity.COMPLEX;
  if (totalScore >= 2) return QueryComplexity.MODERATE;
  return QueryComplexity.SIMPLE;
};

const complexityToString = (c: QueryComplexity): "simple" | "moderate" | "complex" => {
  switch (c) {
    case QueryComplexity.SIMPLE: return "simple";
    case QueryComplexity.MODERATE: return "moderate";
    case QueryComplexity.COMPLEX: return "complex";
  }
};

const getVariantCountByComplexity = (complexity: QueryComplexity): number => {
  switch (complexity) {
    case QueryComplexity.SIMPLE: return 4;
    case QueryComplexity.MODERATE: return 6;
    case QueryComplexity.COMPLEX: return 8;
  }
};

const extractAbstractKeywords = (abstract: string | undefined): string[] => {
  if (!abstract || abstract.length < 50) return [];
  const words = abstract.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w));
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  const docFreq = words.length || 1;
  const tfidf = Array.from(freq.entries()).map(([word, count]) => ({
    word, score: (count / docFreq) * Math.log(1000 / (count + 1))
  }));
  return tfidf.sort((a, b) => b.score - a.score).slice(0, 5).map(t => t.word);
};

const tokenizeForCache = (query: string): Set<string> =>
  new Set(query.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !stopWords.has(w)));

const computeJaccardSimilarity = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  return intersection / (a.size + b.size - intersection);
};

const findSemanticCacheMatch = (query: string): string | null => {
  const queryTokens = tokenizeForCache(query);
  if (queryTokens.size === 0) return null;
  for (const [, entry] of semanticCacheIndex) {
    if (computeJaccardSimilarity(queryTokens, entry.tokens) >= semanticCacheThreshold) {
      const cached = searchTheArxivCache.get(entry.cacheKey);
      if (cached && cached.expiresAt > Date.now()) return entry.cacheKey;
    }
  }
  return null;
};

const addToSemanticCache = (query: string, cacheKey: string): void => {
  semanticCacheIndex.set(cacheKey, { tokens: tokenizeForCache(query), cacheKey });
};

const clusterResultsByTopic = (papers: EnhancedPaper[]): Map<string, string[]> => {
  if (papers.length === 0) return new Map();
  const paperKeywords = papers.map(p => ({
    id: p.id,
    keywords: new Set((p.title || "").toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w)))
  }));
  const clusters = new Map<string, string[]>();
  const assigned = new Set<string>();
  for (const paper of paperKeywords) {
    if (assigned.has(paper.id)) continue;
    const clusterKeywords = new Map<string, number>();
    const members = [paper.id];
    assigned.add(paper.id);
    for (const kw of paper.keywords) clusterKeywords.set(kw, 1);
    for (const other of paperKeywords) {
      if (assigned.has(other.id)) continue;
      let overlap = 0;
      for (const kw of other.keywords) if (paper.keywords.has(kw)) overlap++;
      if (overlap >= 2 || (paper.keywords.size > 0 && overlap / paper.keywords.size >= 0.3)) {
        members.push(other.id);
        assigned.add(other.id);
        for (const kw of other.keywords) clusterKeywords.set(kw, (clusterKeywords.get(kw) || 0) + 1);
      }
    }
    const topKeyword = Array.from(clusterKeywords.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "misc";
    clusters.set(topKeyword, members);
  }
  return clusters;
};

const normalizeScoresInBatch = (papers: SearchTheArxivPaper[]): void => {
  if (papers.length === 0) return;
  const scores = papers.map(p => p.score);
  const min = Math.min(...scores), max = Math.max(...scores);
  if (max - min < 0.001) return;
  for (const p of papers) p.score = (p.score - min) / (max - min);
};

const pronouns = new Set(["it", "this", "that", "these", "those", "they", "them", "its"]);
const conjunctions = ["and", "or", "versus", "vs", "compared to", "vs."];

const resolveCoreferenceInQuery = (query: string): string => {
  const words = query.toLowerCase().split(/\s+/);
  const hasPronouns = words.some(w => pronouns.has(w));
  if (!hasPronouns) return query;
  cleanSessionMemory();
  if (sessionMemory.queries.length === 0) return query;
  const lastSession = sessionMemory.queries[sessionMemory.queries.length - 1]!;
  const topicKeyword = lastSession.keywords[0];
  if (!topicKeyword) return query;
  let resolved = query;
  for (const pronoun of pronouns) {
    const pattern = new RegExp(`\\b${pronoun}\\b`, "gi");
    resolved = resolved.replace(pattern, topicKeyword);
  }
  return resolved;
};

const decomposeQuery = (query: string): string[] => {
  const lower = query.toLowerCase();
  for (const conj of conjunctions) {
    if (lower.includes(` ${conj} `)) {
      const parts = query.split(new RegExp(`\\s+${conj}\\s+`, "i")).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) return parts;
    }
  }
  return [query];
};

const recentRequestOutcomes: boolean[] = [];
const maxOutcomeHistory = 10;

const trackRequestOutcome = (success: boolean): void => {
  recentRequestOutcomes.push(success);
  if (recentRequestOutcomes.length > maxOutcomeHistory) recentRequestOutcomes.shift();
};

const getAdaptiveRetryMultiplier = (): number => {
  if (recentRequestOutcomes.length < 3) return 1.0;
  const successRate = recentRequestOutcomes.filter(Boolean).length / recentRequestOutcomes.length;
  if (successRate < 0.5) return 2.0;
  if (successRate > 0.8) return 0.67;
  return 1.0;
};

const parseNegationTerms = (query: string): { cleanQuery: string; negatedTerms: string[] } => {
  const negatedTerms: string[] = [];
  let cleanQuery = query;
  const notPattern = /\bNOT\s+(\w+)/gi;
  let match;
  while ((match = notPattern.exec(query)) !== null) {
    negatedTerms.push(match[1]!.toLowerCase());
  }
  cleanQuery = cleanQuery.replace(notPattern, "").trim();
  const dashPattern = /-(\w+)/g;
  while ((match = dashPattern.exec(query)) !== null) {
    negatedTerms.push(match[1]!.toLowerCase());
  }
  cleanQuery = cleanQuery.replace(dashPattern, "").trim().replace(/\s+/g, " ");
  return { cleanQuery, negatedTerms };
};

const filterNegatedResults = (papers: SearchTheArxivPaper[], negatedTerms: string[]): SearchTheArxivPaper[] => {
  if (negatedTerms.length === 0) return papers;
  return papers.filter(p => {
    const text = `${p.title || ""} ${p.abstract || ""}`.toLowerCase();
    return !negatedTerms.some(term => text.includes(term));
  });
};

const acronymExpansions: Record<string, string> = {
  "llm": "large language model", "llms": "large language models", "nlp": "natural language processing",
  "ml": "machine learning", "dl": "deep learning", "cv": "computer vision", "rl": "reinforcement learning",
  "gpt": "generative pretrained transformer", "bert": "bidirectional encoder representations",
  "rag": "retrieval augmented generation", "cot": "chain of thought", "icl": "in-context learning",
  "peft": "parameter efficient fine-tuning", "lora": "low rank adaptation", "sft": "supervised fine-tuning",
  "rlhf": "reinforcement learning from human feedback", "dpo": "direct preference optimization",
  "moe": "mixture of experts", "kd": "knowledge distillation", "qa": "question answering",
  "ner": "named entity recognition", "pos": "part of speech", "mt": "machine translation",
  "asr": "automatic speech recognition", "tts": "text to speech", "ocr": "optical character recognition",
  "gan": "generative adversarial network", "vae": "variational autoencoder", "cnn": "convolutional neural network",
  "rnn": "recurrent neural network", "lstm": "long short term memory", "gru": "gated recurrent unit",
  "gnn": "graph neural network", "gcn": "graph convolutional network", "knn": "k nearest neighbors",
  "svm": "support vector machine", "mlp": "multilayer perceptron", "ffn": "feedforward network"
};

const domainVocabulary = new Set([
  ...Object.keys(domainExpansions), ...Object.keys(acronymExpansions),
  "transformer", "attention", "embedding", "encoder", "decoder", "tokenizer", "pretraining",
  "finetuning", "inference", "latency", "throughput", "benchmark", "dataset", "corpus",
  "annotation", "label", "classification", "regression", "clustering", "retrieval", "ranking",
  "generation", "summarization", "translation", "extraction", "segmentation", "detection"
]);

const computeLevenshtein = (a: string, b: string): number => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0]![j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i]![j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1]![j - 1]!
        : Math.min(matrix[i - 1]![j - 1]!, matrix[i]![j - 1]!, matrix[i - 1]![j]!) + 1;
    }
  }
  return matrix[b.length]![a.length]!;
};

const correctTypos = (query: string): { corrected: string; corrections: string[] } => {
  const words = query.toLowerCase().split(/\s+/);
  const corrections: string[] = [];
  const correctedWords = words.map(word => {
    if (word.length < 3 || domainVocabulary.has(word) || stopWords.has(word)) return word;
    let bestMatch = word, bestDist = 3;
    for (const vocab of domainVocabulary) {
      if (Math.abs(vocab.length - word.length) > 2) continue;
      const dist = computeLevenshtein(word, vocab);
      if (dist > 0 && dist < bestDist) { bestDist = dist; bestMatch = vocab; }
    }
    if (bestMatch !== word && bestDist <= 1) {
      corrections.push(`${word}->${bestMatch}`);
      return bestMatch;
    }
    return word;
  });
  return { corrected: correctedWords.join(" "), corrections };
};

const expandAcronyms = (query: string): string => {
  const words = query.split(/\s+/);
  const expanded = words.map(word => {
    const lower = word.toLowerCase();
    const expansion = acronymExpansions[lower];
    return expansion ? `${word} ${expansion}` : word;
  });
  return expanded.join(" ");
};

const fieldKeywords: Record<string, string[]> = {
  "nlp": ["language", "text", "nlp", "linguistic", "semantic", "syntax", "parsing", "translation", "summarization"],
  "cv": ["vision", "image", "visual", "object", "detection", "segmentation", "recognition", "video"],
  "ml": ["learning", "model", "training", "optimization", "gradient", "loss", "regularization"],
  "rl": ["reinforcement", "reward", "policy", "agent", "environment", "action", "state"],
  "ir": ["retrieval", "search", "ranking", "recommendation", "query", "document", "index"],
  "speech": ["speech", "audio", "acoustic", "voice", "asr", "tts", "speaker"],
  "graph": ["graph", "network", "node", "edge", "gnn", "gcn", "knowledge graph"]
};

const classifyPaperField = (title: string, abstract?: string): string => {
  const text = `${title || ""} ${abstract || ""}`.toLowerCase();
  let bestField = "ml", bestScore = 0;
  for (const [field, keywords] of Object.entries(fieldKeywords)) {
    const score = keywords.filter(kw => text.includes(kw)).length;
    if (score > bestScore) { bestScore = score; bestField = field; }
  }
  return bestField;
};

const extractSnippet = (abstract: string | undefined, query: string): string => {
  if (!abstract || abstract.length < 50) return abstract?.slice(0, 150) || "";
  const sentences = abstract.split(/[.!?]+/).filter(s => s.trim().length > 20);
  if (sentences.length === 0) return abstract.slice(0, 150);
  const queryTerms = new Set(query.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  let bestSentence = sentences[0]!, bestScore = 0;
  for (const sentence of sentences) {
    const words = sentence.toLowerCase().split(/\W+/);
    const score = words.filter(w => queryTerms.has(w)).length;
    if (score > bestScore) { bestScore = score; bestSentence = sentence; }
  }
  const trimmed = bestSentence.trim();
  return trimmed.length > 150 ? trimmed.slice(0, 147) + "..." : trimmed;
};

const broadScopeIndicators = ["survey", "overview", "review", "comprehensive", "state of the art", "trends"];
const narrowScopeIndicators = ["specific", "particular", "exactly", "precisely"];

const detectQueryScope = (query: string): "broad" | "narrow" | "moderate" => {
  const lower = query.toLowerCase();
  const uniqueTerms = new Set(lower.split(/\W+/).filter(w => w.length > 2 && !stopWords.has(w)));
  const hasBroadIndicator = broadScopeIndicators.some(ind => lower.includes(ind));
  const hasNarrowIndicator = narrowScopeIndicators.some(ind => lower.includes(ind)) || /\d{4}/.test(query) || query.includes('"');
  if (hasBroadIndicator || uniqueTerms.size <= 2) return "broad";
  if (hasNarrowIndicator || uniqueTerms.size >= 6) return "narrow";
  return "moderate";
};

const methodologyKeywords: Record<string, string[]> = {
  empirical: ["experiment", "study", "evaluation", "analysis", "measurement", "user study", "ablation"],
  theoretical: ["theorem", "proof", "lemma", "proposition", "mathematical", "formal", "derivation"],
  survey: ["survey", "review", "overview", "systematic", "literature review", "meta-analysis"],
  simulation: ["simulation", "synthetic", "generated", "simulated", "monte carlo"],
  casestudy: ["case study", "real-world", "deployment", "production", "industry"]
};

const classifyMethodology = (title: string, abstract: string | undefined): string => {
  const text = `${title} ${abstract || ""}`.toLowerCase();
  let bestMethod = "empirical", bestScore = 0;
  for (const [method, keywords] of Object.entries(methodologyKeywords)) {
    const score = keywords.filter(kw => text.includes(kw)).length;
    if (score > bestScore) { bestScore = score; bestMethod = method; }
  }
  return bestMethod;
};

const computeFreshnessScore = (year?: number): number => {
  if (!year) return 0.5;
  const age = currentYear - year;
  if (age <= 0) return 1.0;
  if (age === 1) return 0.9;
  if (age === 2) return 0.8;
  if (age <= 5) return 0.6;
  return Math.max(0.2, 0.5 - (age - 5) * 0.05);
};

const buildRankingExplanation = (
  score: number, credibility: number, temporalBoost: number,
  titleMatch: boolean, keywordOverlap: number
): string => {
  const factors: string[] = [];
  if (score >= 0.9) factors.push("high relevance score");
  else if (score >= 0.7) factors.push("good relevance score");
  if (credibility >= 0.9) factors.push("highly credible authors");
  else if (credibility >= 0.7) factors.push("credible authors");
  if (temporalBoost >= 1.2) factors.push("very recent publication");
  else if (temporalBoost >= 1.1) factors.push("recent publication");
  if (titleMatch) factors.push("title keyword match");
  if (keywordOverlap >= 3) factors.push("strong keyword overlap");
  else if (keywordOverlap >= 1) factors.push("keyword overlap");
  return factors.length > 0 ? factors.join(", ") : "general relevance";
};

const groupByMethodology = (papers: EnhancedPaper[]): Record<string, string[]> => {
  const groups: Record<string, string[]> = {};
  for (const paper of papers) {
    const method = paper.methodology || "empirical";
    if (!groups[method]) groups[method] = [];
    groups[method]!.push(paper.id);
  }
  return groups;
};

const refillTokenBucket = (): void => {
  const now = Date.now();
  const elapsed = now - tokenBucket.lastRefill;
  if (elapsed >= tokenBucket.refillIntervalMs) {
    const refills = Math.floor(elapsed / tokenBucket.refillIntervalMs);
    tokenBucket.tokens = Math.min(tokenBucket.maxTokens, tokenBucket.tokens + refills * tokenBucket.refillRate);
    tokenBucket.lastRefill = now;
  }
};

const consumeToken = (): boolean => {
  refillTokenBucket();
  if (tokenBucket.tokens > 0) {
    tokenBucket.tokens--;
    return true;
  }
  return false;
};

const detectQueryIntent = (query: string): QueryIntent => {
  const lower = query.toLowerCase();
  let maxScore = 0, detected = QueryIntent.DISCOVERY;
  for (const [intent, keywords] of Object.entries(intentKeywords)) {
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > maxScore) { maxScore = score; detected = Number(intent) as QueryIntent; }
  }
  return detected;
};

const detectRecencyIntent = (query: string): boolean => recencyKeywords.some(kw => query.toLowerCase().includes(kw));

const computeTemporalBoost = (year?: number, recencyRequired = false): number => {
  if (!year || !recencyRequired) return 1.0;
  const age = currentYear - year;
  if (age <= 0) return 1.3;
  if (age === 1) return 1.2;
  if (age === 2) return 1.1;
  return Math.max(0.7, 1.0 - age * 0.05);
};

const expandDomainTerms = (query: string): string[] => {
  const lower = query.toLowerCase();
  const expansions: string[] = [];
  for (const [term, synonyms] of Object.entries(domainExpansions)) {
    if (lower.includes(term) && synonyms[0] && !lower.includes(synonyms[0].toLowerCase())) {
      expansions.push(query.replace(new RegExp(term, "gi"), synonyms[0]));
    }
  }
  return expansions.slice(0, 2);
};

const sleep = (durationMs: number): Promise<void> => new Promise(resolve => setTimeout(resolve, durationMs));

const retryAfterMs = (header: string | null): number | null => {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(header);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - Date.now());
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

const compactKeywords = (query: string): string =>
  normalizeSearchQuery(query).toLowerCase().split(" ").filter(token => token && !stopWords.has(token)).slice(0, 8).join(" ");

export const buildSearchQueryVariants = (query: string, maxVariants = 8): string[] => {
  const normalized = normalizeSearchQuery(query);
  const focused = compactKeywords(normalized);
  const intent = detectQueryIntent(normalized);
  const domainExpanded = expandDomainTerms(normalized);
  const sessionBoost = getSessionTopicBoost(normalized);
  const intentSuffixes: Record<QueryIntent, string> = {
    [QueryIntent.DISCOVERY]: "survey review", [QueryIntent.VALIDATION]: "evaluation empirical",
    [QueryIntent.BENCHMARK]: "benchmark dataset", [QueryIntent.IMPLEMENTATION]: "algorithm implementation",
    [QueryIntent.SYNTHESIS]: "framework architecture"
  };
  const variants = [normalized, `"${normalized}"`, normalized.replace(/\s+/g, "+"), focused, focused ? `${focused} ${intentSuffixes[intent]}` : "", ...domainExpanded];
  if (sessionBoost.length > 0) variants.push(`${focused} ${sessionBoost.join(" ")}`);
  return Array.from(new Set(variants.map(v => normalizeSearchQuery(v)).filter(Boolean))).slice(0, maxVariants);
};

const parseSearchTheArxivResponse = (details: unknown): SearchTheArxivResult => {
  if (details && typeof details === "object") return details as SearchTheArxivResult;
  if (typeof details !== "string") return {};
  const trimmed = details.trim();
  if (!trimmed) return {};
  try { const parsed = JSON.parse(trimmed); if (parsed && typeof parsed === "object") return parsed as SearchTheArxivResult; } catch {}
  const jsonStart = trimmed.indexOf("{"), jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return {};
  try { const extracted = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)); return extracted && typeof extracted === "object" ? extracted as SearchTheArxivResult : {}; } catch { return {}; }
};

const hasSearchResults = (payload: SearchTheArxivResult): boolean =>
  (Array.isArray(payload.papers) && payload.papers.length > 0) || (Array.isArray(payload.authors) && payload.authors.length > 0);

const extractFeedbackKeywords = (papers: SearchTheArxivPaper[], topK = 3): string[] => {
  const keywords = new Map<string, number>();
  papers.slice(0, topK).flatMap(p => (p.title || "").toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w)))
    .forEach(word => keywords.set(word, (keywords.get(word) || 0) + 1));
  return Array.from(keywords.entries()).filter(([_, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([word]) => word);
};

const computeTitleSimilarity = (title1: string, title2: string): number => {
  const words1 = new Set((title1 || "").toLowerCase().split(/\W+/).filter(w => w.length > 2));
  const words2 = new Set((title2 || "").toLowerCase().split(/\W+/).filter(w => w.length > 2));
  if (words1.size === 0 || words2.size === 0) return 0;
  let overlap = 0;
  for (const w of words1) if (words2.has(w)) overlap++;
  return overlap / Math.sqrt(words1.size * words2.size);
};

const applyMMRDiversity = (papers: EnhancedPaper[], lambda = 0.7): EnhancedPaper[] => {
  if (papers.length <= 1) return papers;
  const selected: EnhancedPaper[] = [papers[0]!];
  const remaining = papers.slice(1);
  while (selected.length < papers.length && remaining.length > 0) {
    let bestIdx = 0, bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]!;
      const maxSim = Math.max(...selected.map(s => computeTitleSimilarity(s.title || "", candidate.title || "")));
      const mmrScore = lambda * candidate.consolidatedScore - (1 - lambda) * maxSim;
      if (mmrScore > bestScore) { bestScore = mmrScore; bestIdx = i; }
    }
    const chosen = remaining.splice(bestIdx, 1)[0]!;
    chosen.diversityPenalty = 1 - lambda;
    selected.push(chosen);
  }
  return selected;
};

const extractSuggestedQueries = (papers: SearchTheArxivPaper[], originalQuery: string): string[] => {
  const queryWords = new Set(originalQuery.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  const keywords = new Map<string, number>();
  papers.slice(0, 5).forEach(p => {
    (p.title || "").toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w) && !queryWords.has(w))
      .forEach(w => keywords.set(w, (keywords.get(w) || 0) + 1));
  });
  const topKeywords = Array.from(keywords.entries()).filter(([_, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);
  if (topKeywords.length === 0) return [];
  return topKeywords.map(kw => {
    const expansion = domainExpansions[kw];
    return expansion ? `${originalQuery} ${expansion[0]}` : `${originalQuery} ${kw}`;
  });
};

const extractFacets = (papers: SearchTheArxivPaper[]): SearchFacets => {
  const years: Record<number, number> = {};
  const authorCounts: Record<string, number> = { "1": 0, "2-3": 0, "4-6": 0, "7+": 0 };
  const authorFreq = new Map<string, number>();
  for (const paper of papers) {
    if (paper.year) years[paper.year] = (years[paper.year] || 0) + 1;
    const numAuthors = paper.authors_parsed?.length || 0;
    if (numAuthors === 1) authorCounts["1"]++;
    else if (numAuthors <= 3) authorCounts["2-3"]++;
    else if (numAuthors <= 6) authorCounts["4-6"]++;
    else authorCounts["7+"]++;
    paper.authors_parsed?.slice(0, 3).forEach(a => authorFreq.set(a, (authorFreq.get(a) || 0) + 1));
  }
  const topAuthors = Array.from(authorFreq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([a]) => a);
  return { years, authorCounts, topAuthors };
};

const computeAuthorCredibility = (authors: SearchTheArxivAuthor[], paperAuthors?: string[]): number => {
  if (!paperAuthors?.length || !authors.length) return 1.0;
  const authorScoreMap = new Map(authors.filter(a => a.avg_score).map(a => [a.author.toLowerCase(), a.avg_score!]));
  let total = 0, count = 0;
  for (const name of paperAuthors) {
    const score = authorScoreMap.get(name.toLowerCase());
    if (score) { total += score; count++; }
  }
  return count > 0 ? 1 + (total / count) * 0.1 : 1.0;
};

const computeConfidence = (scores: number[], authorCredibility: number): number => {
  if (scores.length < 2) return authorCredibility > 1.05 ? 0.8 : 0.5;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / scores.length;
  const normalizedVariance = Math.min(1, variance / (mean * mean + 0.01));
  const credibilityFactor = Math.min(1, authorCredibility - 0.9);
  return Math.max(0.1, Math.min(1.0, (1 - normalizedVariance * 0.5) * (0.5 + credibilityFactor * 0.5)));
};

const deduplicateAndConsolidate = (
  papers: Array<SearchTheArxivPaper & { _variant?: string }>,
  authors: SearchTheArxivAuthor[],
  queryUsed: string,
  recencyRequired: boolean,
  allScores: Map<string, number[]>,
  originalQuery: string
): EnhancedPaper[] => {
  const consolidated = new Map<string, EnhancedPaper>();
  for (const paper of papers) {
    const credibility = computeAuthorCredibility(authors, paper.authors_parsed);
    const temporalBoost = computeTemporalBoost(paper.year, recencyRequired);
    const existing = consolidated.get(paper.id);
    const scores = allScores.get(paper.id) || [paper.score];
    if (!allScores.has(paper.id)) allScores.set(paper.id, [paper.score]);
    else allScores.get(paper.id)!.push(paper.score);
    
    if (existing) {
      existing.consolidatedScore = ((existing.consolidatedScore + paper.score * temporalBoost) / 2) * 1.05;
      existing.sourceQueries.push(queryUsed);
      existing.authorCredibility = Math.max(existing.authorCredibility, credibility);
      existing.temporalBoost = Math.max(existing.temporalBoost, temporalBoost);
      existing.confidence = computeConfidence(allScores.get(paper.id)!, existing.authorCredibility);
    } else {
      const queryTerms = new Set(originalQuery.toLowerCase().split(/\W+/).filter(w => w.length > 2));
      const titleMatch = queryTerms.size > 0 && (paper.title?.toLowerCase().split(/\W+/).some(w => queryTerms.has(w)) ?? false);
      const paperKeywords = extractAbstractKeywords(paper.abstract);
      const keywordOverlap = paperKeywords.filter(kw => queryTerms.has(kw.toLowerCase())).length;
      consolidated.set(paper.id, {
        ...paper, consolidatedScore: paper.score * credibility * temporalBoost, sourceQueries: [queryUsed],
        authorCredibility: credibility, temporalBoost, confidence: computeConfidence(scores, credibility),
        keywords: paperKeywords, provenanceVariant: paper._variant,
        snippet: extractSnippet(paper.abstract, originalQuery), field: classifyPaperField(paper.title || "", paper.abstract),
        methodology: classifyMethodology(paper.title || "", paper.abstract),
        freshnessScore: computeFreshnessScore(paper.year),
        rankingExplanation: buildRankingExplanation(paper.score, credibility, temporalBoost, titleMatch, keywordOverlap)
      });
    }
  }
  return Array.from(consolidated.values()).sort((a, b) => b.consolidatedScore - a.consolidatedScore);
};

const updateCircuitBreaker = (success: boolean): void => {
  if (success) { circuitBreaker.failures = 0; circuitBreaker.state = CircuitState.CLOSED; }
  else {
    circuitBreaker.failures++;
    circuitBreaker.lastFailureTime = Date.now();
    if (circuitBreaker.failures >= circuitBreaker.threshold) circuitBreaker.state = CircuitState.OPEN;
  }
};

const shouldAllowRequest = (): boolean => {
  if (circuitBreaker.state === CircuitState.CLOSED) return true;
  if (circuitBreaker.state === CircuitState.OPEN && Date.now() - circuitBreaker.lastFailureTime > circuitBreaker.resetTimeout) {
    circuitBreaker.state = CircuitState.HALF_OPEN;
    return true;
  }
  return circuitBreaker.state === CircuitState.HALF_OPEN;
};

const circuitStateString = (): "closed" | "open" | "half-open" => {
  switch (circuitBreaker.state) {
    case CircuitState.CLOSED: return "closed";
    case CircuitState.OPEN: return "open";
    case CircuitState.HALF_OPEN: return "half-open";
  }
};

const buildHealth = (
  queryUsed: string, attemptedQueries: string[], networkAttempts: number, cacheHit: boolean,
  fallbackUsed: boolean, payload: SearchTheArxivResult, feedbackApplied = false, feedbackKeywords: string[] = [],
  parallelExecution = false, recencyApplied = false, rateLimited = false, mmrApplied = false,
  suggestedQueries: string[] = [], facets?: SearchFacets, sessionContext = false,
  queryComplexity: "simple" | "moderate" | "complex" = "simple", earlyExit = false,
  semanticCacheHit = false, topicClusters?: Record<string, string[]>, variantEffectiveness?: Record<string, number>,
  typoCorrections: string[] = [], acronymsExpanded = false,
  queryScope: "broad" | "narrow" | "moderate" = "moderate", methodologyGroups?: Record<string, string[]>
): SearchHealth => ({
  cacheHit, fallbackUsed, variantCount: attemptedQueries.length, networkAttempts, retried: networkAttempts > 1,
  emptyResults: !hasSearchResults(payload), queryUsed, circuitState: circuitStateString(),
  degradedMode: circuitBreaker.state !== CircuitState.CLOSED, feedbackApplied, feedbackKeywords,
  parallelExecution, recencyApplied, rateLimited, mmrApplied, suggestedQueries, facets, sessionContext,
  queryComplexity, earlyExit, semanticCacheHit, topicClusters, variantEffectiveness, typoCorrections, acronymsExpanded,
  queryScope, methodologyGroups
});

const fetchSingleVariant = async (queryVariant: string, query: string): Promise<{ payload: SearchTheArxivResult; cached: boolean; variant: string } | null> => {
  const url = new URL(searchTheArxivBaseUrl);
  url.searchParams.set("query", queryVariant);
  const cacheKey = `searchthearxiv:${url.toString()}`;
  const cached = searchTheArxivCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { payload: parseSearchTheArxivResponse(cached.data), cached: true, variant: queryVariant };
  
  const retryMultiplier = getAdaptiveRetryMultiplier();
  for (let attempt = 0; attempt <= apiRetryCount; attempt++) {
    try {
      const response = await fetch(url, { headers: { accept: "application/json" } });
      const isJson = (response.headers.get("content-type") || "").toLowerCase().includes("application/json");
      const details = isJson ? await response.json() as unknown : await response.text();
      if (!response.ok) {
        if (attempt < apiRetryCount && [429, 502, 503, 504].includes(response.status)) {
          const baseDelay = retryAfterMs(response.headers.get("retry-after")) ?? Math.min(8000, apiRetryBaseDelayMs * 2 ** attempt + Math.random() * 1000);
          await sleep(baseDelay * retryMultiplier);
          continue;
        }
        updateCircuitBreaker(false);
        trackRequestOutcome(false);
        return null;
      }
      updateCircuitBreaker(true);
      trackRequestOutcome(true);
      const payload = parseSearchTheArxivResponse(details);
      if (payload.papers) normalizeScoresInBatch(payload.papers);
      searchTheArxivCache.set(cacheKey, { data: payload, expiresAt: Date.now() + (Number.isFinite(searchTheArxivCacheTtlMs) ? searchTheArxivCacheTtlMs : 1800000) });
      addToSemanticCache(query, cacheKey);
      return { payload, cached: false, variant: queryVariant };
    } catch (error) {
      if (attempt < apiRetryCount) { await sleep(Math.min(8000, apiRetryBaseDelayMs * 2 ** attempt * retryMultiplier + Math.random() * 1000)); continue; }
      updateCircuitBreaker(false);
      trackRequestOutcome(false);
      return null;
    }
  }
  return null;
};

export const requestSearchTheArxiv = async (query: string): Promise<ApiResult> => {
  const rateLimited = !consumeToken();
  if (rateLimited || !shouldAllowRequest()) {
    const cachedFallback = Array.from(searchTheArxivCache.entries()).find(([_, entry]) => entry.expiresAt > Date.now());
    if (cachedFallback) {
      const payload = parseSearchTheArxivResponse(cachedFallback[1].data);
      return {
        ok: true, fromCache: true,
        data: { requestedQuery: query, queryUsed: "cached-fallback", attemptedQueries: [], payload,
          health: buildHealth("cached-fallback", [], 0, true, true, payload, false, [], false, false, rateLimited) } satisfies SearchTheArxivToolData
      };
    }
    return { ok: false, status: 503, message: rateLimited ? "Rate limit exceeded" : "Circuit breaker open", details: { circuitState: circuitStateString(), rateLimited } };
  }

  const { corrected: typoFixedQuery, corrections: typoCorrections } = correctTypos(query);
  const expandedQuery = expandAcronyms(typoFixedQuery);
  const acronymsExpanded = expandedQuery !== typoFixedQuery;

  const resolvedQuery = resolveCoreferenceInQuery(expandedQuery);
  const { cleanQuery, negatedTerms } = parseNegationTerms(resolvedQuery);
  const subQueries = decomposeQuery(cleanQuery);
  const primaryQuery = subQueries[0] || cleanQuery;

  const semanticCacheKey = findSemanticCacheMatch(primaryQuery);
  if (semanticCacheKey) {
    const cached = searchTheArxivCache.get(semanticCacheKey);
    if (cached) {
      const payload = parseSearchTheArxivResponse(cached.data);
      const filteredPapers = filterNegatedResults(payload.papers || [], negatedTerms);
      return {
        ok: true, fromCache: true,
        data: { requestedQuery: query, queryUsed: "semantic-cache", attemptedQueries: [], payload: { ...payload, papers: filteredPapers },
          health: buildHealth("semantic-cache", [], 0, true, false, payload, false, [], false, false, false, false, [], undefined, false, "simple", false, true, undefined, undefined, typoCorrections, acronymsExpanded) } satisfies SearchTheArxivToolData
      };
    }
  }

  const complexity = estimateQueryComplexity(primaryQuery);
  const maxVariants = getVariantCountByComplexity(complexity);
  const recencyRequired = detectRecencyIntent(primaryQuery);
  const sessionBoost = getSessionTopicBoost(primaryQuery);
  const hasSessionContext = sessionBoost.length > 0;
  const allScores = new Map<string, number[]>();
  const variantEffectiveness = new Map<string, number>();
  const maxParallel = 3;
  const earlyExitThreshold = 0.8;
  const minBatchesBeforeExit = 2;

  let allAttemptedQueries: string[] = [];
  let networkAttempts = 0, earlyExit = false;
  let allPapers: Array<SearchTheArxivPaper & { _variant?: string }> = [];
  let allAuthors: SearchTheArxivAuthor[] = [];
  let lastQueryUsed = primaryQuery;
  let anyCached = false;

  for (const subQuery of subQueries) {
    const attemptedQueries = buildSearchQueryVariants(subQuery, maxVariants);
    allAttemptedQueries.push(...attemptedQueries);
    const parallelBatches: string[][] = [];
    for (let i = 0; i < attemptedQueries.length; i += maxParallel) {
      parallelBatches.push(attemptedQueries.slice(i, i + maxParallel));
    }
    let batchCount = 0;
    for (const batch of parallelBatches) {
      batchCount++;
      const results = await Promise.all(batch.map(v => fetchSingleVariant(v, subQuery)));
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (!result) { networkAttempts++; continue; }
        networkAttempts += result.cached ? 0 : 1;
        anyCached = anyCached || result.cached;
        if (hasSearchResults(result.payload)) {
          const papersWithVariant = (result.payload.papers || []).map(p => ({ ...p, _variant: result.variant }));
          allPapers.push(...papersWithVariant);
          allAuthors.push(...(result.payload.authors || []));
          lastQueryUsed = batch[i]!;
          variantEffectiveness.set(result.variant, (result.payload.papers?.length || 0));
        }
      }
      if (allPapers.length >= 20) break;
      if (batchCount >= minBatchesBeforeExit && allPapers.length >= 5) {
        const topScores = allPapers.slice(0, 5).map(p => p.score);
        if (topScores.every(s => s >= earlyExitThreshold)) { earlyExit = true; break; }
      }
    }
    if (earlyExit || allPapers.length >= 20) break;
  }

  allPapers = filterNegatedResults(allPapers, negatedTerms) as Array<SearchTheArxivPaper & { _variant?: string }>;

  if (allPapers.length === 0) {
    const emptyPayload: SearchTheArxivResult = { papers: [], authors: [] };
    const queryScope = detectQueryScope(query);
    return {
      ok: true, fromCache: anyCached,
      data: { requestedQuery: query, queryUsed: lastQueryUsed, attemptedQueries: allAttemptedQueries, payload: emptyPayload,
        health: buildHealth(lastQueryUsed, allAttemptedQueries, networkAttempts, anyCached, false, emptyPayload, false, [], true, recencyRequired, false, false, [], undefined, hasSessionContext, complexityToString(complexity), earlyExit, false, undefined, Object.fromEntries(variantEffectiveness), typoCorrections, acronymsExpanded, queryScope) } satisfies SearchTheArxivToolData
    };
  }

  const enhancedPapers = applyMMRDiversity(deduplicateAndConsolidate(allPapers, allAuthors, lastQueryUsed, recencyRequired, allScores, query));
  const suggestedQueries = extractSuggestedQueries(allPapers, query);
  const facets = extractFacets(allPapers);
  const topicClusters = Object.fromEntries(clusterResultsByTopic(enhancedPapers));
  const sessionKeywords = enhancedPapers.slice(0, 3).flatMap(p => p.keywords || []).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);
  addToSessionMemory(query, sessionKeywords);
  const queryScope = detectQueryScope(query);
  const methodologyGroups = groupByMethodology(enhancedPapers);
  const enhancedPayload = { papers: enhancedPapers as SearchTheArxivPaper[], authors: allAuthors };
  return {
    ok: true, fromCache: anyCached,
    data: { requestedQuery: query, queryUsed: lastQueryUsed, attemptedQueries: allAttemptedQueries, payload: enhancedPayload,
      health: buildHealth(lastQueryUsed, allAttemptedQueries, networkAttempts, anyCached, lastQueryUsed !== normalizeSearchQuery(query), enhancedPayload, false, [], true, recencyRequired, false, true, suggestedQueries, facets, hasSessionContext, complexityToString(complexity), earlyExit, false, topicClusters, Object.fromEntries(variantEffectiveness), typoCorrections, acronymsExpanded, queryScope, methodologyGroups) } satisfies SearchTheArxivToolData
  };
};

export const getCircuitBreakerState = (): { state: string; failures: number } => ({ state: circuitStateString(), failures: circuitBreaker.failures });

export const getRateLimitState = (): { tokens: number; maxTokens: number } => ({ tokens: tokenBucket.tokens, maxTokens: tokenBucket.maxTokens });

export const getSessionMemoryState = (): { queryCount: number; topicKeywords: string[] } => {
  cleanSessionMemory();
  const allKeywords = sessionMemory.queries.flatMap(q => q.keywords);
  const freq = new Map<string, number>();
  for (const kw of allKeywords) freq.set(kw, (freq.get(kw) || 0) + 1);
  return { queryCount: sessionMemory.queries.length, topicKeywords: Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([kw]) => kw) };
};

export const requestSearchWithFeedback = async (query: string, enableFeedback = true): Promise<ApiResult> => {
  const initialResult = await requestSearchTheArxiv(query);
  if (!initialResult.ok || !enableFeedback) return initialResult;
  
  const data = initialResult.data as SearchTheArxivToolData;
  const papers = data.payload.papers || [];
  if (papers.length < 3) return initialResult;
  
  const feedbackKeywords = extractFeedbackKeywords(papers);
  if (feedbackKeywords.length === 0) return initialResult;
  
  const refinedQuery = `${query} ${feedbackKeywords.join(" ")}`;
  const feedbackResult = await requestSearchTheArxiv(refinedQuery);
  if (!feedbackResult.ok) return initialResult;
  
  const feedbackData = feedbackResult.data as SearchTheArxivToolData;
  const recencyRequired = detectRecencyIntent(query);
  const allScores = new Map<string, number[]>();
  const mergedPapers = applyMMRDiversity(deduplicateAndConsolidate(
    [...papers, ...(feedbackData.payload.papers || [])],
    [...(data.payload.authors || []), ...(feedbackData.payload.authors || [])],
    refinedQuery, recencyRequired, allScores, query
  ));
  const suggestedQueries = extractSuggestedQueries([...papers, ...(feedbackData.payload.papers || [])], query);
  const facets = extractFacets([...papers, ...(feedbackData.payload.papers || [])]);
  
  return {
    ok: true, fromCache: false,
    data: {
      requestedQuery: query, queryUsed: refinedQuery, attemptedQueries: [...data.attemptedQueries, refinedQuery],
      payload: { papers: mergedPapers as SearchTheArxivPaper[], authors: data.payload.authors },
      health: buildHealth(refinedQuery, [...data.attemptedQueries, refinedQuery], data.health.networkAttempts + (feedbackData.health.networkAttempts || 1),
        data.health.cacheHit, data.health.fallbackUsed, { papers: mergedPapers }, true, feedbackKeywords, true, recencyRequired, false, true, suggestedQueries, facets, data.health.sessionContext || false, data.health.queryComplexity || "simple", false)
    } satisfies SearchTheArxivToolData
  };
};
