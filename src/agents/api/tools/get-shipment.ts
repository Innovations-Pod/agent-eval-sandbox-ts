import { z } from "zod";

import type { PlainTool } from "../../types.js";
import { SHIPMENTS, show } from "../data.js";

export function getShipment(trackingId: string): string {
  const data = SHIPMENTS[trackingId.trim().toUpperCase()];
  return data ? show(data) : `Відправлення ${trackingId} не знайдено`;
}

const Input = z.object({
  tracking_id: z.string().describe("Номер відправлення, напр. TRK-1001"),
});

export const getShipmentTool: PlainTool = {
  kind: "tool",
  name: "get_shipment",
  description: "Дані про відправлення за номером TRK-….",
  input: Input,
  run: (a) => getShipment(Input.parse(a).tracking_id),
};
