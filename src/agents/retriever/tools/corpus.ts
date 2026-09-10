/** The corpus: reading documents and chunking. Shared by every search strategy —
 *  what changes is how we compare, not what we compare. */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const KB_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "kb");

export interface Chunk {
  doc: string;
  chunkId: string;
  title: string;
  text: string;
}

export interface Hit extends Chunk {
  score: number;
}

/** Paragraph chunking that keeps the document heading (contextual chunking). */
function loadChunks(): Chunk[] {
  const chunks: Chunk[] = [];
  for (const file of readdirSync(KB_DIR).filter((f) => f.endsWith(".md")).sort()) {
    const raw = readFileSync(join(KB_DIR, file), "utf-8");
    const title = (raw.split("\n")[0] ?? "").replace(/^#+\s*/, "").trim();
    raw.split("\n\n").forEach((part, i) => {
      const body = part.trim();
      if (!body) return;
      chunks.push({
        doc: file,
        chunkId: `${file.replace(/\.md$/, "")}#${i}`,
        title,
        text: i === 0 ? body : `[${title}]\n${body}`,
      });
    });
  }
  return chunks;
}

export const CHUNKS: Chunk[] = loadChunks();

/** The search-strategy contract. Lexical and vector are interchangeable. */
export interface Retriever {
  readonly name: string;
  search(query: string, k?: number): Promise<Hit[]>;
}
