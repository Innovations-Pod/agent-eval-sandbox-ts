/** Той самий векторний пошук, але зібраний із готових частин LangChain.
 *
 * Реалізує той самий інтерфейс `Retriever`, що й дві попередні — саме заради
 * цього інтерфейс і робився.
 *
 * УВАГА про імпорт: у LangChain JS v1 `MemoryVectorStore` прибрали з основного
 * пакета. Він живе в `@langchain/classic` — пакеті сумісності. У `@langchain/community`
 * з 43 векторсторів немає жодного суто в памʼяті: faiss і hnswlib тягнуть нативні
 * залежності. Приклади з інтернету з `langchain/vectorstores/memory` не запускаються.
 */
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { Document } from "@langchain/core/documents";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

import { CHUNKS, type Hit, type Retriever } from "./corpus.js";

const MODEL = "Xenova/multilingual-e5-small";

let store: MemoryVectorStore | null = null;

async function ensureStore(): Promise<MemoryVectorStore> {
  if (store) return store;
  const embeddings = new HuggingFaceTransformersEmbeddings({ model: MODEL });
  const docs = CHUNKS.map(
    (c) => new Document({
      // Той самий префікс, що й у ручній версії: e5 навчена асиметрично,
      // і LangChain про це не знає — префікс лишається нашою відповідальністю.
      pageContent: `passage: ${c.text}`,
      metadata: { chunkId: c.chunkId, doc: c.doc, title: c.title, text: c.text },
    }),
  );
  store = await MemoryVectorStore.fromDocuments(docs, embeddings);
  return store;
}

/** Векторний стор як нативний ретрівер LangChain — для EnsembleRetriever. */
export const nativeVector = async (k = 3) => (await ensureStore()).asRetriever({ k });

export const langchainRetriever: Retriever = {
  name: "langchain",
  async search(query: string, k = 3): Promise<Hit[]> {
    const vs = await ensureStore();
    const results = await vs.similaritySearchWithScore(`query: ${query}`, k);
    return results.map(([doc, score]: [Document, number]) => ({
      doc: String(doc.metadata.doc),
      chunkId: String(doc.metadata.chunkId),
      title: String(doc.metadata.title),
      text: String(doc.metadata.text),
      score: Math.round(score * 1000) / 1000,
    }));
  },
};
