/** Agent with access to the company's operational systems. */
import type { AgentSpec, LeafTool } from "../types.js";
import { API_PROMPT } from "./prompt.js";
import { getCustomerTool } from "./tools/get-customer.js";
import { getShipmentTool } from "./tools/get-shipment.js";

export const apiAgent: AgentSpec = {
  name: "api_agent",
  prompt: API_PROMPT,
  canCall: [getShipmentTool.name, getCustomerTool.name],
  description: "Operational-data access sub-agent (shipments, customers).",
  arg: "request",
};

export const apiTools: LeafTool[] = [getShipmentTool, getCustomerTool];
export { SHIPMENTS, CUSTOMERS } from "./data.js";
