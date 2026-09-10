/** A text report for an experiment: a case × metric matrix.
 *
 * The difference from the Python version: there, `client.experiments.get_experiment()`
 * returns both the runs and the eval results. The JS client does not hand back eval
 * results, so we fetch them from the REST endpoint /v1/experiments/{id}/json —
 * everything sits in the `annotations` field there.
 */
import { createClient } from "@arizeai/phoenix-client";

import { PHOENIX_ENDPOINT } from "../src/config.js";

interface Annotation { name: string; score: number | null; label: string | null; explanation: string | null }
interface Row { example_id: string; input: Record<string, unknown>; annotations: Annotation[] }

const BINARY = new Set(["trajectory_match", "keyword_check", "no_loops", "tool_selection_f1",
                        "correctness_judge", "groundedness_judge", "safety_judge"]);

const experimentId = process.argv[2];
if (!experimentId) {
  console.error("usage: npm run report -- <experimentId>");
  process.exit(1);
}

const client = createClient({ options: { baseUrl: PHOENIX_ENDPOINT } });
const res = await fetch(`${PHOENIX_ENDPOINT}/v1/experiments/${experimentId}/json`);
if (!res.ok) {
  console.error(`Phoenix answered ${res.status}: check the experimentId`);
  process.exit(1);
}
const rows = (await res.json()) as Row[];

// Case labels come from the dataset — the JSON export only carries example_id.
const { data: examplesResp } = await client.GET("/v1/experiments/{experiment_id}", {
  params: { path: { experiment_id: experimentId } },
});
const datasetId = (examplesResp as { data?: { dataset_id?: string } })?.data?.dataset_id;
const label = new Map<string, string>();
if (datasetId) {
  const dsRes = await fetch(`${PHOENIX_ENDPOINT}/v1/datasets/${datasetId}/examples`);
  if (dsRes.ok) {
    const ds = (await dsRes.json()) as { data?: { examples?: { id: string; metadata?: { id?: string } }[] } };
    for (const ex of ds.data?.examples ?? []) label.set(ex.id, ex.metadata?.id ?? ex.id.slice(0, 8));
  }
}

const scores = new Map<string, Map<string, number | null>>();
for (const row of rows) {
  const caseId = label.get(row.example_id) ?? String(row.input.question ?? "?").slice(0, 20);
  const m = scores.get(caseId) ?? new Map<string, number | null>();
  for (const a of row.annotations ?? []) m.set(a.name, a.score);
  scores.set(caseId, m);
}

const metrics = [...new Set([...scores.values()].flatMap((m) => [...m.keys()]))].sort();
const cases = [...scores.keys()].sort();
const width = Math.max(...cases.map((c) => c.length)) + 2;
const pad = (s: string, n: number) => s.padStart(n);

const header = "case".padEnd(width) + metrics.map((m) => pad(m.slice(0, 14), 16)).join("");
console.log(header);
console.log("-".repeat(header.length));
for (const c of cases) {
  let line = c.padEnd(width);
  for (const m of metrics) {
    const v = scores.get(c)!.get(m);
    line += pad(v == null ? "—" : BINARY.has(m) ? (v >= 0.99 ? "✅" : "❌") : v.toFixed(3), 16);
  }
  console.log(line);
}
console.log("-".repeat(header.length));
let avg = "AVERAGE".padEnd(width);
for (const m of metrics) {
  const vals = cases.map((c) => scores.get(c)!.get(m)).filter((v): v is number => v != null);
  avg += pad(vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3) : "—", 16);
}
console.log(avg);
