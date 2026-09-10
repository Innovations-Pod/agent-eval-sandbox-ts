/** Turns a real trace into a dataset case — with the trajectory as ground truth.
 *
 * The “add to dataset” button in Phoenix copies only a span's input and output, so
 * `expected_trajectory` has nowhere to come from there. This command pulls the trajectory
 * out of the root span's `mas.trajectory` attribute and files it as the expectation.
 *
 * IMPORTANT, and this is not a formality: the ACTUAL trajectory becomes the EXPECTED one.
 * That is, you freeze current behaviour as correct. This is a regression test (“nothing
 * broke compared to yesterday”), not ground truth (“this is how it should be”).
 * Every such case needs a human read — sometimes what gets frozen is a bug.
 */
import { createClient } from "@arizeai/phoenix-client";
import { appendDatasetExamples } from "@arizeai/phoenix-client/datasets";

import { PHOENIX_ENDPOINT, PROJECT_NAME } from "./src/config.js";

interface Span {
  name: string;
  context: { span_id: string; trace_id: string };
  parent_id: string | null;
  start_time: string;
  attributes: Record<string, unknown>;
}

const argv = process.argv.slice(2);
const value = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const datasetRef = value("dataset");
if (!datasetRef) {
  console.error(
    "usage: npm run promote -- --dataset <id|name> [--trace <id>] [--last N] [--project <name>]",
  );
  process.exit(1);
}
const project = value("project") ?? PROJECT_NAME;
const last = Number(value("last") ?? 1);

// ---- fetch the project's spans
const projects = (await (await fetch(`${PHOENIX_ENDPOINT}/v1/projects?limit=100`)).json()) as
  { data: { id: string; name: string }[] };
const found = projects.data.find((p) => p.name === project);
if (!found) {
  console.error(`project “${project}” not found`);
  process.exit(1);
}
const spans = (await (await fetch(
  `${PHOENIX_ENDPOINT}/v1/projects/${found.id}/spans?limit=1000`,
)).json()) as { data: Span[] };

// ---- root spans of the runs, newest first
const roots = spans.data
  .filter((s) => s.name === "mas.run" && s.parent_id === null)
  .sort((a, b) => +new Date(b.start_time) - +new Date(a.start_time));

const wantedTrace = value("trace");
const chosen = wantedTrace
  ? roots.filter((s) => s.context.trace_id.startsWith(wantedTrace))
  : roots.slice(0, last);

if (chosen.length === 0) {
  console.error("no runs found — do npm run chat first");
  process.exit(1);
}

const examples = chosen.map((root) => {
  const a = root.attributes;
  const question = String(a["input.value"] ?? "");
  const answer = String(a["output.value"] ?? "");
  const trajectory = String(a["mas.trajectory"] ?? "").split(",").filter(Boolean);
  return {
    input: { question },
    output: {
      reference: answer,
      expected_trajectory: trajectory,
      // Left empty: filled in by hand. Nothing may be put here automatically —
      // “no forbidden string” is a human decision, not an observation.
      must_contain: [] as string[],
      must_not_contain: [] as string[],
      category: "captured",
    },
    metadata: {
      id: `trace-${root.context.trace_id.slice(0, 8)}`,
      source: "trace",
      trace_id: root.context.trace_id,
    },
  };
});

const client = createClient({ options: { baseUrl: PHOENIX_ENDPOINT } });
const selector = datasetRef.startsWith("RGF0YXNl")
  ? { datasetId: datasetRef }
  : { datasetName: datasetRef };
const { datasetId } = await appendDatasetExamples({ client, dataset: selector, examples });

console.log(`\nadded ${examples.length} case(s) to dataset ${datasetId}\n`);
for (const e of examples) {
  console.log(`  ${e.metadata.id}`);
  console.log(`    question:   ${e.input.question.slice(0, 66)}`);
  console.log(`    trajectory: ${e.output.expected_trajectory.join(" → ")}`);
}
console.log(
  "\n⚠ Actual behaviour has become the expectation. Read the trajectories yourself — " +
  "if the agent was going the wrong way yesterday, you have just recorded that as normal.\n" +
  "must_contain / must_not_contain were left empty: fill them in, in Phoenix or in code.\n",
);
