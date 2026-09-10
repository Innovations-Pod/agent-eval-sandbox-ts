/** Hybrid search: weighted RRF.
 *
 * WHY NOT THE LIBRARY'S `EnsembleRetriever`. It implements exactly the same formula
 * (`weight / (rank + c)`); we tried it and measured it — and it does not work here,
 * for two reasons, both structural:
 *
 * 1. It merges documents BY `pageContent`. In the vector store the text always carries
 *    the `passage:` prefix (the e5 model requires it); in BM25 it does not. To the
 *    library these are DIFFERENT documents, so the ranks of one and the same chunk are
 *    never added and the fusion silently does not happen. There is no error either:
 *    the metrics look plausible, the hybrid has simply stopped being a hybrid.
 *    The texts cannot be aligned — the prefix is exactly what the embeddings need.
 *
 * 2. It discards the fused score and returns only ordered documents. We need that score
 *    for RETRIEVER spans in Phoenix: without `document.score` there is no way to see how
 *    confident the search was.
 *
 * Measured: our own implementation gives recall 1.00 / MRR 1.00, via `EnsembleRetriever`
 * — 0.90 / 1.00. So we keep ours and document the library option here, so that the next
 * person does not spend time on the same attempt.
 */
import { CHUNKS, type Hit, type Retriever } from "./corpus.js";
import { bm25Retriever } from "./bm25.js";
import { langchainRetriever } from "./langchain.js";

/**
 * Weights: how much we trust each method. Measured on `evals/retrievalBench.ts`:
 * equal weights give MRR 0.90, vector ×2 gives 1.00. Our corpus is purely conceptual,
 * with no part numbers or codes, so semantics should weigh more.
 *
 * Rules of thumb from the literature:
 *   part numbers, identifiers, codes → bm25 wins   (≈ 2 / 1)
 *   conceptual, paraphrase-heavy     → vector wins (≈ 1 / 2)  ← our case
 *   mixed                            → equal + a reranker on top
 *
 * The optimum depends on the corpus and DRIFTS — re-measure after knowledge-base changes.
 */
export const WEIGHTS = { bm25: 1, vector: 2 };

/**
 * `c` (historically `k` here) is not “how important the method is” but “how much better
 * first place is than second”. At 60 the gap between #1 and #2 is only 2%, so what decides
 * is the mere fact of appearing in both lists. The default in `EnsembleRetriever`,
 * Elasticsearch and Qdrant.
 */
const C = 60;

export interface Fusion {
  chunkId: string;
  bm25Rank: number | null;
  vectorRank: number | null;
  score: number;
}

/** Ranks in both lists plus the fused score — for telemetry and visualisation. */
export async function fuse(query: string): Promise<Fusion[]> {
  const [bm, vec] = await Promise.all([
    bm25Retriever.search(query, CHUNKS.length),
    langchainRetriever.search(query, CHUNKS.length),
  ]);
  const rankOf = (list: Hit[], id: string): number | null => {
    const i = list.findIndex((h) => h.chunkId === id);
    return i < 0 ? null : i + 1;
  };
  return CHUNKS.map((c) => {
    const b = rankOf(bm, c.chunkId);
    const v = rankOf(vec, c.chunkId);
    const score = (b ? WEIGHTS.bm25 / (C + b) : 0) + (v ? WEIGHTS.vector / (C + v) : 0);
    return { chunkId: c.chunkId, bm25Rank: b, vectorRank: v, score };
  }).sort((a, b) => b.score - a.score);
}

export const hybridRetriever: Retriever = {
  name: "hybrid",
  async search(query: string, k = 3): Promise<Hit[]> {
    const byId = new Map(CHUNKS.map((c) => [c.chunkId, c]));
    return (await fuse(query))
      .filter((f) => f.score > 0)
      .slice(0, k)
      .map((f) => ({
        ...byId.get(f.chunkId)!,
        score: Math.round(f.score * 100000) / 100000,
      }));
  },
};
