/** Incremental indexing on our corpus — the numbers in part 2, section 06.
 *
 *   node --import tsx evals/indexingDemo.ts
 *
 * LangChain's `index()` keeps a journal (RecordManager) of content hashes next to the
 * vector store, so on the next run only changed chunks go through the embedding model.
 * The model is wrapped in a counter: every figure below is how many texts it embedded.
 */
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { InMemoryRecordManager } from "@langchain/community/indexes/memory";
import { Document } from "@langchain/core/documents";
import { index } from "@langchain/core/indexing";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

import { CHUNKS } from "../src/agents/retriever/tools/corpus.js";

class CountingEmbeddings extends HuggingFaceTransformersEmbeddings {
  embedded = 0;
  override async embedDocuments(texts: string[]): Promise<number[][]> {
    this.embedded += texts.length;
    return super.embedDocuments(texts);
  }
}
const model = new CountingEmbeddings({ model: "Xenova/multilingual-e5-small" });

/** MemoryVectorStore ignores the ids index() passes and cannot delete. Both fixed here. */
class DeletableMemoryStore extends MemoryVectorStore {
  override async addDocuments(docs: Document[], options?: { ids?: string[] }): Promise<void> {
    return super.addDocuments(docs.map((d, i) => new Document({ ...d, id: options?.ids?.[i] ?? d.id })));
  }
  override async delete({ ids }: { ids: string[] }): Promise<void> {
    const drop = new Set(ids);
    this.memoryVectors = this.memoryVectors.filter((v) => !v.id || !drop.has(v.id));
  }
}

type Meta = "source" | "source+chunkId";
const toDocs = (chunks: { doc: string; chunkId: string; text: string }[], meta: Meta) =>
  chunks.map((c) => new Document({
    pageContent: `passage: ${c.text}`,
    metadata: meta === "source" ? { source: c.doc } : { source: c.doc, chunkId: c.chunkId },
  }));

async function fresh() {
  const recordManager = new InMemoryRecordManager();
  await recordManager.createSchema();
  return { recordManager, vectorStore: new DeletableMemoryStore(model) };
}
async function run(label: string, s: Awaited<ReturnType<typeof fresh>>, docs: Document[], cleanup: "incremental" | "full") {
  const before = model.embedded;
  const r = await index({ docsSource: docs, ...s, options: { cleanup, sourceIdKey: "source" } });
  console.log(`${label.padEnd(40)} added ${String(r.numAdded).padStart(2)}  skipped ${String(r.numSkipped).padStart(2)}  deleted ${String(r.numDeleted).padStart(2)}  embedded ${String(model.embedded - before).padStart(2)}`);
}

// 0. Without the subclass: what the stock store does.
try { await new MemoryVectorStore(model).delete({ ids: ["x"] }); }
catch (e) { console.log(`stock MemoryVectorStore.delete(): ${(e as Error).message}\n`); }

// 1. The corpus changes over time.
console.log(`corpus: ${CHUNKS.length} chunks · cleanup: incremental`);
const s = await fresh();
const all = CHUNKS;
await run("1. first run", s, toDocs(all, "source"), "incremental");
await run("2. run with no changes", s, toDocs(all, "source"), "incremental");
const edited = all.map((c) => c.chunkId === "tariffs#1" ? { ...c, text: c.text.replace("95 UAH", "99 UAH") } : c);
if (edited.every((c, i) => c.text === all[i]!.text)) throw new Error("the edit did not apply");
await run("3. one number changed in tariffs.md", s, toDocs(edited, "source"), "incremental");
const pickup = edited.filter((c) => c.doc === "pickup.md").length;
const withoutPickup = edited.filter((c) => c.doc !== "pickup.md");
await run(`4. pickup.md deleted (${pickup} chunks)`, s, toDocs(withoutPickup, "source"), "incremental");
await run("   the same deletion, cleanup: full", s, toDocs(withoutPickup, "source"), "full");
console.log(`vectors left in the store: ${s.vectorStore.memoryVectors.length}`);

// 2. A paragraph inserted into the middle of one document: what the metadata decides.
const DOC = "sla.md";
const original = CHUNKS.filter((c) => c.doc === DOC);
const mid = Math.floor(original.length / 2);
const inserted = [...original.slice(0, mid), { ...original[mid]!, text: "[Service level agreement]\nA new paragraph inserted in the middle." }, ...original.slice(mid)]
  .map((c, i) => ({ ...c, chunkId: `${DOC.replace(/\.md$/, "")}#${i}` }));
console.log(`\n${DOC}: ${original.length} chunks, one paragraph inserted after chunk ${mid}`);
for (const meta of ["source", "source+chunkId"] as Meta[]) {
  const t = await fresh();
  await run(`metadata ${meta}: first run`, t, toDocs(original, meta), "incremental");
  await run(`metadata ${meta}: after the insertion`, t, toDocs(inserted, meta), "incremental");
}
