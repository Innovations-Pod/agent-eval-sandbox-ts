/** The search tool. The name stays `search_docs` whatever the strategy — otherwise
 *  the trajectories in the dataset would have to be rewritten, and comparing lexical
 *  search against vector search on the same cases would become impossible. */
import { z } from "zod";

import type { RetrieverTool } from "../../types.js";
import type { Hit, Retriever } from "./corpus.js";
import { bm25Retriever } from "./bm25.js";
import { relativeRetriever } from "./fusion.js";
import { hybridRetriever } from "./hybrid.js";
import { langchainRetriever } from "./langchain.js";

export const RETRIEVERS: Record<string, Retriever> = {
  bm25: bm25Retriever,            // lexical, off the shelf
  vector: langchainRetriever,     // vector, off the shelf
  hybrid: hybridRetriever,        // fusion by RANK (RRF), as in Elasticsearch/Qdrant
  relative: relativeRetriever,    // fusion by SCORE, as in Weaviate since v1.24
};

/** The strategy comes from the environment, so the same dataset can be run through both. */
export const activeRetriever = (): Retriever =>
  RETRIEVERS[process.env.RETRIEVER ?? "bm25"] ?? bm25Retriever;

const Input = z.object({ query: z.string().describe("Search query") });

export const searchDocsTool: RetrieverTool = {
  kind: "retriever",
  name: "search_docs",
  description: "Search the internal knowledge base. Returns the most relevant passages.",
  input: Input,
  run: async (a) => JSON.stringify(await activeRetriever().search(Input.parse(a).query)),
  query: (a) => Input.parse(a).query,
  documents: (out) => (JSON.parse(out) as Hit[]).map((h) => ({
    id: h.chunkId,
    content: h.text,
    score: h.score,
  })),
};

export { CHUNKS } from "./corpus.js";
