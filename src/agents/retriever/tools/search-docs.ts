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

/** The strategy comes from the environment, so the same dataset can be run through both.
 *
 *  The default is `hybrid`, and the honest reason is not that it measured best. On our
 *  corpus it did not: with 27 covered questions, hybrid (k=8) and pure vector score an
 *  identical hit 0.67 and differ by one case out of 27 in MRR — below what a set this
 *  size can resolve at all. Vector is simpler and would do just as well today.
 *
 *  Hybrid is chosen for where the corpus is going, not where it is. Lexical search wins
 *  precisely on exact terms, codes and article numbers — the cases our questions barely
 *  contain today and a real support corpus is full of. Keeping fusion in place means the
 *  answer changes with the data rather than with a rewrite. Set RETRIEVER=vector to
 *  compare at any time. */
export const activeRetriever = (): Retriever =>
  RETRIEVERS[process.env.RETRIEVER ?? "hybrid"] ?? hybridRetriever;

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
