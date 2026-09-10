/** A readable view of the latest trace.
 *
 * LangGraph writes a lot of internal machinery: __start__, RunnableSequence,
 * RunnableLambda, prompt, ChannelWrite. They say nothing about your system but inflate
 * the tree threefold.
 *
 * We do not drop them — we COLLAPSE them: children are re-parented to the nearest
 * meaningful ancestor. Dropping would orphan the LLM spans that sit inside
 * RunnableSequence, and the tree would fall apart.
 */
import { AGENTS, LEAF_TOOLS } from "./src/agents/index.js";
import { PHOENIX_ENDPOINT } from "./src/config.js";

interface Span {
  name: string;
  span_kind: string;
  parent_id: string | null;
  start_time: string;
  end_time: string;
  context: { span_id: string; trace_id: string };
  attributes: Record<string, unknown>;
}

const project = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "mas-sandbox-ts";
const showAll = process.argv.includes("--all");

const projects = (await (await fetch(`${PHOENIX_ENDPOINT}/v1/projects`)).json()) as
  { data: { id: string; name: string }[] };
const found = projects.data.find((p) => p.name === project);
if (!found) {
  console.error(`project “${project}” not found. Available: ${projects.data.map((p) => p.name).join(", ")}`);
  process.exit(1);
}

const res = (await (await fetch(
  `${PHOENIX_ENDPOINT}/v1/projects/${found.id}/spans?limit=1000`,
)).json()) as { data: Span[] };

const byTrace = new Map<string, Span[]>();
for (const s of res.data) {
  const id = s.context.trace_id;
  byTrace.set(id, [...(byTrace.get(id) ?? []), s]);
}
const latest = [...byTrace.values()].sort(
  (a, b) => Math.max(...b.map((s) => +new Date(s.start_time)))
          - Math.max(...a.map((s) => +new Date(s.start_time))),
)[0]!;

/** Our span names carry a kind prefix: agent.retriever_agent, tool.calc. */
const bare = (name: string): string => name.replace(/^(agent|tool|retriever)\./, "");

/** Meaningful means: a model call, a tool call, one of our agents, or the root. */
const meaningful = (s: Span): boolean =>
  s.span_kind === "LLM" ||
  s.span_kind === "TOOL" ||
  s.span_kind === "RETRIEVER" ||
  s.span_kind === "AGENT" ||
  bare(s.name) in AGENTS ||
  bare(s.name) in LEAF_TOOLS ||
  s.parent_id === null;

const byId = new Map(latest.map((s) => [s.context.span_id, s]));

/** The nearest ancestor that stays in the tree. */
function keptParent(s: Span): string | null {
  let p = s.parent_id;
  while (p) {
    const parent = byId.get(p);
    if (!parent) return null;
    if (meaningful(parent)) return p;
    p = parent.parent_id;
  }
  return null;
}

const kept = showAll ? latest : latest.filter(meaningful);
const children = new Map<string | null, Span[]>();
for (const s of kept) {
  const p = showAll ? s.parent_id : keptParent(s);
  children.set(p, [...(children.get(p) ?? []), s]);
}

const t0 = Math.min(...latest.map((s) => +new Date(s.start_time)));
const dur = (s: Span) => (+new Date(s.end_time) - +new Date(s.start_time)) / 1000;
const MARK: Record<string, string> = {
  CHAIN: "▣", AGENT: "◆", LLM: "◇", TOOL: "▪", RETRIEVER: "▤",
};

function print(span: Span, depth: number): void {
  const pad = "  ".repeat(depth);
  const at = ((+new Date(span.start_time) - t0) / 1000).toFixed(1).padStart(5);
  console.log(
    `${at}s ${pad}${MARK[span.span_kind] ?? "·"} ${span.name.padEnd(30 - depth * 2)}` +
    `${span.span_kind.padEnd(10)} ${dur(span).toFixed(2)}s`,
  );
  for (const c of (children.get(span.context.span_id) ?? []).sort(
    (a, b) => +new Date(a.start_time) - +new Date(b.start_time),
  )) print(c, depth + 1);
}

const roots = (children.get(null) ?? []).sort(
  (a, b) => +new Date(a.start_time) - +new Date(b.start_time),
);
console.log(
  `\ntrace ${latest[0]!.context.trace_id.slice(0, 12)} · project ${project} · ` +
  `${latest.length} spans${showAll ? "" : ` → showing ${kept.length}`}\n`,
);
for (const r of roots) print(r, 0);
console.log(`\n  ▣ chain   ◆ agent   ◇ llm   ▪ tool   ▤ retriever` +
            `${showAll ? "" : "\n  --all — show the full framework machinery"}\n`);
