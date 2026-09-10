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

export const RETRIEVAL_CASES: RetrievalCase[] = CASES.map((c) => ({
  id: c.id,
  question: c.question,
  expected: TRUTH[c.id] ?? [],
}));
