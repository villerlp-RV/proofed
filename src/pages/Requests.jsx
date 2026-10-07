import { useState } from "react";
import { useBakery, useOrders } from "@/lib/data";
import { effectiveStatus } from "@/lib/rules";
import { niceDate } from "@/lib/dates";
import { itemSummary } from "@/lib/labels";
import { Empty, RowLink, Screen, Spinner, StatusChip } from "@/components/ui";

const GROUPS = [
  ["new", "New", ["requested"]],
  ["quoted", "Quoted", ["quoted"]],
  ["past", "Declined & expired", ["declined", "expired", "cancelled"]],
];

export default function Requests() {
  const { data: bakery } = useBakery();
  const orders = useOrders(bakery?.id);
  const [tab, setTab] = useState("new");
  if (orders.isLoading) return <Screen title="Requests"><Spinner /></Screen>;

  const now = new Date();
  const withStatus = (orders.data || []).map((o) => ({ ...o, _status: effectiveStatus(o, now) }));
  const count = (statuses) => withStatus.filter((o) => statuses.includes(o._status)).length;
  const statuses = GROUPS.find((g) => g[0] === tab)[2];
  const list = withStatus.filter((o) => statuses.includes(o._status));

  return (
    <Screen title="Requests">
      <div className="flex gap-2 flex-wrap" role="tablist">
        {GROUPS.map(([key, label, sts]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-xl px-3 py-1.5 text-sm border ${tab === key ? "border-accent bg-accent-soft text-accent font-bold" : "border-line bg-surface"}`}
          >
            {label} <span className="tabular">{count(sts) || ""}</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty title={tab === "new" ? "No new requests" : "Nothing here"}>
          {tab === "new" ? "When a customer fills in your order form, it shows up here." : "Orders move here as you quote or decline them."}
        </Empty>
      ) : (
        list.map((o) => (
          <RowLink key={o.id} to={`/orders/${o.id}`}>
            <div className="flex gap-3">
              {o.photo_urls?.[0] && <img src={o.photo_urls[0]} alt="" className="w-16 h-16 rounded-xl object-cover flex-none" />}
              <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                <div className="flex justify-between gap-2 items-center">
                  <b className="truncate">{o.customer?.name}</b>
                  <StatusChip status={o._status} />
                </div>
                <p className="text-sm text-muted truncate">{itemSummary(o.items)} · {niceDate(o.pickup_date)}</p>
                {o.items?.[0]?.design_notes && <p className="text-sm text-muted truncate">“{o.items[0].design_notes}”</p>}
              </div>
            </div>
          </RowLink>
        ))
      )}
    </Screen>
  );
}
