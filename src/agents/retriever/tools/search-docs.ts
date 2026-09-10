/** Інструмент пошуку. Ім'я лишається `search_docs` за будь-якої стратегії —
 *  інакше траєкторії в датасеті довелося б переписувати, і порівняти
 *  лексичний пошук із векторним на тих самих кейсах стало б неможливо. */
import { z } from "zod";

import type { RetrieverTool } from "../../types.js";
import type { Hit, Retriever } from "./corpus.js";
import { bm25Retriever } from "./bm25.js";
import { relativeRetriever } from "./fusion.js";
import { hybridRetriever } from "./hybrid.js";
import { langchainRetriever } from "./langchain.js";

export const RETRIEVERS: Record<string, Retriever> = {
  bm25: bm25Retriever,            // лексичний, із коробки
  vector: langchainRetriever,     // векторний, із коробки
  hybrid: hybridRetriever,        // злиття за МІСЦЯМИ (RRF), як у Elasticsearch/Qdrant
  relative: relativeRetriever,    // злиття за СКОРАМИ, як у Weaviate з v1.24
};

/** Стратегія береться з середовища, щоб той самий датасет прогнати обома. */
export const activeRetriever = (): Retriever =>
  RETRIEVERS[process.env.RETRIEVER ?? "bm25"] ?? bm25Retriever;

const Input = z.object({ query: z.string().describe("Пошуковий запит") });

export const searchDocsTool: RetrieverTool = {
  kind: "retriever",
  name: "search_docs",
  description: "Пошук по внутрішній базі знань. Повертає найрелевантніші фрагменти.",
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
