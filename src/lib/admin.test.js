import { describe, expect, it } from "vitest";
import { summarize } from "../../base44/functions/adminOverview/entry.ts";

const now = new Date("2026-10-11T12:00:00Z");
const data = {
  users: [
    { id: "u1", email: "lila@example.com", full_name: "Lila" },
    { id: "u2", email: "sam@example.com", full_name: "Sam" },
    { id: "u3", email: "nobakery@example.com", full_name: "Viewer" },
  ],
  bakeries: [
    { id: "b1", name: "Lila's", slug: "lilas", created_by_id: "u1", created_date: "2026-08-01T00:00:00Z" },
    { id: "b2", name: "Sam's", slug: "sams", created_by_id: "u2", created_date: "2026-10-01T00:00:00Z", accepting_orders: false },
  ],
  orders: [
    { id: "o1", bakery_id: "b1", status: "requested", customer: { name: "Maya" }, pickup_date: "2026-10-20", created_date: "2026-10-10T00:00:00Z" },
    { id: "o2", bakery_id: "b1", status: "quoted", quote_expires_at: "2026-10-09T00:00:00Z", total_cents: 9000, pickup_date: "2026-10-24", created_date: "2026-10-05T00:00:00Z" },
    { id: "o3", bakery_id: "b1", status: "picked_up", total_cents: 6000, pickup_date: "2026-08-20", created_date: "2026-08-02T00:00:00Z" },
    { id: "o4", bakery_id: "gone", status: "requested", pickup_date: "2026-10-30", created_date: "2026-10-09T00:00:00Z" },
  ],
  payments: [
    { bakery_id: "b1", cents: 4500, received_on: "2026-10-06" },
    { bakery_id: "b1", cents: 6000, received_on: "2026-08-20" },
  ],
};

describe("admin overview", () => {
  const r = summarize(data, now);
  it("adds up totals across shops", () => {
    expect(r.totals).toEqual({
      shops: 2, active_shops_30d: 1, bakers: 2, users: 3,
      orders_30d: 3, open_requests: 2, payments_30d_cents: 4500,
    });
  });
  it("gives each shop its own numbers and owner", () => {
    const lila = r.shops.find((s) => s.id === "b1");
    expect(lila).toMatchObject({ owner_email: "lila@example.com", orders_total: 3, orders_30d: 2, open_requests: 1, payments_30d_cents: 4500, accepting_orders: true });
    expect(r.shops.find((s) => s.id === "b2")).toMatchObject({ accepting_orders: false, orders_total: 0, last_order_date: null });
    expect(r.shops[0].id).toBe("b1"); // most recent activity first
  });
  it("lists newest orders first, marks expired quotes, hides unquoted prices", () => {
    expect(r.recent_orders.map((o) => o.id)).toEqual(["o1", "o4", "o2", "o3"]);
    expect(r.recent_orders[0].total_cents).toBeNull();
    expect(r.recent_orders[2].status).toBe("expired");
    expect(r.recent_orders[1].bakery_name).toBe("Deleted shop");
  });
});
