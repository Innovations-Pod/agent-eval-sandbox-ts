/** Виконання агентів. Реалізація — `createAgent` із пакета `langchain`.
 *
 * Раніше тут був `createReactAgent` із `@langchain/langgraph/prebuilt` — його
 * задепрекейтили й перенесли в `langchain` під новою назвою; заразом
 * перейменували два параметри: `llm` → `model`, `prompt` → `systemPrompt`.
 *
 * Тека названа за роллю, а не за фреймворком: коли рантайм колись зміниться
 * знову, назва лишиться правдою. Раніше вона звалася `graph/` — за внутрішньою
 * абстракцією LangGraph, до якої ми навіть не торкаємось: власного StateGraph
 * не будуємо, вузлів і ребер не додаємо.
 *
 * Топологія береться з реєстру `src/agents/` — промпти, права й інструменти
 * не дублюються.
 */
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { createAgent } from "langchain";
import { z } from "zod";

import { AGENTS, ENTRY_POINT } from "../agents/index.js";
import { contentText } from "./recorder.js";
import { AGENT_MODEL } from "../config.js";
import type { AgentSpec } from "../agents/index.js";
import { langchainTools } from "./tools.js";

const model = (): ChatAnthropic =>
  new ChatAnthropic({ model: AGENT_MODEL, maxTokens: 4096 });

type Agent = ReturnType<typeof createAgent>;

/** Суб-агент, загорнутий в інструмент для батька — той самий Composite,
 *  тільки цикл усередині крутить LangGraph, а не ми.
 *
 *  Готовий `createSupervisor` з `@langchain/langgraph-supervisor` робить це саме,
 *  але через handoff: керування ПЕРЕДАЄТЬСЯ суб-агенту, а інструменти звуться
 *  `transfer_to_*`. Перевірено — траєкторія стає `transfer_to_retriever_agent → …`
 *  замість імен наших агентів, і весь датасет із `expectedTrajectory` доводиться
 *  переписувати. Плюс три милиці: каст типів, ручне проставляння `name`,
 *  і несумісність з `createAgent` з langchain v1.
 *
 *  Вбудований `Runnable.asTool({ name, description, schema })` теж не підходить.
 *  Ідея була гарна — ланцюг `аргумент → messages` ▸ агент ▸ `останнє повідомлення
 *  → текст`, і конфіг тоді прокидається сам. Але `createAgent` з langchain v1
 *  повертає `ReactAgent`, який не є Runnable ні для типів, ні в рантаймі:
 *  `.pipe()` падає з `Expected a Runnable, function or object`.
 *  Тобто в ланцюг його не вбудуєш — лишається виклик `.invoke()` вручну.
 */
function asTool(get: () => Agent, spec: AgentSpec) {
  /** Викликає вкладеного агента й повертає його підсумок текстом.
   *
   *  `config` передається обовʼязково: без нього колбеки й трейсинг не доходять
   *  до суб-агента, і його кроки зникають із траєкторії.
   *
   *  Агент береться через `get()`, а не значенням: топологія може містити цикл
   *  (A кличе B, B кличе A), і тоді на момент збирання цього інструмента другого
   *  агента ще не існує. Ліниве розвʼязання знімає питання порядку збирання. */
  const run = async (args: Record<string, unknown>, config?: unknown) => {
    const task = String(args[spec.arg] ?? "");
    const { messages } = await get().invoke({ messages: [new HumanMessage(task)] }, config as never);
    return contentText(messages.at(-1)?.content);
  };

  // Тип навмисно широкий: інакше схема звужується до Record<string, string>,
  // і масив із агентських та звичайних інструментів перестає уніфікуватись.
  const schema: z.ZodObject<z.ZodRawShape> = z.object({
    [spec.arg]: z.string().describe("Завдання для суб-агента"),
  });

  return tool(run, { name: spec.name, description: spec.description, schema });
}

/** Збирає систему з реєстру.
 *
 * Кожен агент отримує рівно те, що записано в його `canCall` — і агентів, і
 * інструменти, у будь-якій комбінації. Раніше тут було зашито два шари: точка
 * входу кличе лише агентів, виконавці лише інструменти. Усе, що не вкладалось
 * у цю форму, зникало мовчки — реєстр таке ім'я пропускав, а збирач викидав.
 */
export function buildAgentTree(): Agent {
  const llm = model();
  const agents = new Map<string, Agent>();

  for (const spec of Object.values(AGENTS)) {
    const tools = spec.canCall.flatMap((name) =>
      name in AGENTS ? [asTool(() => agents.get(name)!, AGENTS[name]!)] : langchainTools([name]),
    );
    agents.set(spec.name, createAgent({
      model: llm,
      tools,
      systemPrompt: spec.prompt,
      name: spec.name,
    }));
  }

  return agents.get(ENTRY_POINT)!;
}
