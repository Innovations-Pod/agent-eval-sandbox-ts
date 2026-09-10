/** Stubs standing in for the real operational systems. Shared by both tools of
 *  this agent, so they live next to them rather than inside one of them. */

export const SHIPMENTS: Record<string, Record<string, unknown>> = {
  "TRK-1001": { status: "in transit", direction: "domestic", weight_kg: 3.0,
                shipped: "2026-09-01", expected: "2026-09-03", overdue: false },
  "TRK-1002": { status: "delivered", direction: "city", weight_kg: 1.2,
                shipped: "2026-08-20", delivered: "2026-08-25", overdue: true },
  "TRK-1003": { status: "at customs", direction: "international", weight_kg: 8.4,
                shipped: "2026-08-28", force_majeure: "customs delay", overdue: true },
};

export const CUSTOMERS: Record<string, Record<string, unknown>> = {
  "CUST-77": { name: "Skyline LLC", tier: "A", shipments_per_year: 1420 },
  "CUST-12": { name: "Koval Sole Trader", tier: "C", shipments_per_year: 38 },
};

export const show = (data: Record<string, unknown>): string =>
  "{" + Object.entries(data)
    .map(([k, v]) => `'${k}': ${typeof v === "string" ? `'${v}'` : v}`)
    .join(", ") + "}";
