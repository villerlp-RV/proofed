import { describe, expect, it } from "vitest";
import * as rules from "./rules";
import * as fn from "../../base44/functions/publicShop/entry.ts";
import { formatCents, parseDollars, centsToInput } from "./money";

const bakery = { accepting_orders: true, lead_days: 7, daily_capacity: 3, weekly_capacity: 4 };
const now = new Date("2026-10-07T15:00:00Z");
const today = "2026-10-07";
const orders = [
  { status: "quoted", pickup_date: "2026-10-17", spots: 1, quote_expires_at: "2026-10-09T15:00:00Z" },
  { status: "booked", pickup_date: "2026-10-17", spots: 2 },
  { status: "requested", pickup_date: "2026-10-15", spots: 1 },
  { status: "quoted", pickup_date: "2026-10-20", spots: 1, quote_expires_at: "2026-10-06T00:00:00Z" },
];
const blocked = [{ date: "2026-10-18" }, { date: "2026-10-30", end_date: "2026-11-01" }];

describe("dates", () => {
  it("finds Monday as the start of the week", () => {
    expect(rules.weekStart("2026-10-17")).toBe("2026-10-12");
    expect(rules.weekStart("2026-10-18")).toBe("2026-10-12");
    expect(rules.weekStart("2026-10-12")).toBe("2026-10-12");
  });
  it("adds days across a month and a DST change", () => {
    expect(rules.addDays("2026-10-31", 2)).toBe("2026-11-02");
    expect(rules.addDays("2026-03-07", 2)).toBe("2026-03-09");
  });
  it("reads today in the bakery's time zone", () => {
    expect(rules.todayIn("America/Chicago", new Date("2026-10-08T03:00:00Z"))).toBe("2026-10-07");
  });
});

describe("capacity", () => {
  it("treats a quote past its hold as expired", () => {
    expect(rules.effectiveStatus(orders[3], now)).toBe("expired");
    expect(rules.effectiveStatus(orders[0], now)).toBe("quoted");
  });
  it("counts only quoted, booked and ready orders", () => {
    const { byDay, byWeek } = rules.usage(orders, now);
    expect(byDay).toEqual({ "2026-10-17": 3 });
    expect(byWeek).toEqual({ "2026-10-12": 3 });
  });
  it("gives the reason a date is unavailable", () => {
    const check = (date, spots = 1) => rules.checkDate({ bakery, orders, blocked, date, spots, today, now });
    expect(check("2026-10-13")).toBe("too_soon");
    expect(check("2026-10-14")).toBeNull();
    expect(check("2026-10-17")).toBe("full"); // day limit
    expect(check("2026-10-16", 2)).toBe("full"); // week limit: 3 used of 4
    expect(check("2026-10-16", 1)).toBeNull();
    expect(check("2026-10-18")).toBe("blocked");
    expect(check("2026-10-31")).toBe("blocked");
    expect(rules.checkDate({ bakery: { ...bakery, accepting_orders: false }, orders, date: "2026-10-20", today, now })).toBe("closed");
  });
  it("matches the copy inside the publicShop function", () => {
    const args = { bakery, orders, blocked, today, days: 60, now };
    expect(fn.availability(args)).toEqual(rules.availability(args));
    expect(fn.usage(orders, now)).toEqual(rules.usage(orders, now));
  });
});

describe("money", () => {
  it("formats and parses dollars", () => {
    expect(formatCents(10500)).toBe("$105.00");
    expect(parseDollars("$85.5")).toBe(8550);
    expect(parseDollars("1,200")).toBe(120000);
    expect(parseDollars("abc")).toBeNull();
    expect(centsToInput(8500)).toBe("85");
    expect(centsToInput(5250)).toBe("52.50");
  });
  it("rounds the deposit to the cent", () => {
    expect(rules.depositFor(10500, 50)).toBe(5250);
    expect(rules.depositFor(9999, 33)).toBe(3300);
  });
});

describe("priceItems", () => {
  const menu = [{ id: "m1", name: "Round cake", sizes: [{ label: '8"', base_cents: 8500, spots: 1 }, { label: "2-tier", base_cents: 16000, spots: 2 }] }];
  const options = [{ id: "o1", name: "Strawberry", upcharge_cents: 500 }, { id: "o2", name: "Vanilla", upcharge_cents: 0 }];
  it("builds items, spots and a starting quote", () => {
    const r = fn.priceItems([{ menu_item_id: "m1", size_label: "2-tier", option_ids: ["o1", "o2", "nope"], qty: 1 }], menu, options);
    expect(r.spots).toBe(2);
    expect(r.items[0].options).toEqual(["Strawberry", "Vanilla"]);
    expect(r.lines).toEqual([{ label: "2-tier Round cake", cents: 16000 }, { label: "Strawberry", cents: 500 }]);
  });
  it("ignores items that aren't on the menu", () => {
    expect(fn.priceItems([{ menu_item_id: "x" }], menu, options).items).toEqual([]);
  });
});
