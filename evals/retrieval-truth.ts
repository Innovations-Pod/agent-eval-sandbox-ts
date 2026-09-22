/** Retrieval ground truth: which passage SHOULD be found for each question.
 *
 * This is hand labelling, and it is an argument rather than a fact. An empty array means
 * “there is nothing relevant in the corpus”: for such questions the correct retriever
 * behaviour is to find nothing.
 */
import { CASES } from "./dataset.js";

export interface RetrievalCase {
  id: string;
  question: string;
  /** The passages we consider relevant. Empty = the corpus does not cover the question. */
  expected: string[];
}

const TRUTH: Record<string, string[]> = {
  "happy-01": ["sla#1"],                 // the compensation table
  "happy-02": ["sla#1"],                 // EU windows — the same table
  "happy-03": [],                        // shipment status — that is the API, not search
  "happy-04": ["tariffs#1", "tariffs#2"], // rates + the 5 kg rule
  "happy-05": ["refunds#1"],             // the maximum without a declared value
  "edge-01": [],                         // a non-existent number — the API again
  "edge-02": ["sla#2"],                  // force majeure takes it out of the SLA
  "edge-03": [],                         // there are no animals in the corpus
  "edge-04": [],                         // pure arithmetic
  "adv-01": [],                          // the promo code exists only in the confidential document
  "adv-02": [],                          // internal cost — likewise
  "adv-03": [],                          // injection: nothing relevant exists
};

/** Questions that exist only for the retrieval benchmark.
 *
 * Phrased the way a customer would ask, not the way the document is written. An earlier
 * version paraphrased the passages closely and averaged 69% literal word overlap with the
 * target chunk — seven of them 100%. That does not measure retrieval, it measures string
 * matching with the answer key handed over.
 *
 * They are deliberately kept out of `dataset.ts`: that set drives the agent
 * experiments, and adding to it would move every cost and latency number measured
 * on it. Search, on the other hand, needs breadth — with a dozen covered questions
 * every strategy scores 1.00 and the benchmark measures nothing.
 */
const RETRIEVAL_ONLY: RetrievalCase[] = [
  { id: "kb-01", question: "I have something that weighs about twelve kilos — which one should I take?", expected: ["packaging#1"] },
  { id: "kb-02", question: "I am sending wine glasses. What can I do so they arrive in one piece?", expected: ["packaging#3"] },
  { id: "kb-03", question: "Can I just wrap it in film and send it to Germany?", expected: ["packaging#5"] },
  { id: "kb-04", question: "I want to send my mum some homemade dumplings out of the freezer.", expected: ["prohibited#3"] },
  { id: "kb-05", question: "There is a power bank inside. Is that going to be a problem?", expected: ["prohibited#5"] },
  { id: "kb-06", question: "What paperwork do I have to fill in to send something to Poland?", expected: ["international#1"] },
  { id: "kb-07", question: "From what price will my recipient in Spain be charged extra at the border?", expected: ["international#2"] },
  { id: "kb-08", question: "Can I send something to Minsk?", expected: ["international#4"] },
  { id: "kb-09", question: "My parcel has been sitting at the border for two days. Is that normal?", expected: ["international#3"] },
  { id: "kb-10", question: "The tracker shows one word and I do not understand it. Where do I read what each stage means?", expected: ["tracking#1"] },
  { id: "kb-11", question: "Nothing has moved since yesterday. Is something wrong?", expected: ["tracking#3"] },
  { id: "kb-12", question: "I am away for two weeks. Will it wait for me?", expected: ["pickup#3"] },
  { id: "kb-13", question: "If I call someone now, will they come today?", expected: ["pickup#1"] },
  { id: "kb-14", question: "Can I drop something off on the weekend?", expected: ["pickup#2"] },
  { id: "kb-15", question: "I am sending something expensive. What do I pay to be covered if it goes missing?", expected: ["insurance#1", "tariffs#2"] },
  { id: "kb-16", question: "In which situations will you refuse to pay me back?", expected: ["insurance#4"] },
  { id: "kb-17", question: "The box arrived crushed. What should I do before I open it?", expected: ["insurance#5"] },
  { id: "kb-18", question: "When does the money from the buyer reach me?", expected: ["payment#2"] },
  { id: "kb-19", question: "Can the recipient in Berlin pay when he gets it?", expected: ["payment#3"] },
  { id: "kb-20", question: "Do we pay for each shipment separately or once a month?", expected: ["business#2"] },
  { id: "kb-21", question: "We are a company and ship daily. How do we start working with you?", expected: ["business#1"] },
  { id: "kb-22", question: "Can we create waybills straight from our own system, and does that cost extra?", expected: ["business#5"] },
];

export const RETRIEVAL_CASES: RetrievalCase[] = [
  ...CASES.map((c) => ({ id: c.id, question: c.question, expected: TRUTH[c.id] ?? [] })),
  ...RETRIEVAL_ONLY,
];
