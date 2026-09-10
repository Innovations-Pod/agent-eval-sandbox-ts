/** Lists the datasets in Phoenix — so you do not have to hunt for ids through the API. */
import { PHOENIX_ENDPOINT } from "./src/config.js";

interface Dataset { id: string; name: string; description?: string }

const res = await fetch(`${PHOENIX_ENDPOINT}/v1/datasets`);
const { data } = (await res.json()) as { data: Dataset[] };

console.log(`\n${"id".padEnd(26)}${"name".padEnd(30)}examples`);
console.log("-".repeat(72));
for (const d of data) {
  const ex = await fetch(`${PHOENIX_ENDPOINT}/v1/datasets/${d.id}/examples`);
  const body = (await ex.json()) as { data?: { examples?: unknown[] } };
  const n = body.data?.examples?.length ?? "?";
  // Names from the UI sometimes contain invisible spaces — we show them as is, in quotes.
  console.log(`${d.id.padEnd(26)}${JSON.stringify(d.name).padEnd(30)}${n}`);
}
console.log(`\nrun with:  npm run run -- --dataset <id>\n`);
