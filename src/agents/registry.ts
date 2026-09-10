/** Assembling the registry: indexing by name and integrity checks.
 *
 * Everything here is pure and parameterised, deliberately. The registry in
 * `index.ts` only declares what the system is made of; the rules it must satisfy
 * live separately and are tested without a single real agent.
 */
import type { AgentSpec, LeafTool } from "./types.js";

/** Lays a list out by name. Throws on a duplicate: `Object.fromEntries` would
 *  silently keep the last one and the first would vanish without a trace. */
export function byName<T extends { name: string }>(kind: string, items: T[]): Record<string, T> {
  const seen = new Set<string>();
  for (const { name } of items) {
    if (seen.has(name)) throw new Error(`${kind} declared twice: ${name}`);
    seen.add(name);
  }
  return Object.fromEntries(items.map((i) => [i.name, i]));
}

/** Two conditions without which the system breaks mid-run rather than at startup. */
export function validateRegistry(
  agents: Record<string, AgentSpec>,
  tools: Record<string, LeafTool>,
): void {
  // The namespace is shared and lookup checks agents first, so a tool named
  // like an agent would silently stop being called.
  const shadowed = Object.keys(tools).filter((name) => name in agents);
  if (shadowed.length > 0) {
    throw new Error(`tool name already taken by an agent: ${shadowed.join(", ")}`);
  }

  // A typo in canCall would otherwise surface only when the model asks for a
  // tool that is not there — which is to say, once you are already paying.
  for (const spec of Object.values(agents)) {
    for (const name of spec.canCall) {
      if (!(name in agents) && !(name in tools)) {
        throw new Error(`agent ${spec.name} points at a name that does not exist: ${name}`);
      }
    }
  }
}
