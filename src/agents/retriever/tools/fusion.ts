/** Normalised score fusion — what Weaviate moved to from RRF in v1.24.
 *
 * RRF takes RANKS and throws the scores away. Confidence is lost along with them:
 * a document scoring 0.88 and one scoring 0.81 are merely “first” and “second” to it.
 *
 * relativeScoreFusion instead min-max normalises each list separately (best → 1,
 * worst → 0) and adds them with weights. It has to be min-max, not division by the
 * maximum: cosines sit in a narrow band (~0.73–0.89), and dividing by the top one maps
 * them all to ~0.9–1.0, so the vector stops influencing the order at all. Relative distances survive, and a confident
 * win stays a confident win.
 */
import { CHUNKS, type Hit, type Retriever } from "./corpus.js";
import { bm25Retriever } from "./bm25.js";
import { langchainRetriever } from "./langchain.js";
import { WEIGHTS } from "./hybrid.js";

/** min-max: the best becomes 1, the worst 0. Anything absent from a list stays 0. */
function normalise(hits: Hit[]): Map<string, number> {
  if (hits.length === 0) return new Map();
  const scores = hits.map((h) => h.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min || 1;
  return new Map(hits.map((h) => [h.chunkId, (h.score - min) / span]));
}

export const relativeRetriever: Retriever = {
  name: "relative",
  async search(query: string, k = 3): Promise<Hit[]> {
    const [bm, vec] = await Promise.all([
      bm25Retriever.search(query, CHUNKS.length),
      langchainRetriever.search(query, CHUNKS.length),
    ]);
    const nb = normalise(bm);
    const nv = normalise(vec);
    return CHUNKS
      .map((c) => ({
        ...c,
        score: Math.round(
          (WEIGHTS.bm25 * (nb.get(c.chunkId) ?? 0) +
           WEIGHTS.vector * (nv.get(c.chunkId) ?? 0)) * 10000,
        ) / 10000,
      }))
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  },
};
