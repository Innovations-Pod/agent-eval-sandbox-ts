/** Перетворює реальний трейс на кейс датасету — з траєкторією як еталоном.
 *
 * Кнопка «add to dataset» у Phoenix копіює лише вхід і вихід спана, тому
 * `expected_trajectory` там нізвідки взятися. Ця команда дістає траєкторію
 * з атрибута `mas.trajectory` кореневого спана й кладе її в очікування.
 *
 * ВАЖЛИВО, і це не формальність: фактична траєкторія стає ОЧІКУВАНОЮ. Тобто
 * ти заморожуєш поточну поведінку як правильну. Це регресійний тест
 * («не зламалось порівняно з учора»), а не ground truth («має бути так»).
 * Кожен такий кейс треба переглянути очима — інколи заморожується баг.
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
    "вжиток: npm run promote -- --dataset <id|назва> [--trace <id>] [--last N] [--project <імʼя>]",
  );
  process.exit(1);
}
const project = value("project") ?? PROJECT_NAME;
const last = Number(value("last") ?? 1);

// ---- дістаємо спани проєкту
const projects = (await (await fetch(`${PHOENIX_ENDPOINT}/v1/projects?limit=100`)).json()) as
  { data: { id: string; name: string }[] };
const found = projects.data.find((p) => p.name === project);
if (!found) {
  console.error(`проєкт «${project}» не знайдено`);
  process.exit(1);
}
const spans = (await (await fetch(
  `${PHOENIX_ENDPOINT}/v1/projects/${found.id}/spans?limit=1000`,
)).json()) as { data: Span[] };

// ---- кореневі спани прогонів, найновіші першими
const roots = spans.data
  .filter((s) => s.name === "mas.run" && s.parent_id === null)
  .sort((a, b) => +new Date(b.start_time) - +new Date(a.start_time));

const wantedTrace = value("trace");
const chosen = wantedTrace
  ? roots.filter((s) => s.context.trace_id.startsWith(wantedTrace))
  : roots.slice(0, last);

if (chosen.length === 0) {
  console.error("не знайдено жодного прогону — спершу зроби npm run chat");
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
      // Порожні: заповнюються руками. Автоматично сюди нічого класти не можна —
      // «жодного забороненого рядка» це рішення людини, а не спостереження.
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

console.log(`\nдодано ${examples.length} кейс(ів) у датасет ${datasetId}\n`);
for (const e of examples) {
  console.log(`  ${e.metadata.id}`);
  console.log(`    питання:    ${e.input.question.slice(0, 66)}`);
  console.log(`    траєкторія: ${e.output.expected_trajectory.join(" → ")}`);
}
console.log(
  "\n⚠ Фактична поведінка стала очікуваною. Перевір траєкторії очима — " +
  "якщо агент учора ходив неправильно, ти щойно зафіксував це як норму.\n" +
  "must_contain / must_not_contain лишились порожні: заповни їх у Phoenix або в коді.\n",
);
