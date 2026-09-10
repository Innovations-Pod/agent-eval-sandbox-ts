/** Гібридний пошук: зважений RRF.
 *
 * ЧОМУ НЕ `EnsembleRetriever` З БІБЛІОТЕКИ. Він реалізує рівно ту саму формулу
 * (`weight / (rank + c)`), ми його спробували й поміряли — і він тут не працює
 * з двох причин, обидві структурні:
 *
 * 1. Зливає документи ЗА `pageContent`. У векторному сторі текст обовʼязково
 *    з префіксом `passage:` (цього вимагає модель e5), у BM25 — без нього.
 *    Для бібліотеки це РІЗНІ документи, тож місця одного й того самого чанка
 *    не додаються, і злиття мовчки не відбувається. Помилки при цьому немає:
 *    метрики виглядають правдоподібно, просто гібрид перестає бути гібридом.
 *    Вирівняти тексти не можна — префікс потрібен саме для якості ембедінгів.
 *
 * 2. Викидає злитий скор, повертаючи лише впорядковані документи. Нам скор
 *    потрібен для спанів RETRIEVER у Phoenix: без `document.score` не видно,
 *    наскільки впевненим був пошук.
 *
 * Виміряно: власна реалізація дає recall 1.00 / MRR 1.00, через
 * `EnsembleRetriever` — 0.90 / 1.00. Тому лишаємо своє, а бібліотечне
 * рішення документуємо тут, щоб наступний не витрачав час на ту саму спробу.
 */
import { CHUNKS, type Hit, type Retriever } from "./corpus.js";
import { bm25Retriever } from "./bm25.js";
import { langchainRetriever } from "./langchain.js";

/**
 * Ваги: наскільки довіряємо кожному методу. Виміряно на `evals/retrievalBench.ts`:
 * рівні ваги дають MRR 0.90, вектор ×2 — 1.00. Наш корпус суто концептуальний,
 * без артикулів і кодів, тому семантика має важити більше.
 *
 * Орієнтири з літератури:
 *   артикули, ідентифікатори, коди → bm25 переважає   (≈ 2 / 1)
 *   концептуальні, перефразування  → вектор переважає (≈ 1 / 2)  ← наш випадок
 *   змішані                        → рівні + реранкер згори
 *
 * Оптимум залежить від корпусу й ДРЕЙФУЄ — переміряти після змін бази знань.
 */
export const WEIGHTS = { bm25: 1, vector: 2 };

/**
 * `c` (у нас історично `k`) — не «важливість методу», а «наскільки перше місце
 * кращe за друге». При 60 розрив між #1 і #2 усього 2%, тож вирішує сам факт
 * присутності в обох списках. Дефолт `EnsembleRetriever`, Elasticsearch і Qdrant.
 */
const C = 60;

export interface Fusion {
  chunkId: string;
  bm25Rank: number | null;
  vectorRank: number | null;
  score: number;
}

/** Місця в обох списках і злитий скор — для телеметрії та візуалізації. */
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
