import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import {
  checkpointTemplate,
  evidenceNoteTemplate,
  overnightProtocol,
  researchFolderGuide,
  stopConditionGuide,
  taskQueueTemplate,
  validationRubric
} from "./content/resources.js";
import { requestSearchTheArxiv } from "./core/search.js";
import { type SearchTheArxivToolData } from "./core/types.js";

const formatToolOutput = (title: string, payload: unknown): string => `${title}\n\n${JSON.stringify(payload, null, 2)}`;

const toolError = (status: number, message: string, details: unknown) => ({
  isError: true,
  content: [
    {
      type: "text" as const,
      text: formatToolOutput("searchthearxiv request failed", { status, message, details })
    }
  ]
});

const registerTextResource = (server: McpServer, name: string, uri: string, title: string, description: string, text: string): void => {
  server.registerResource(
    name,
    uri,
    { title, description, mimeType: "text/markdown" },
    async resourceUri => ({
      contents: [
        {
          uri: resourceUri.href,
          mimeType: "text/markdown",
          text
        }
      ]
    })
  );
};

const server = new McpServer(
  {
    name: "researchplus",
    version: "1.0.0",
    description: "searchthearxiv-only MCP server for autonomous research workflows"
  },
  {
    capabilities: {
      logging: {}
    },
    instructions: overnightProtocol
  }
);

[
  ["research_folder_map", "instruction://research-folder-map", "Research Folder Map", "Canonical layout for research notes, evidence, checkpoints, queues, and templates", researchFolderGuide],
  ["overnight_research_protocol", "instruction://overnight-research-loop", "Overnight Research Loop", "Strict autonomous ultimate research protocol", overnightProtocol],
  ["research_memory_template", "instruction://research-memory-template", "Research Memory Template", "Markdown template for storing per-idea paper analysis, implementation, and validation outcomes", "# Idea\n\nStore this note in `research/ideas/` and keep supporting passages in `research/evidence/` when needed.\n\n## Goal\n\n## Papers\n- Paper ID:\n- Title:\n- Why relevant:\n\n## Findings\n\n## Candidate implementation\n\n## Validation plan\n\n## Result\n- Outcome:\n- Notes:\n"],
  ["research_evidence_template", "instruction://research-evidence-template", "Research Evidence Template", "Markdown template for storing extracted source notes and supporting passages", evidenceNoteTemplate],
  ["research_session_checkpoint", "instruction://research-session-checkpoint", "Research Session Checkpoint", "Compact checkpoint template for compaction-safe long-running research sessions", checkpointTemplate],
  ["research_task_queue", "instruction://research-task-queue", "Research Task Queue", "Round-robin task queue template for long-running research sessions", taskQueueTemplate],
  ["research_stop_condition", "instruction://research-stop-condition", "Research Stop Condition", "Bounded execution slice and exact-count pause guidance", stopConditionGuide],
  ["research_validation_rubric", "instruction://research-validation-rubric", "Research Validation Rubric", "Evidence-backed checklist for ranking and validating research ideas", validationRubric]
].forEach(([name, uri, title, description, text]) => registerTextResource(server, name, uri, title, description, text));

server.registerTool(
  "search_literature",
  {
    title: "Search Literature",
    description: "Search papers with searchthearxiv relevance ranking",
    inputSchema: z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional()
    })
  },
  async ({ query, limit, offset }) => {
    const result = await requestSearchTheArxiv(query);
    if (!result.ok) return toolError(result.status, result.message, result.details);

    const payloadRoot = result.data as SearchTheArxivToolData;
    const papers = Array.isArray(payloadRoot.payload.papers) ? payloadRoot.payload.papers : [];
    const authors = Array.isArray(payloadRoot.payload.authors) ? payloadRoot.payload.authors : [];
    const paperStart = Math.max(0, offset ?? 0);
    const paperEnd = paperStart + Math.max(1, limit ?? 10);
    const selectedPapers = papers.slice(paperStart, paperEnd).map(paper => ({
      paperId: paper.id,
      score: paper.score,
      title: paper.title ?? null,
      authors: paper.authors ?? null,
      abstract: paper.abstract ?? null,
      year: paper.year ?? null,
      month: paper.month ?? null,
      authorsParsed: paper.authors_parsed ?? []
    }));
    const selectedAuthors = authors.slice(0, 10).map(author => ({
      author: author.author,
      avgScore: author.avg_score ?? null,
      papers: Array.isArray(author.papers)
        ? author.papers.slice(0, 10).map(paper => ({
            paperId: paper.id,
            score: paper.score,
            title: paper.title ?? null,
            year: paper.year ?? null
          }))
        : []
    }));
    const normalized = {
      query,
      queryUsed: payloadRoot.queryUsed,
      attemptedQueries: payloadRoot.attemptedQueries,
      fallbackUsed: payloadRoot.health.fallbackUsed,
      total: papers.length,
      offset: paperStart,
      next: paperEnd < papers.length ? paperEnd : null,
      count: selectedPapers.length,
      fromCache: result.fromCache,
      health: payloadRoot.health,
      papers: selectedPapers,
      authors: selectedAuthors,
      source: "searchthearxiv"
    };

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${selectedPapers.length} paper results for query: ${query}`
        },
        {
          type: "text" as const,
          text: formatToolOutput("search_literature payload", normalized)
        }
      ],
      structuredContent: normalized
    };
  }
);

server.registerPrompt(
  "overnight_research_bootstrap",
  {
    title: "Ultimate Research Bootstrap",
    description: "Prompt template for kicking off the compaction-safe research loop",
    argsSchema: {
      goal: z.string().optional(),
      stopAtCompletedTodos: z.number().int().min(1).optional()
    }
  },
  ({ goal, stopAtCompletedTodos }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `${overnightProtocol}\nUse instruction://research-folder-map as the layout reference, instruction://research-session-checkpoint as the live state buffer, instruction://research-task-queue as the live work queue, instruction://research-stop-condition for exact pause behavior, instruction://research-validation-rubric for idea ranking, and instruction://research-evidence-template for extracted notes.\nProject goal: ${goal || "Improve project quality with evidence-driven implementations."}${typeof stopAtCompletedTodos === "number" ? `\nOperator stop condition: stop at exactly ${stopAtCompletedTodos} completed todos, write the checkpoint, and pause for the next operator instruction.` : ""}`
        }
      }
    ]
  })
);

const main = async (): Promise<void> => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("researchplus MCP server running on stdio");
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exit(1);
});
