/** Агент доступу до операційних систем компанії. */
import type { AgentSpec, LeafTool } from "../types.js";
import { API_PROMPT } from "./prompt.js";
import { getCustomerTool } from "./tools/get-customer.js";
import { getShipmentTool } from "./tools/get-shipment.js";

export const apiAgent: AgentSpec = {
  name: "api_agent",
  prompt: API_PROMPT,
  canCall: [getShipmentTool.name, getCustomerTool.name],
  description: "Суб-агент доступу до операційних даних (відправлення, клієнти).",
  arg: "request",
};

export const apiTools: LeafTool[] = [getShipmentTool, getCustomerTool];
export { SHIPMENTS, CUSTOMERS } from "./data.js";
