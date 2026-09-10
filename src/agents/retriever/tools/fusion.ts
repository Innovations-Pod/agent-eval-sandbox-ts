/** Нормалізоване злиття скорів — те, на що Weaviate перейшов з RRF у v1.24.
 *
 * RRF бере МІСЦЯ й викидає скори. Через це втрачається впевненість: документ
 * зі скором 0.88 і документ зі скором 0.81 для нього просто «перший» і «другий».
 *
 * relativeScoreFusion натомість min-max нормалізує кожен список окремо
 * (найкращий → 1, найгірший → 0) і додає з вагами. Відносні відстані
 * зберігаються, і впевнена перемога лишається впевненою.
 */
import { CHUNKS, type Hit, type Retriever } from "./corpus.js";
import { bm25Retriever } from "./bm25.js";
import { langchainRetriever } from "./langchain.js";
import { WEIGHTS } from "./hybrid.js";

/** min-max: найкращий стає 1, найгірший 0. Відсутні в списку лишаються 0. */
function normalise(hits: Hit[]): Map<string, number> {
  const scores = hits.map((h) => h.score);
  const min = Math.min(...scores, 0);
  const max = Math.max(...scores, 0);
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
