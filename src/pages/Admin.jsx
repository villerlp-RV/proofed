import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { shopLink } from "@/lib/data";
import { niceDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Chip, Empty, ErrorNote, Screen, Spinner, StatusChip } from "@/components/ui";

async function callAdmin(payload = {}) {
  try {
    const res = await base44.functions.invoke("adminOverview", payload);
    if (res?.data?.error) throw new Error(res.data.error);
    return res.data;
  } catch (e) {
    const msg = e?.response?.data?.error || e?.data?.error || e?.message;
    throw new Error(msg && !/status code/i.test(msg) ? msg : "Couldn’t reach the server. Try again.");
  }
}

function Stat({ label, value, note }) {
  return (
    <div className="card flex flex-col gap-0.5 min-w-0">
      <span className="lbl">{label}</span>
      <span className="font-display text-2xl font-extrabold tabular truncate">{value}</span>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}

function ShopCard({ shop, onToggle, busy }) {
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <b className="block truncate">{shop.name}</b>
          <a className="text-sm text-accent break-all" href={shopLink(shop.slug)} target="_blank" rel="noreferrer">/b/{shop.slug}</a>
        </div>
        {shop.accepting_orders ? <Chip tone="ok">Taking orders</Chip> : <Chip tone="mute">Paused</Chip>}
      </div>
      <p className="text-sm text-muted break-all">
        {shop.owner_name ? `${shop.owner_name} · ` : ""}{shop.owner_email || "Unknown baker"} · joined {niceDate(shop.created_date?.slice(0, 10), "MMM d, yyyy")}
      </p>
      <div className="grid grid-cols-4 gap-2 text-center tabular">
        {[
          ["Orders", shop.orders_total],
          ["Last 30d", shop.orders_30d],
          ["New", shop.open_requests],
          ["Paid 30d", formatCents(shop.payments_30d_cents).replace(/\.00$/, "")],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-bg py-1.5">
            <div className="font-bold text-[15px]">{v}</div>
            <div className="text-[11px] text-muted">{l}</div>
          </div>
        ))}
      </div>
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted">
          {shop.last_order_date ? `Last order ${niceDate(shop.last_order_date.slice(0, 10), "MMM d")}` : "No orders yet"}
        </span>
        <button type="button" className="btn-quiet -mr-3 text-sm" disabled={busy} onClick={() => onToggle(shop)}>
          {shop.accepting_orders ? "Pause shop" : "Resume shop"}
        </button>
      </div>
    </div>
  );
}

export default function Admin() {
  const qc = useQueryClient();
  const overview = useQuery({ queryKey: ["admin"], queryFn: () => callAdmin(), retry: false });
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  if (overview.isLoading) return <Screen title="Admin" back="/" tabs={false}><Spinner /></Screen>;
  if (overview.error) {
    return (
      <Screen title="Admin" back="/" tabs={false}>
        <Empty title="Can’t open the admin page">{overview.error.message}</Empty>
      </Screen>
    );
  }

  const { totals, shops, recent_orders, generated_at } = overview.data;
  const q = search.trim().toLowerCase();
  const shown = q
    ? shops.filter((s) => [s.name, s.slug, s.owner_email, s.owner_name].some((v) => (v || "").toLowerCase().includes(q)))
    : shops;

  async function toggle(shop) {
    setError("");
    setBusyId(shop.id);
    try {
      await callAdmin({ action: "setAccepting", bakery_id: shop.id, accepting: !shop.accepting_orders });
      await qc.invalidateQueries({ queryKey: ["admin"] });
      await qc.invalidateQueries({ queryKey: ["bakery"] });
    } catch (e) {
      setError(e.message);
    }
    setBusyId(null);
  }

  return (
    <Screen
      title="Admin"
      back="/"
      tabs={false}
      action={<button type="button" className="btn-quiet -mr-3" onClick={() => overview.refetch()}>Refresh</button>}
    >
      <p className="text-xs text-muted">Everything across Proofed. Updated {new Date(generated_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.</p>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Shops" value={totals.shops} note={`${totals.active_shops_30d} with orders in 30 days`} />
        <Stat label="Signed-up users" value={totals.users} note={`${totals.bakers} have a shop`} />
        <Stat label="Orders, 30 days" value={totals.orders_30d} note={`${totals.open_requests} waiting for a quote`} />
        <Stat label="Paid, 30 days" value={formatCents(totals.payments_30d_cents)} note="As recorded by bakers" />
      </div>

      <div className="flex justify-between items-center mt-2">
        <span className="lbl">Shops</span>
      </div>
      <input
        id="admin-search"
        className="input"
        placeholder="Search by shop, link or email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <ErrorNote>{error}</ErrorNote>
      {shown.length === 0 ? (
        <Empty title={shops.length ? "No matches" : "No shops yet"}>
          {shops.length ? "Try a different search." : "Shops appear here as bakers sign up."}
        </Empty>
      ) : (
        shown.map((s) => <ShopCard key={s.id} shop={s} busy={busyId === s.id} onToggle={toggle} />)
      )}

      <span className="lbl mt-2">Latest orders</span>
      {recent_orders.length === 0 && <p className="text-sm text-muted">No orders yet.</p>}
      {recent_orders.length > 0 && (
        <div className="card flex flex-col divide-y divide-line py-1">
          {recent_orders.map((o) => (
            <div key={o.id} className="flex justify-between items-center gap-2 py-2">
              <div className="min-w-0">
                <p className="text-[15px] truncate"><b>{o.bakery_name}</b> · {o.customer_name}</p>
                <p className="text-xs text-muted">
                  Sent {niceDate(o.created_date?.slice(0, 10), "MMM d")} · pickup {niceDate(o.pickup_date, "MMM d")}
                  {o.total_cents != null ? ` · ${formatCents(o.total_cents)}` : ""}
                </p>
              </div>
              <StatusChip status={o.status} />
            </div>
          ))}
        </div>
      )}
    </Screen>
  );
}
