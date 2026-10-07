import { Link } from "react-router-dom";
import { useBakery, useOrders, usePayments, paidByOrder } from "@/lib/data";
import { effectiveStatus, todayIn } from "@/lib/rules";
import { niceDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Screen, Spinner } from "@/components/ui";

function lastMonths(current, n) {
  const [y, m] = current.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1)).toISOString().slice(0, 7));
}

export default function Earnings() {
  const { data: bakery } = useBakery();
  const orders = useOrders(bakery?.id);
  const payments = usePayments(bakery?.id);
  if (orders.isLoading || payments.isLoading) return <Screen title="Earnings"><Spinner /></Screen>;

  const month = todayIn(bakery.timezone).slice(0, 7);
  const months = lastMonths(month, 6);
  const byMonth = Object.fromEntries(months.map((m) => [m, 0]));
  for (const p of payments.data || []) {
    const m = (p.received_on || "").slice(0, 7);
    if (m in byMonth) byMonth[m] += Number(p.cents) || 0;
  }
  const max = Math.max(...Object.values(byMonth), 1);
  const now = new Date();
  const paid = paidByOrder(payments.data);
  const monthOrders = (orders.data || []).filter(
    (o) => o.pickup_date?.startsWith(month) && ["booked", "ready", "picked_up"].includes(effectiveStatus(o, now)),
  );

  // Booked work that isn't fully paid, plus deposits on live quotes.
  const owed = (orders.data || [])
    .map((o) => {
      const s = effectiveStatus(o, now);
      if (s === "quoted") return { o, label: "deposit", cents: (o.deposit_cents || 0) - (paid[o.id] || 0) };
      if (["booked", "ready", "picked_up"].includes(s)) return { o, label: "balance", cents: (o.total_cents || 0) - (paid[o.id] || 0) };
      return null;
    })
    .filter((x) => x && x.cents > 0)
    .sort((a, b) => a.o.pickup_date.localeCompare(b.o.pickup_date));
  const owedTotal = owed.reduce((s, x) => s + x.cents, 0);

  return (
    <Screen title="Earnings">
      <section className="card flex flex-col gap-1">
        <span className="lbl">{niceDate(`${month}-01`, "MMMM")} so far</span>
        <span className="font-display text-4xl font-extrabold tabular">{formatCents(byMonth[month])}</span>
        <span className="text-sm text-muted">{monthOrders.length} order{monthOrders.length === 1 ? "" : "s"} picked up or booked this month</span>
      </section>

      <section className="card flex flex-col gap-2" aria-label="Money received in the last six months">
        <div className="flex items-end gap-2 h-28">
          {months.map((m) => (
            <div key={m} className="flex-1 flex flex-col justify-end items-center gap-1 h-full">
              <span className="text-[10px] text-muted tabular">{byMonth[m] ? `$${Math.round(byMonth[m] / 100)}` : ""}</span>
              <div
                className={`w-full rounded-t-md ${m === month ? "bg-accent" : "bg-accent-soft"}`}
                style={{ height: `${Math.max((byMonth[m] / max) * 100, byMonth[m] ? 4 : 1)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          {months.map((m) => <span key={m} className="flex-1 text-center text-[11px] text-muted">{niceDate(`${m}-01`, "MMM")}</span>)}
        </div>
      </section>

      <section className="card flex flex-col gap-2">
        <div className="flex justify-between items-baseline">
          <span className="lbl">Still owed to you</span>
          <span className="font-bold tabular">{formatCents(owedTotal)}</span>
        </div>
        {owed.length === 0 && <p className="text-sm text-muted">Everyone’s paid up.</p>}
        {owed.map(({ o, label, cents }) => (
          <Link key={o.id} to={`/orders/${o.id}`} className="flex justify-between text-[15px] tabular">
            <span className="truncate">{o.customer?.name} <span className="text-muted">· {label} · {niceDate(o.pickup_date, "MMM d")}</span></span>
            <span>{formatCents(cents)}</span>
          </Link>
        ))}
      </section>
      <p className="text-xs text-muted">Totals come from the payments you record on each order.</p>
    </Screen>
  );
}
