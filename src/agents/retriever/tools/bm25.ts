/** Lexical search on off-the-shelf BM25.
 *
 * Replaced our own IDF implementation: BM25 is the same “rare words weigh more”
 * principle, but mature — it also accounts for document length and term saturation.
 * There is zero logic of our own here, only format shuffling.
 *
 * One loss worth knowing about: our IDF truncated words to 5 characters — a crude
 * stemmer aimed at the Ukrainian morphology of the original corpus. BM25 does no such
 * thing, so “deliveries” and “delivery” are different words to it. How much that costs
 * is visible in `evals/retrievalBench.ts`.
 */
import { Document } from "@langchain/core/documents";
import { BM25Retriever } from "@langchain/community/retrievers/bm25";

import { CHUNKS, type Hit, type Retriever } from "./corpus.js";

const docs = CHUNKS.map(
  (c) => new Document({
    pageContent: c.text,
    metadata: { chunkId: c.chunkId, doc: c.doc, title: c.title, text: c.text },
  }),
);

/** A native LangChain retriever — needed by EnsembleRetriever in hybrid.ts. */
export const nativeBm25 = (k = 3): BM25Retriever =>
  BM25Retriever.fromDocuments(docs, { k, includeScore: true });

export const bm25Retriever: Retriever = {
  name: "bm25",
  async search(query: string, k = 3): Promise<Hit[]> {
    const retriever = nativeBm25(k);
    const found = await retriever.invoke(query);
    return found
      .map((d) => ({
        doc: String(d.metadata.doc),
        chunkId: String(d.metadata.chunkId),
        title: String(d.metadata.title),
        text: String(d.metadata.text),
        score: Math.round(Number(d.metadata.bm25Score ?? 0) * 1000) / 1000,
      }))
      // BM25 always returns exactly k documents; a zero score means “no overlap at
      // all”, and it is more honest not to show a result like that.
      .filter((h) => h.score > 0);
  },
};
