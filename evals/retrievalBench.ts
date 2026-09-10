/** Порівняння стратегій пошуку на одному наборі питань.
 *
 * Метрики рахуються лише там, де еталон непорожній. Для питань без покриття
 * міряється інше: чи вистачило ретріверу чесності не повернути нічого.
 */
import { RETRIEVERS } from "../src/agents/retriever/index.js";
import { RETRIEVAL_CASES } from "./retrieval-truth.js";

const K = 3;

interface Score {
  hit: number;        // частка питань, де хоч один еталонний фрагмент у топ-K
  precision: number;  // частка релевантних серед виданих
  recall: number;     // частка еталонних, які знайшлися
  mrr: number;        // 1/позиція першого влучання
  noise: number;      // скільки фрагментів видано там, де корпус не покриває питання
}

async function evaluate(name: string): Promise<Score> {
  const retriever = RETRIEVERS[name]!;
  const covered = RETRIEVAL_CASES.filter((c) => c.expected.length > 0);
  const uncovered = RETRIEVAL_CASES.filter((c) => c.expected.length === 0);

  let hits = 0, precision = 0, recall = 0, mrr = 0;
  for (const c of covered) {
    const ids = (await retriever.search(c.question, K)).map((h) => h.chunkId);
    const found = ids.filter((id) => c.expected.includes(id));
    if (found.length > 0) hits++;
    precision += ids.length ? found.length / ids.length : 0;
    recall += found.length / c.expected.length;
    const rank = ids.findIndex((id) => c.expected.includes(id));
    mrr += rank >= 0 ? 1 / (rank + 1) : 0;
  }

  let noise = 0;
  for (const c of uncovered) noise += (await retriever.search(c.question, K)).length;

  const n = covered.length;
  return {
    hit: hits / n,
    precision: precision / n,
    recall: recall / n,
    mrr: mrr / n,
    noise: noise / uncovered.length,
  };
}

const names = Object.keys(RETRIEVERS);
const scores: Record<string, Score> = {};
for (const name of names) scores[name] = await evaluate(name);

const covered = RETRIEVAL_CASES.filter((c) => c.expected.length > 0).length;
const uncovered = RETRIEVAL_CASES.length - covered;
console.log(`\nкейсів з еталоном: ${covered} · без покриття: ${uncovered} · top-K = ${K}\n`);

const rows: [string, keyof Score, string][] = [
  ["hit rate", "hit", "хоч один потрібний фрагмент у топ-3"],
  ["precision@3", "precision", "частка релевантних серед виданих"],
  ["recall@3", "recall", "скільки з потрібних знайшлось"],
  ["MRR", "mrr", "наскільки високо стоїть перше влучання"],
  ["шум", "noise", "фрагментів там, де корпус не покриває (менше = краще)"],
];
const w = 14;
console.log("метрика".padEnd(w) + names.map((n) => n.padStart(10)).join("") + "   що означає");
console.log("-".repeat(w + names.length * 10 + 50));
for (const [label, key, note] of rows) {
  const cells = names.map((n) => scores[n]![key].toFixed(2).padStart(10)).join("");
  console.log(label.padEnd(w) + cells + "   " + note);
}

console.log("\nпо кейсах (топ-3):");
for (const c of RETRIEVAL_CASES) {
  const line: string[] = [];
  for (const name of names) {
    const ids = (await RETRIEVERS[name]!.search(c.question, K)).map((h) => h.chunkId);
    const mark = c.expected.length === 0
      ? (ids.length === 0 ? "✅ порожньо" : `⚠️ ${ids.length} зайвих`)
      : (ids.some((id) => c.expected.includes(id)) ? "✅" : "❌") + " " + ids.join(",");
    line.push(`${name}: ${mark}`);
  }
  console.log(`  ${c.id.padEnd(9)} [${c.expected.join(",") || "—"}]`.padEnd(34) + line.join("   "));
}
