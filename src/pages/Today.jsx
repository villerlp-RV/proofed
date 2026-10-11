import { Link } from "react-router-dom";
import { useBakery, useOrders, usePayments, paidByOrder } from "@/lib/data";
import { addDays, effectiveStatus, todayIn, usage, weekStart } from "@/lib/rules";
import { niceDate, niceTime } from "@/lib/dates";
import { itemSummary } from "@/lib/labels";
import { formatCents } from "@/lib/money";
import { Chip, Empty, RowLink, Screen, Spinner } from "@/components/ui";

function WeekMeter({ label, start, used, limit }) {
  const left = Math.max(limit - used, 0);
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex justify-between items-baseline">
        <span className="lbl">{label} · {niceDate(start, "MMM d")}–{niceDate(addDays(start, 6), "MMM d")}</span>
        <span className="font-bold tabular">{used} of {limit}</span>
      </div>
      <div className="flex gap-1 h-2.5">
        {Array.from({ length: Math.max(limit, used) }, (_, i) => (
          <i key={i} className={`flex-1 rounded-full ${i < used ? "bg-accent" : "bg-hatch"}`} />
        ))}
      </div>
      <span className="text-sm text-muted">{left === 0 ? "Full. The order form hides this week." : `${left} spot${left === 1 ? "" : "s"} left`}</span>
    </div>
  );
}

function moneyChip(order, status, paid) {
  if (status === "quoted") return <Chip tone="new">Deposit due</Chip>;
  const owed = (order.total_cents || 0) - paid;
  if (owed > 0) return <Chip tone="warn">{formatCents(owed)} due</Chip>;
  return <Chip tone="ok">{status === "ready" ? "Ready · paid" : "Paid"}</Chip>;
}

export default function Today() {
  const { data: bakery } = useBakery();
  const orders = useOrders(bakery?.id);
  const payments = usePayments(bakery?.id);
  if (orders.isLoading) return <Screen title="Today"><Spinner /></Screen>;

  const now = new Date();
  const today = todayIn(bakery.timezone, now);
  const list = orders.data || [];
  const paid = paidByOrder(payments.data);
  const { byWeek } = usage(list, now);
  const thisWeek = weekStart(today);
  const nextWeek = addDays(thisWeek, 7);
  // Later weeks only show up once something is booked or quoted in them.
  const laterWeeks = Object.keys(byWeek)
    .filter((w) => w > nextWeek && byWeek[w] > 0)
    .sort()
    .slice(0, 6);
  const newCount = list.filter((o) => o.status === "requested").length;
  const saysPaid = list.filter((o) => effectiveStatus(o, now) === "quoted" && o.customer_says_paid);
  const coming = list
    .filter((o) => ["quoted", "booked", "ready"].includes(effectiveStatus(o, now)) && o.pickup_date >= today)
    .sort((a, b) => (a.pickup_date + (a.pickup_time || "")).localeCompare(b.pickup_date + (b.pickup_time || "")))
    .slice(0, 10);

  return (
    <Screen
      title="Today"
      action={<Link to="/settings" className="btn-quiet">Shop</Link>}
    >
      {newCount > 0 && (
        <Link to="/requests" className="card flex justify-between items-center bg-accent-soft border-accent/30">
          <span className="font-bold text-accent">{newCount} new request{newCount === 1 ? "" : "s"}</span>
          <span className="text-accent font-bold">Review ›</span>
        </Link>
      )}
      {saysPaid.map((o) => (
        <Link key={o.id} to={`/orders/${o.id}`} className="card flex justify-between items-center gap-3">
          <span className="text-sm"><b>{o.customer?.name}</b> says they sent the deposit. Check and record it.</span>
          <span className="text-accent font-bold">›</span>
        </Link>
      ))}
      <WeekMeter label="This week" start={thisWeek} used={byWeek[thisWeek] || 0} limit={bakery.weekly_capacity} />
      <WeekMeter label="Next week" start={nextWeek} used={byWeek[nextWeek] || 0} limit={bakery.weekly_capacity} />
      {laterWeeks.map((w) => (
        <WeekMeter
          key={w}
          label={`In ${Math.round((new Date(w) - new Date(thisWeek)) / (7 * 86400000))} weeks`}
          start={w}
          used={byWeek[w]}
          limit={bakery.weekly_capacity}
        />
      ))}
      <span className="lbl mt-2">Coming up</span>
      {coming.length === 0 ? (
        <Empty title="Nothing booked yet">
          Share your order link to get requests. Find it in <Link className="text-accent font-semibold" to="/settings">Shop settings</Link>.
        </Empty>
      ) : (
        coming.map((o) => {
          const status = effectiveStatus(o, now);
          const bakeToday = o.bake_date === today;
          return (
            <RowLink key={o.id} to={`/orders/${o.id}`}>
              <div className="flex justify-between items-center gap-2">
                <b className="truncate">
                  {o.pickup_date === today ? "Today" : niceDate(o.pickup_date)}
                  {o.pickup_time ? ` · ${niceTime(o.pickup_time)}` : ""}
                </b>
                {moneyChip(o, status, paid[o.id] || 0)}
              </div>
              <p className="text-sm text-muted truncate">{o.customer?.name} · {itemSummary(o.items)}</p>
              {bakeToday && <p className="text-sm font-semibold text-accent">Bake today</p>}
            </RowLink>
          );
        })
      )}
    </Screen>
  );
}
