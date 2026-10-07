import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useBakery, useBlocked, useOrders, useRefresh } from "@/lib/data";
import { addDays, checkDate, effectiveStatus, todayIn, weekStart } from "@/lib/rules";
import { niceDate, niceTime } from "@/lib/dates";
import { itemSummary } from "@/lib/labels";
import { Chip, ErrorNote, RowLink, Screen, Spinner, StatusChip } from "@/components/ui";

const ACTIVE = ["requested", "quoted", "booked", "ready", "picked_up"];

function monthDays(month) {
  // month = "YYYY-MM"; returns 6 weeks of dates starting on a Monday
  const first = `${month}-01`;
  const start = weekStart(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function shiftMonth(month, n) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export default function Calendar() {
  const { data: bakery } = useBakery();
  const orders = useOrders(bakery?.id);
  const blocked = useBlocked(bakery?.id);
  const refresh = useRefresh();
  const today = todayIn(bakery.timezone);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [error, setError] = useState("");
  if (orders.isLoading || blocked.isLoading) return <Screen title="Calendar"><Spinner /></Screen>;

  const now = new Date();
  const list = (orders.data || []).map((o) => ({ ...o, _status: effectiveStatus(o, now) })).filter((o) => ACTIVE.includes(o._status));
  const blocks = blocked.data || [];
  const blockFor = (d) => blocks.find((b) => d >= b.date && d <= (b.end_date || b.date));
  const dayState = (d) =>
    checkDate({ bakery: { ...bakery, accepting_orders: true, lead_days: 0 }, orders: list, blocked: blocks, date: d, spots: 1, today, now });
  const pickups = (d) => list.filter((o) => o.pickup_date === d);
  const bakes = (d) => list.filter((o) => o.bake_date === d && o.pickup_date !== d && ["booked", "ready"].includes(o._status));

  const dayOrders = pickups(selected).sort((a, b) => (a.pickup_time || "").localeCompare(b.pickup_time || ""));
  const dayBakes = bakes(selected);
  const selBlock = blockFor(selected);
  const selState = dayState(selected);

  async function toggleBlock() {
    setError("");
    try {
      if (selBlock) {
        if (selBlock.end_date && selBlock.end_date !== selBlock.date) {
          return setError("This day is part of a longer block. Remove it in Shop settings.");
        }
        await base44.entities.BlockedDate.delete(selBlock.id);
      } else {
        await base44.entities.BlockedDate.create({ bakery_id: bakery.id, date: selected, reason: "Day off" });
      }
      await refresh("blocked");
    } catch (e) {
      setError(e?.message || "Couldn’t change this day.");
    }
  }

  return (
    <Screen
      title={niceDate(`${month}-01`, "MMMM yyyy")}
      action={
        <div className="flex">
          <button className="btn-quiet" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
          <button className="btn-quiet" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
        </div>
      }
    >
      <div className="grid grid-cols-7 gap-1 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} className="lbl">{d}</span>)}
        {monthDays(month).map((d) => {
          const inMonth = d.startsWith(month);
          const count = pickups(d).length;
          const state = dayState(d);
          const isSel = d === selected;
          return (
            <button
              key={d}
              onClick={() => setSelected(d)}
              aria-pressed={isSel}
              aria-label={`${niceDate(d, "EEEE MMM d")}${count ? `, ${count} pickup${count === 1 ? "" : "s"}` : ""}${state ? `, ${state}` : ""}`}
              className={[
                "rounded-xl border py-2 flex flex-col items-center gap-0.5 min-h-[52px] tabular",
                isSel ? "bg-accent text-accent-ink border-accent" : "bg-surface border-line",
                !isSel && state ? "hatched" : "",
                !inMonth ? "opacity-40" : "",
                d === today && !isSel ? "border-accent" : "",
              ].join(" ")}
            >
              <span className={`text-sm ${d === today ? "font-extrabold" : ""}`}>{Number(d.slice(8))}</span>
              {count > 0 && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? "bg-accent-ink" : "bg-accent"}`} />}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted">Hatched days are full or blocked. The order form won’t offer them.</p>

      <div className="flex justify-between items-center mt-2">
        <span className="lbl">
          {niceDate(selected, "EEEE, MMM d")}
          {selState === "full" ? " · full" : selState === "blocked" ? " · day off" : ""}
        </span>
        <button className="btn-quiet -mr-3" onClick={toggleBlock}>{selBlock ? "Open this day" : "Block this day"}</button>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {dayOrders.length === 0 && dayBakes.length === 0 && <p className="text-sm text-muted">Nothing on this day.</p>}
      {dayBakes.map((o) => (
        <RowLink key={`bake-${o.id}`} to={`/orders/${o.id}`}>
          <div className="flex justify-between items-center gap-2"><b>Bake for {niceDate(o.pickup_date)}</b><Chip tone="warn">Bake</Chip></div>
          <p className="text-sm text-muted truncate">{o.customer?.name} · {itemSummary(o.items)}</p>
        </RowLink>
      ))}
      {dayOrders.map((o) => (
        <RowLink key={o.id} to={`/orders/${o.id}`}>
          <div className="flex justify-between items-center gap-2">
            <b className="truncate">{o.pickup_time ? niceTime(o.pickup_time) : "Pickup"} · {o.customer?.name}</b>
            <StatusChip status={o._status} />
          </div>
          <p className="text-sm text-muted truncate">{itemSummary(o.items)}{o.spots > 1 ? ` · counts as ${o.spots}` : ""}</p>
        </RowLink>
      ))}
    </Screen>
  );
}
