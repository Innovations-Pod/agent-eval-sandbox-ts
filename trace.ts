/** Читабельний вигляд останнього трейсу.
 *
 * LangGraph пише багато внутрішньої механіки: __start__, RunnableSequence,
 * RunnableLambda, prompt, ChannelWrite. Вони нічого не кажуть про твою систему,
 * але роздувають дерево втричі.
 *
 * Ми їх не викидаємо — ми їх ЗГОРТАЄМО: дітей переприв'язуємо до найближчого
 * змістовного предка. Викидання зробило б сиротами спани LLM, які лежать
 * усередині RunnableSequence, і дерево розсипалось би.
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
  console.error(`проєкт «${project}» не знайдено. Є: ${projects.data.map((p) => p.name).join(", ")}`);
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

/** Імена наших спанів мають префікс виду: agent.retriever_agent, tool.calc. */
const bare = (name: string): string => name.replace(/^(agent|tool|retriever)\./, "");

/** Змістовний — це виклик моделі, виклик інструмента, наш агент або корінь. */
const meaningful = (s: Span): boolean =>
  s.span_kind === "LLM" ||
  s.span_kind === "TOOL" ||
  s.span_kind === "RETRIEVER" ||
  s.span_kind === "AGENT" ||
  bare(s.name) in AGENTS ||
  bare(s.name) in LEAF_TOOLS ||
  s.parent_id === null;

const byId = new Map(latest.map((s) => [s.context.span_id, s]));

/** Найближчий предок, який лишається у дереві. */
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
  `\nтрейс ${latest[0]!.context.trace_id.slice(0, 12)} · проєкт ${project} · ` +
  `${latest.length} спанів${showAll ? "" : ` → показано ${kept.length}`}\n`,
);
for (const r of roots) print(r, 0);
console.log(`\n  ▣ chain   ◆ agent   ◇ llm   ▪ tool   ▤ retriever` +
            `${showAll ? "" : "\n  --all — показати всю механіку фреймворку"}\n`);
