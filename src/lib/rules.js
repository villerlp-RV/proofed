// Business rules shared by the baker app and the order form.
// base44/functions/publicShop/entry.ts carries a copy (functions deploy on
// their own); rules.test.js checks the two give the same answers.

export const SPOT_STATUSES = ["quoted", "booked", "ready"];
export const OPEN_STATUSES = ["requested", "quoted", "booked", "ready"];

// A quote that ran past its hold without a deposit counts as expired, even
// before anyone saves that status.
export function effectiveStatus(order, now = new Date()) {
  if (order.status === "quoted" && order.quote_expires_at && new Date(order.quote_expires_at) < now) {
    return "expired";
  }
  return order.status;
}

// Dates are plain "YYYY-MM-DD" strings in the bakery's time zone. Arithmetic
// runs in UTC so daylight saving never shifts a day.
export function addDays(date, n) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekStart(date) {
  const day = new Date(date + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  return addDays(date, day === 0 ? -6 : 1 - day);
}

export function todayIn(timeZone, now = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function usage(orders, now = new Date()) {
  const byDay = {};
  const byWeek = {};
  for (const o of orders) {
    if (!SPOT_STATUSES.includes(effectiveStatus(o, now)) || !o.pickup_date) continue;
    const spots = Number(o.spots) || 1;
    byDay[o.pickup_date] = (byDay[o.pickup_date] || 0) + spots;
    const w = weekStart(o.pickup_date);
    byWeek[w] = (byWeek[w] || 0) + spots;
  }
  return { byDay, byWeek };
}

function isBlocked(date, blocked) {
  return blocked.some((b) => date >= b.date && date <= (b.end_date || b.date));
}

// Whether `spots` more can go on `date`. reason is one of: closed, too_soon,
// blocked, full; null when it fits.
export function checkDate({ bakery, orders, blocked = [], date, spots = 1, today, now = new Date() }) {
  const { byDay, byWeek } = usage(orders, now);
  if (bakery.accepting_orders === false) return "closed";
  if (date < addDays(today, Number(bakery.lead_days) || 0)) return "too_soon";
  if (isBlocked(date, blocked)) return "blocked";
  const daily = Number(bakery.daily_capacity) || 1;
  const weekly = Number(bakery.weekly_capacity) || daily;
  if ((byDay[date] || 0) + spots > daily) return "full";
  if ((byWeek[weekStart(date)] || 0) + spots > weekly) return "full";
  return null;
}

export function availability({ bakery, orders, blocked = [], today, days = 56, now = new Date() }) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const reason = checkDate({ bakery, orders, blocked, date, spots: 1, today, now });
    out.push({ date, open: reason === null, reason });
  }
  return out;
}

export function depositFor(totalCents, percent) {
  return Math.round((totalCents * (Number(percent) || 0)) / 100);
}

export function sumCents(lines) {
  return lines.reduce((s, l) => s + (Math.round(Number(l.cents)) || 0), 0);
}
