import { z } from "zod";

import type { PlainTool } from "../../types.js";
import { CUSTOMERS, show } from "../data.js";

export function getCustomer(customerId: string): string {
  const data = CUSTOMERS[customerId.trim().toUpperCase()];
  return data ? show(data) : `Клієнта ${customerId} не знайдено`;
}

const Input = z.object({
  customer_id: z.string().describe("Ідентифікатор клієнта, напр. CUST-77"),
});

export const getCustomerTool: PlainTool = {
  kind: "tool",
  name: "get_customer",
  description: "Дані про клієнта за ідентифікатором CUST-….",
  input: Input,
  run: (a) => getCustomer(Input.parse(a).customer_id),
};
