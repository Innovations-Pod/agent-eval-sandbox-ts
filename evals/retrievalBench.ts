/** Comparing search strategies on one set of questions.
 *
 * Metrics are computed only where the ground truth is non-empty. For uncovered questions
 * something else is measured: whether the retriever was honest enough to return nothing.
 */
import { RETRIEVERS } from "../src/agents/retriever/index.js";
import { RETRIEVAL_CASES } from "./retrieval-truth.js";

const K = 3;

interface Score {
  hit: number;        // share of questions with at least one ground-truth passage in top-K
  precision: number;  // share of relevant passages among those returned
  recall: number;     // share of ground-truth passages that were found
  mrr: number;        // 1/rank of the first hit
  noise: number;      // how many passages were returned where the corpus covers nothing
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
console.log(`\ncases with ground truth: ${covered} · uncovered: ${uncovered} · top-K = ${K}\n`);

const rows: [string, keyof Score, string][] = [
  ["hit rate", "hit", "at least one needed passage in the top 3"],
  ["precision@3", "precision", "share of relevant passages among those returned"],
  ["recall@3", "recall", "how many of the needed passages were found"],
  ["MRR", "mrr", "how high the first hit sits"],
  ["noise", "noise", "passages where the corpus covers nothing (lower = better)"],
];
const w = 14;
console.log("metric".padEnd(w) + names.map((n) => n.padStart(10)).join("") + "   meaning");
console.log("-".repeat(w + names.length * 10 + 50));
for (const [label, key, note] of rows) {
  const cells = names.map((n) => scores[n]![key].toFixed(2).padStart(10)).join("");
  console.log(label.padEnd(w) + cells + "   " + note);
}

console.log("\nby case (top 3):");
for (const c of RETRIEVAL_CASES) {
  const line: string[] = [];
  for (const name of names) {
    const ids = (await RETRIEVERS[name]!.search(c.question, K)).map((h) => h.chunkId);
    const mark = c.expected.length === 0
      ? (ids.length === 0 ? "✅ empty" : `⚠️ ${ids.length} extra`)
      : (ids.some((id) => c.expected.includes(id)) ? "✅" : "❌") + " " + ids.join(",");
    line.push(`${name}: ${mark}`);
  }
  console.log(`  ${c.id.padEnd(9)} [${c.expected.join(",") || "—"}]`.padEnd(34) + line.join("   "));
}
