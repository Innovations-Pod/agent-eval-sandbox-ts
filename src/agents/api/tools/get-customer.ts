import { z } from "zod";

import type { PlainTool } from "../../types.js";
import { CUSTOMERS, show } from "../data.js";

export function getCustomer(customerId: string): string {
  const data = CUSTOMERS[customerId.trim().toUpperCase()];
  return data ? show(data) : `Customer ${customerId} not found`;
}

const Input = z.object({
  customer_id: z.string().describe("Customer identifier, e.g. CUST-77"),
});

export const getCustomerTool: PlainTool = {
  kind: "tool",
  name: "get_customer",
  description: "Customer data by CUST-… identifier.",
  input: Input,
  run: (a) => getCustomer(Input.parse(a).customer_id),
};
