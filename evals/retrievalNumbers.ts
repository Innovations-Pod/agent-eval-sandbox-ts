/** Every number quoted in part 2 of the article (“Search That Cannot Stay Silent”),
 *  reproducible in one run:  node --import tsx evals/retrievalNumbers.ts
 *
 * The main strategy table lives in `retrievalBench.ts`; this script prints everything
 * around it — the BM25 walkthrough, the score ranges, the fusion comparisons, the
 * threshold data. Nothing here calls an LLM: BM25 is arithmetic and the embeddings run
 * locally, so every figure is deterministic.
 */
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";

import { CHUNKS, type Hit } from "../src/agents/retriever/tools/corpus.js";
import { bm25Retriever } from "../src/agents/retriever/tools/bm25.js";
import { langchainRetriever } from "../src/agents/retriever/tools/langchain.js";
import { C, WEIGHTS, fuse, hybridRetriever } from "../src/agents/retriever/tools/hybrid.js";
import { relativeRetriever } from "../src/agents/retriever/tools/fusion.js";
import { retrievalCases, type RetrievalCase } from "./retrieval-truth.js";

const K = 3;
const f2 = (n: number) => n.toFixed(2);
const head = (s: string) => console.log(`\n=== ${s} ${"=".repeat(Math.max(0, 70 - s.length))}`);
const byId = new Map(CHUNKS.map((c) => [c.chunkId, c]));

const customer = retrievalCases("customer");
const document = retrievalCases("document");
const covered = (cs: RetrievalCase[]) => cs.filter((c) => c.expected.length > 0);

type Search = (q: string) => Promise<string[]>;
async function quality(search: Search, cases: RetrievalCase[]) {
  let hit = 0, mrr = 0;
  for (const c of covered(cases)) {
    const ids = await search(c.question);
    const r = ids.findIndex((id) => c.expected.includes(id));
    if (r >= 0) { hit++; mrr += 1 / (r + 1); }
  }
  const n = covered(cases).length;
  return { hit: hit / n, mrr: mrr / n };
}
const ids = (hits: Hit[]) => hits.map((h) => h.chunkId);
const bm25 = async (q: string) => ids(await bm25Retriever.search(q, K));
const vector = async (q: string) => ids(await langchainRetriever.search(q, K));
const hybrid = async (q: string) => ids(await hybridRetriever.search(q, K));

// ---------------------------------------------------------------- corpus
head("corpus");
const words = (s: string) => (s.match(/\w+/g) ?? []).length;
const lengths = CHUNKS.map((c) => words(c.text));
const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
console.log(`documents ${new Set(CHUNKS.map((c) => c.doc)).size} · chunks ${CHUNKS.length} · avg words per chunk ${avgLen.toFixed(1)}`);
const exp = covered(customer).map((c) => c.expected.length);
console.log(`covered questions ${exp.length}: one expected chunk ${exp.filter((n) => n === 1).length}, two ${exp.filter((n) => n === 2).length}`);

// ---------------------------------------------------------------- textbook BM25
// The article's BM25 diagrams use word tokens, as the method is defined. The library in
// bm25.ts differs (substring matching, case-sensitive documents) — measured below.
const tok = (s: string) => s.toLowerCase().match(/\w+/g) ?? [];
const docs = CHUNKS.map((c) => tok(c.text));
const avgTok = docs.reduce((a, d) => a + d.length, 0) / docs.length;
const df = new Map<string, number>();
for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1);
const N = docs.length, K1 = 1.2, B = 0.75;
const idf = (w: string) => Math.log((N - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5) + 1);
const tfOf = (w: string, i: number) => docs[i]!.filter((x) => x === w).length;
const part = (w: string, tf: number, len: number) => idf(w) * tf * (K1 + 1) / (tf + K1 * (1 - B + B * len / avgTok));
function textbook(q: string, k = K) {
  const qs = [...new Set(tok(q))];
  return docs.map((d, i) => ({ id: CHUNKS[i]!.chunkId, i, s: qs.reduce((a, w) => a + (tfOf(w, i) ? part(w, tfOf(w, i), d.length) : 0), 0) }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, k);
}

const Q8 = "How much does domestic delivery of an 8 kg parcel cost?";
head(`textbook BM25 walkthrough · "${Q8}"`);
console.log(`N=${N} chunks · avg length ${avgTok.toFixed(1)} tokens · k1=${K1} · b=${B}`);
console.log("word        chunks  weight(idf)");
for (const w of [...new Set(tok(Q8))].sort((a, b) => idf(b) - idf(a)))
  console.log(`${w.padEnd(12)}${String(df.get(w) ?? 0).padStart(5)}   ${(df.get(w) ? f2(idf(w)) : "—").padStart(6)}`);
for (const w of ["delivery", "kg", "8"]) {
  const post = docs.map((d, i) => [CHUNKS[i]!.chunkId, tfOf(w, i)] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  console.log(`index  ${w.padEnd(9)} → ${post.slice(0, 3).map(([id, n]) => `${id}: ${n}`).join(", ")}${post.length > 3 ? " …" : ""}   (${post.length} chunks)`);
}
for (const hit of textbook(Q8)) {
  const qs = [...new Set(tok(Q8))].filter((w) => tfOf(w, hit.i));
  console.log(`${hit.id} (${docs[hit.i]!.length} tokens) = ${qs.map((w) => `${w} ${tfOf(w, hit.i)}×${f2(idf(w))}→${f2(part(w, tfOf(w, hit.i), docs[hit.i]!.length))}`).join(" + ")} = ${f2(hit.s)}`);
}
const t1 = CHUNKS.findIndex((c) => c.chunkId === "tariffs#1");
console.log(`saturation of "kg" at the length of tariffs#1 (${docs[t1]!.length} tokens):`);
for (const tf of [1, 2, 3, 5, 10, 50])
  console.log(`  ${String(tf).padStart(2)}×  ${f2(part("kg", tf, docs[t1]!.length))}   if linear ${f2(idf("kg") * tf)}`);
console.log(`  ceiling idf×(k1+1) = ${f2(idf("kg") * (K1 + 1))}`);

// ---------------------------------------------------------------- library vs textbook
head("bm25.ts (library) vs textbook BM25 on the customer questions");
const tb = async (q: string) => textbook(q).map((x) => x.id);
for (const [name, s] of [["library", bm25], ["textbook", tb]] as const) {
  const r = await quality(s, customer);
  console.log(`${name.padEnd(9)} hit@3 ${f2(r.hit)}  MRR ${f2(r.mrr)}`);
}
console.log("the library's view of the query: term → chunks it matches (substring, case-sensitive)");
for (const t of Q8.toLowerCase().split(/\s+/))
  console.log(`  ${t.padEnd(9)} library ${String(CHUNKS.filter((c) => c.text.includes(t)).length).padStart(2)}   as a word ${String(df.get(t.replace(/\W/g, "")) ?? 0).padStart(2)}`);

// ---------------------------------------------------------------- score ranges
head("score ranges (top-3 of every question, customer phrasing)");
const all = [...customer];
let bmMin = Infinity, bmMax = 0, vMin = Infinity, vMax = 0;
for (const c of all) {
  for (const h of await bm25Retriever.search(c.question, K)) { bmMin = Math.min(bmMin, h.score); bmMax = Math.max(bmMax, h.score); }
  for (const h of await langchainRetriever.search(c.question, K)) { vMin = Math.min(vMin, h.score); vMax = Math.max(vMax, h.score); }
}
console.log(`BM25 (library)  ${f2(bmMin)} … ${f2(bmMax)}`);
console.log(`vector cosine   ${vMin.toFixed(3)} … ${vMax.toFixed(3)}`);
const PROBES_BM25 = ["kg", Q8, "How much does domestic delivery of an 8 kg parcel cost with declared value insurance and cash on delivery included?"];
for (const q of PROBES_BM25) console.log(`  BM25 top-1, ${String(q.split(/\s+/).length).padStart(2)} words: ${f2((await bm25Retriever.search(q, 1))[0]?.score ?? 0)}   “${q}”`);
const PROBES_VEC: [string, string][] = [
  ["identical text (tariffs#1)", byId.get("tariffs#1")!.text],
  ["another subject (physics)", "The speed of light in a vacuum is about 300,000 kilometres per second."],
  ["another language and subject", "Сьогодні в Києві сонячно, і в парку гуляють діти."],
  ["meaningless string", "qzx vrp lmk tww oiu"],
];
for (const [label, q] of PROBES_VEC) console.log(`  vector top-1, ${label.padEnd(30)} ${(await langchainRetriever.search(q, 1))[0]!.score.toFixed(3)}`);

// ---------------------------------------------------------------- vectors
head(`vectors · "${Q8}"`);
const emb = new HuggingFaceTransformersEmbeddings({ model: "Xenova/multilingual-e5-small" });
const qv = await emb.embedQuery(`query: ${Q8}`);
const top = await langchainRetriever.search(Q8, 5);
console.log(`dimensions ${qv.length} · |query| = ${Math.hypot(...qv).toFixed(4)}`);
console.log(`query      [ ${qv.slice(0, 5).map((x) => x.toFixed(3)).join("  ")} … ]`);
for (const h of top.slice(0, 5)) {
  const dv = (await emb.embedDocuments([`passage: ${h.text}`]))[0]!;
  const dot = dv.reduce((a, x, i) => a + x * qv[i]!, 0);
  console.log(`${h.chunkId.padEnd(10)} [ ${dv.slice(0, 5).map((x) => x.toFixed(3)).join("  ")} … ]  cosine ${dot.toFixed(4)}  |v| ${Math.hypot(...dv).toFixed(4)}`);
}

// ---------------------------------------------------------------- agreement
head("which search finds what (27 answerable, customer phrasing)");
let both = 0, onlyV = 0, onlyB = 0, none = 0;
for (const c of covered(customer)) {
  const b = (await bm25(c.question)).some((id) => c.expected.includes(id));
  const v = (await vector(c.question)).some((id) => c.expected.includes(id));
  if (b && v) both++; else if (v) onlyV++; else if (b) onlyB++; else none++;
}
console.log(`both ${both} · only vector ${onlyV} · only BM25 ${onlyB} · neither ${none}`);

// ---------------------------------------------------------------- RRF example
const QA = "I am away for two weeks. Will it wait for me?";
head(`RRF worked example · "${QA}"  (k = ${C}, weights ${WEIGHTS.bm25}:${WEIGHTS.vector})`);
const fused = await fuse(QA);
console.log("chunk        BM25  vector   1/(k+b)  2/(k+v)   sum");
for (const f of fused.slice(0, 7))
  console.log(`${f.chunkId.padEnd(12)} #${String(f.bm25Rank).padEnd(4)} #${String(f.vectorRank).padEnd(5)} ${(f.bm25Rank ? WEIGHTS.bm25 / (C + f.bm25Rank) : 0).toFixed(4)}   ${(f.vectorRank ? WEIGHTS.vector / (C + f.vectorRank) : 0).toFixed(4)}   ${f.score.toFixed(4)}`);
console.log(`top-3  BM25 ${(await bm25(QA)).join(", ")} · vector ${(await vector(QA)).join(", ")} · hybrid ${(await hybrid(QA)).join(", ")}`);

// ---------------------------------------------------------------- k and weights
head("RRF constant k and weights (customer phrasing)");
for (const k of [1, 3, 5, 8, 10, 20, 60]) {
  const r = await quality(async (q) => (await fuse(q, k)).filter((f) => f.score > 0).slice(0, K).map((f) => f.chunkId), customer);
  console.log(`k = ${String(k).padEnd(3)} hit ${f2(r.hit)}  MRR ${f2(r.mrr)}${k === C ? "   ← ours" : ""}${k === 60 ? "   ← industry default" : ""}`);
}
for (const w of [{ bm25: 1, vector: 1 }, { bm25: 1, vector: 2 }, { bm25: 2, vector: 1 }]) {
  const r = await quality(async (q) => (await fuse(q, C, w)).filter((f) => f.score > 0).slice(0, K).map((f) => f.chunkId), customer);
  console.log(`weights ${w.bm25}:${w.vector}  hit ${f2(r.hit)}  MRR ${f2(r.mrr)}`);
}
console.log(`at k = 60: rank 1 → ${(1 / 61).toFixed(4)}, rank 5 → ${(1 / 65).toFixed(4)}`);

// ---------------------------------------------------------------- score fusion
head("fusing ranks vs fusing scores (customer phrasing)");
async function byMax(q: string, k = K): Promise<string[]> {
  const [bm, vec] = await Promise.all([bm25Retriever.search(q, CHUNKS.length), langchainRetriever.search(q, CHUNKS.length)]);
  const norm = (hs: Hit[]) => { const m = Math.max(...hs.map((h) => h.score)) || 1; return new Map(hs.map((h) => [h.chunkId, h.score / m])); };
  const nb = norm(bm), nv = norm(vec);
  return CHUNKS.map((c) => ({ id: c.chunkId, s: WEIGHTS.bm25 * (nb.get(c.chunkId) ?? 0) + WEIGHTS.vector * (nv.get(c.chunkId) ?? 0) }))
    .sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.id);
}
const minmax = async (q: string) => ids(await relativeRetriever.search(q, K));
for (const [name, s] of [["RRF (ranks)", hybrid], ["min-max (scores)", minmax], ["divide by max", byMax]] as const) {
  const r = await quality(s, customer);
  console.log(`${name.padEnd(17)} hit ${f2(r.hit)}  MRR ${f2(r.mrr)}`);
}
{
  const [bm, vec] = await Promise.all([bm25Retriever.search(Q8, CHUNKS.length), langchainRetriever.search(Q8, CHUNKS.length)]);
  const rng = (hs: Hit[]) => [Math.min(...hs.map((h) => h.score)), Math.max(...hs.map((h) => h.score))] as const;
  const [bl, bh] = rng(bm), [vl, vh] = rng(vec);
  console.log(`\n"${Q8}" — every chunk: BM25 ${f2(bl)}…${f2(bh)} over ${bm.length} chunks · vector ${vl.toFixed(3)}…${vh.toFixed(3)} over ${vec.length}`);
  const rank = (hs: Hit[], id: string) => hs.findIndex((h) => h.chunkId === id) + 1 || null;
  const bmS = new Map(bm.map((h) => [h.chunkId, h.score])), vS = new Map(vec.map((h) => [h.chunkId, h.score]));
  const rows = CHUNKS.map((c) => {
    const b = bmS.get(c.chunkId) ?? 0, v = vS.get(c.chunkId) ?? 0;
    const mmB = bm.length ? (b - bl) / (bh - bl || 1) : 0, mmV = (v - vl) / (vh - vl || 1);
    return { id: c.chunkId, b, v, mmB: bmS.has(c.chunkId) ? mmB : 0, mmV, mxB: b / bh, mxV: v / vh,
      rb: rank(bm, c.chunkId), rv: rank(vec, c.chunkId) };
  });
  const show = (label: string, key: (r: (typeof rows)[number]) => number, fb: (r: (typeof rows)[number]) => number, fv: (r: (typeof rows)[number]) => number) => {
    console.log(`${label}\nchunk        bm25 → norm     vector → norm    ranks b/v   sum`);
    for (const r of [...rows].sort((a, b) => key(b) - key(a)).slice(0, 4))
      console.log(`${r.id.padEnd(12)} ${f2(r.b).padStart(5)} → ${f2(fb(r))}    ${r.v.toFixed(3)} → ${f2(fv(r))}     ${String(r.rb).padStart(2)} / ${String(r.rv).padEnd(2)}      ${f2(key(r))}`);
  };
  show("min-max:", (r) => WEIGHTS.bm25 * r.mmB + WEIGHTS.vector * r.mmV, (r) => r.mmB, (r) => r.mmV);
  show("divide by max:", (r) => WEIGHTS.bm25 * r.mxB + WEIGHTS.vector * r.mxV, (r) => r.mxB, (r) => r.mxV);
}

// ---------------------------------------------------------------- phrasing
head("phrasing: the same 27 targets, two ways of asking");
const content = (s: string) => new Set(tok(s).filter((w) => w.length > 2 && !STOP.has(w)));
const STOP = new Set(["the", "and", "for", "are", "can", "what", "how", "does", "will", "that", "this", "with", "you", "your", "our", "from", "have", "has", "was", "which", "when", "there", "any", "not", "its", "who", "into", "out", "all", "one", "just", "much", "long", "should", "take", "get", "about"]);
for (const [name, cs] of [["document", document], ["customer", customer]] as const) {
  let sum = 0, full = 0;
  for (const c of covered(cs)) {
    const q = content(c.question);
    const d = new Set(c.expected.flatMap((id) => [...content(byId.get(id)!.text)]));
    const share = q.size ? [...q].filter((w) => d.has(w)).length / q.size : 0;
    sum += share; if (share === 1) full++;
  }
  const n = covered(cs).length;
  const v = await quality(vector, cs), h = await quality(hybrid, cs), b = await quality(bm25, cs);
  console.log(`${name.padEnd(9)} overlap ${(100 * sum / n).toFixed(0)}% (100%: ${full}/${n})  vector hit ${f2(v.hit)} MRR ${f2(v.mrr)} · hybrid hit ${f2(h.hit)} MRR ${f2(h.mrr)} · bm25 hit ${f2(b.hit)}`);
}

// ---------------------------------------------------------------- threshold
head("threshold: top-1 cosine of every question (customer phrasing)");
const tops = [];
for (const c of customer) tops.push({ id: c.id, s: (await langchainRetriever.search(c.question, 1))[0]!.score, hit: c.expected.length > 0 });
tops.sort((a, b) => b.s - a.s);
const hits = tops.filter((t) => t.hit), inv = tops.filter((t) => !t.hit);
const worstHit = Math.min(...hits.map((t) => t.s)), bestInv = Math.max(...inv.map((t) => t.s));
console.log(`worst answerable top-1 ${worstHit.toFixed(3)} · best unanswerable top-1 ${bestInv.toFixed(3)} · answerable between them ${hits.filter((t) => t.s <= bestInv).length}/${hits.length}`);
console.log(`at threshold ${worstHit.toFixed(3)}: kept ${hits.filter((t) => t.s >= worstHit).length}/${hits.length}, admitted ${inv.filter((t) => t.s >= worstHit).length}/${inv.length}`);
console.log(`DATA = ${JSON.stringify(tops.map((t) => ({ id: t.id, s: Math.round(t.s * 1000) / 1000, hit: t.hit })))}`);

{
  const dtops = [];
  for (const c of document) dtops.push({ s: (await langchainRetriever.search(c.question, 1))[0]!.score, hit: c.expected.length > 0 });
  const dh = dtops.filter((t) => t.hit), di = dtops.filter((t) => !t.hit);
  const lo = Math.min(...dh.map((t) => t.s)), hi = Math.max(...di.map((t) => t.s));
  console.log(`document phrasing: worst answerable top-1 ${lo.toFixed(3)} · best unanswerable ${hi.toFixed(3)} · answerable between them ${dh.filter((t) => t.s <= hi).length}/${dh.length}`);
}
