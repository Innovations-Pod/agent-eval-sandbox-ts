/** Лексичний пошук на BM25 із коробки.
 *
 * Замінив власну реалізацію на IDF: BM25 — той самий принцип «рідкісні слова
 * важать більше», але зрілий: враховує ще й довжину документа та насиченість
 * терміном. Свого коду тут нуль, лише перекладення форматів.
 *
 * Одна втрата, яку варто знати: наш IDF різав слова до 5 символів — грубий
 * стемінг під українську морфологію. BM25 такого не робить, тому «доставки»
 * і «доставка» для нього різні слова. Наскільки це псує результат — видно
 * в `evals/retrievalBench.ts`.
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

/** Нативний ретрівер LangChain — потрібен EnsembleRetriever у hybrid.ts. */
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
      // BM25 повертає рівно k документів завжди; нульовий скор означає
      // «жодного перетину», і такий результат чесніше не показувати.
      .filter((h) => h.score > 0);
  },
};
