/** The same vector search, assembled out of ready-made LangChain parts.
 *
 * It implements the same `Retriever` interface as the other two — which is precisely
 * what the interface was made for.
 *
 * A NOTE ON THE IMPORT: in LangChain JS v1, `MemoryVectorStore` was removed from the
 * main package. It lives in `@langchain/classic`, the compatibility package. Of the 43
 * vector stores in `@langchain/community`, not one is purely in-memory: faiss and hnswlib
 * pull in native dependencies. Examples on the web that import
 * `langchain/vectorstores/memory` do not run.
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
      // The same prefix as in the hand-rolled version: e5 is trained asymmetrically,
      // and LangChain does not know that — the prefix stays our responsibility.
      pageContent: `passage: ${c.text}`,
      metadata: { chunkId: c.chunkId, doc: c.doc, title: c.title, text: c.text },
    }),
  );
  store = await MemoryVectorStore.fromDocuments(docs, embeddings);
  return store;
}

/** The vector store as a native LangChain retriever — for EnsembleRetriever. */
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
